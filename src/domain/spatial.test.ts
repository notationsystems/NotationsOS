import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changeText, depthText, formatSelection, graphLayout, meanDepthText, parseSelection, passagesOf, planGeometry, readComparison, readInspection, spaceReadings, type InspectedAnalysis } from './spatial';

const example = (name: string) => JSON.parse(readFileSync(join(process.cwd(), 'examples', 'spatial', `${name}.json`), 'utf8'));
const baseline = () => readInspection(example('baselineAnalysis'));
const scenario = () => readInspection(example('scenarioAnalysis'));

describe('the spatial inquiry as data', () => {
  it('reads the retained example projections and refuses anything outside the v1 contract', () => {
    const analysis = baseline();
    expect(analysis.projection.sourceKind).toBe('LOCAL_ANALYSIS');
    expect(analysis.projection.layout.spaces.map((space) => space.id)).toEqual(['S-1', 'S-2', 'S-3', 'S-4', 'S-5']);
    const tampered = structuredClone(example('baselineAnalysis')) as { projection: Record<string, unknown> };
    tampered.projection.canonicalAdmission = true;
    expect(() => readInspection(tampered)).toThrow(/v1 contract/);
    const foreign = structuredClone(example('baselineAnalysis')) as { projection: { sourceKind: string } };
    foreign.projection.sourceKind = 'CORPUS_RELEASE';
    expect(() => readInspection(foreign)).toThrow(/v1 contract/);
    const short = structuredClone(example('baselineAnalysis')) as { projection: { result: { confirmed: { spaces: unknown[] } } } };
    short.projection.result.confirmed.spaces.pop();
    expect(() => readInspection(short)).toThrow(/v1 contract/);
    expect(readComparison(example('comparison')).changes.map((change) => change.id)).toEqual(['S-3', 'S-4', 'S-5']);
    expect(() => readComparison({ schema: 'payload.spatial-comparison.v1', changes: 'none' })).toThrow(/v1 contract/);
  });

  it('draws a depth as a number, unknown or unreachable: null is never zero', () => {
    expect(depthText(0, 0)).toEqual({ confirmed: '0', possible: '0' });
    expect(depthText(2, 2)).toEqual({ confirmed: '2', possible: '2' });
    expect(depthText(null, 4)).toEqual({ confirmed: 'unknown', possible: '4' });
    expect(depthText(null, null)).toEqual({ confirmed: 'unreachable', possible: 'unreachable' });
    const readings = spaceReadings(baseline().projection);
    expect(readings.map((reading) => `${reading.id}:${depthText(reading.confirmedDepth, reading.possibleDepth).confirmed}/${depthText(reading.confirmedDepth, reading.possibleDepth).possible}:${reading.status}`)).toEqual([
      'S-1:0/0:CONFIRMED', 'S-2:1/1:CONFIRMED', 'S-3:2/2:CONFIRMED', 'S-4:3/3:CONFIRMED', 'S-5:unknown/4:POSSIBLE_ONLY',
    ]);
    expect(spaceReadings(scenario().projection).slice(2).map((reading) => reading.status)).toEqual(['DISCONNECTED', 'DISCONNECTED', 'DISCONNECTED']);
  });

  it('shows every mean with its denominator, so a smaller mean after a closure is not read as improved access', () => {
    expect(meanDepthText(baseline().projection.result.confirmed)).toBe('2 over 3 reachable non-root spaces');
    expect(meanDepthText(baseline().projection.result.possible)).toBe('2.5 over 4 reachable non-root spaces');
    expect(meanDepthText(scenario().projection.result.confirmed)).toBe('1 over 1 reachable non-root space');
    expect(meanDepthText({ meanDepth: null, meanDepthDenominator: 0 })).toMatch(/^none/);
    const change = readComparison(example('comparison')).changes[2];
    expect(changeText(change)).toBe('POSSIBLE_ONLY (confirmed unknown, possible 4) → DISCONNECTED (confirmed unreachable, possible unreachable)');
  });

  it('flips validated polygons for the screen and draws passages between centres without inferring any', () => {
    const plan = planGeometry(baseline().projection.layout);
    expect(plan.units).toBe('m');
    expect(plan.padding).toBeCloseTo(24 * 0.06, 6);
    expect(plan.viewBox).toBe('-1.44 -1.44 26.88 6.88');
    expect(plan.spaces[0].points).toBe('0,4 4,4 4,0 0,0');
    expect(plan.spaces[0].centre).toEqual([2, 2]);
    expect(plan.spaces[4].centre).toEqual([22, 2]);
    expect(plan.extent).toBe(24);
    expect(plan.passages.map((passage) => passage.id)).toEqual(['P-01', 'P-07', 'P-08', 'P-09']);
    // Drawn from the boundary of one room to the boundary of the other: a doorway between them, never a line through the labels.
    expect(plan.passages[0]).toMatchObject({ from: 'S-1', to: 'S-2', a: [4, 2], b: [5, 2] });
    expect(plan.passages[3]).toMatchObject({ from: 'S-4', to: 'S-5', a: [19, 2], b: [20, 2] });
    // Rooms that overlap fall back to centre-to-centre rather than inventing a doorway.
    const overlapping = structuredClone(baseline().projection.layout);
    overlapping.spaces[1].polygon = [[2, 0], [6, 0], [6, 4], [2, 4]];
    expect(planGeometry(overlapping).passages[0]).toMatchObject({ a: [2, 2], b: [4, 2] });
    expect(plan.undrawn).toEqual([]);
    const partial = structuredClone(baseline().projection.layout);
    partial.spaces[2].polygon = null;
    const withoutStudio = planGeometry(partial);
    expect(withoutStudio.undrawn).toEqual(['S-3']);
    expect(withoutStudio.passages[1].b).toBeNull();
    expect(withoutStudio.spaces[2].points).toBeNull();
  });

  it('lays the graph out in depth columns with disconnected spaces last, as a reading order', () => {
    const before = graphLayout(baseline().projection);
    expect(before.nodes.map((node) => `${node.id}@${node.column}`)).toEqual(['S-1@0', 'S-2@1', 'S-3@2', 'S-4@3', 'S-5@4']);
    expect(before.columns.map((column) => column.label)).toEqual(['depth 0 · root', 'depth 1', 'depth 2', 'depth 3', 'depth 4']);
    expect(before.edges.map((edge) => `${edge.id}:${edge.effectiveState}`)).toEqual(['P-01:OPEN', 'P-07:OPEN', 'P-08:OPEN', 'P-09:UNKNOWN']);
    const after = graphLayout(scenario().projection);
    expect(after.nodes.map((node) => `${node.id}@${node.column}`)).toEqual(['S-1@0', 'S-2@1', 'S-3@2', 'S-4@2', 'S-5@2']);
    expect(after.columns.map((column) => column.label)).toEqual(['depth 0 · root', 'depth 1', 'disconnected']);
    expect(after.edges.find((edge) => edge.id === 'P-07')).toMatchObject({ declaredState: 'OPEN', effectiveState: 'CLOSED', assumed: true });
    expect(after.nodes.filter((node) => node.column === 2).map((node) => node.row)).toEqual([0, 1, 2]);
    expect(after.width).toBeGreaterThan(after.nodes[4].x);
    expect(after.height).toBeGreaterThan(after.nodes[4].y);
  });

  it('names the passages of a space and carries the selection in a link it ignores when malformed', () => {
    expect(passagesOf(baseline().projection.result, 'S-3').map((passage) => passage.id)).toEqual(['P-07', 'P-08']);
    expect(passagesOf(baseline().projection.result, 'S-1').map((passage) => passage.id)).toEqual(['P-01']);
    expect(formatSelection('S-3')).toBe('space=S-3');
    expect(parseSelection('#space=S-3')).toBe('S-3');
    expect(parseSelection('space=S-3')).toBe('S-3');
    for (const bad of ['', '#', '#S-3', '#space=', '#space=S 3', '#space=S-3&x=1', '#room=S-3', `#space=${'a'.repeat(97)}`]) expect(parseSelection(bad), bad).toBeNull();
  });
});

export type { InspectedAnalysis };
