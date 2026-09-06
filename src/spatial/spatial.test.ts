import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyze, compare } from './analysis';
import { digest, parseLayout } from './contracts';
import { preserveFixture, FIXTURE_TIME } from './fixture';
import { SpatialAnalysisService } from './service';

const roots: string[] = [];
function setup() { const root = mkdtempSync(join(tmpdir(), 'spatial-test-')); roots.push(root); return { root, ...preserveFixture(root) }; }
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
describe('bounded room-access analysis', () => {
  it('computes known depths, unique neighbor counts and explicit unknown access', () => {
    const { layout, baseline } = setup(), result = analyze(layout, baseline);
    expect(result.confirmed.spaces.map(s => s.depth)).toEqual([0, 1, 2, 3, null]);
    expect(result.possible.spaces.map(s => s.depth)).toEqual([0, 1, 2, 3, 4]);
    expect(result.confirmed.meanDepth).toBe(2); expect(result.possible.meanDepth).toBe(2.5);
    expect(result.confirmed.spaces[1].outgoingNeighbors).toBe(2);
    expect(result.coverage.unresolvedPassageIds).toEqual(['P-09']);
    expect(result.reachability[4].status).toBe('POSSIBLE_ONLY');
  });
  it('closing a bridge disconnects the expected rooms without mutating evidence', () => {
    const { layout, baseline, scenario } = setup(), before = JSON.stringify(layout);
    const a = analyze(layout, baseline), b = analyze(layout, scenario);
    expect(b.confirmed.unreachableIds).toEqual(['S-3', 'S-4', 'S-5']);
    expect(b.possible.unreachableIds).toEqual(['S-3', 'S-4', 'S-5']);
    expect(b.coverage.unresolvedPassageIds).toEqual(['P-09']);
    expect(compare(a, b).changes.map(s => s.id)).toEqual(['S-3', 'S-4', 'S-5']);
    expect(JSON.stringify(layout)).toBe(before);
  });
  it('is record-order invariant and drawing-independent while retaining source identity distinctions', () => {
    const { layout, baseline } = setup(), a = analyze(layout, baseline);
    const shuffled = structuredClone(layout); shuffled.spaces.reverse(); shuffled.passages.reverse();
    expect(analyze(shuffled, baseline)).toEqual(a);
    const translated = structuredClone(layout); translated.spaces.forEach(s => s.polygon?.forEach(p => { p[0] += 100; p[1] -= 50; }));
    const moved = analyze(translated, baseline);
    expect(moved.confirmed).toEqual(a.confirmed); expect(moved.possible).toEqual(a.possible); expect(moved.layoutDigest).not.toBe(a.layoutDigest);
  });
  it('honors direction, conditions and scenario assumptions without treating unknown as open', () => {
    const { layout, baseline } = setup(); layout.passages[0].direction = 'FROM_TO';
    const back = analyze(layout, { ...baseline, rootSpaceId: 'S-2' }); expect(back.possible.spaces[0].depth).toBeNull();
    layout.passages[1].conditions = [{ id: 'permission', state: 'UNKNOWN' }];
    expect(analyze(layout, baseline).confirmed.spaces[2].depth).toBeNull();
    const scenario = { schema: 'payload.spatial-scenario.v1' as const, baselineLayoutDigest: digest(parseLayout(layout)), passageId: 'P-07', assumedState: 'OPEN' as const, provenance: { kind: 'SCENARIO_ASSUMPTION' as const, author: 'test', note: 'Opening does not grant permission', sourceIds: [] } };
    expect(analyze(layout, { ...baseline, scenario }).passages[1].effectiveState).toBe('UNKNOWN');
    layout.passages[1].conditions[0].state = 'UNSATISFIED';
    expect(analyze(layout, baseline).possible.spaces[2].depth).toBeNull();
  });
  it('never infers a passage from touching polygons; handles isolated roots', () => {
    const { layout, baseline } = setup(); layout.passages = [];
    layout.spaces[1].polygon = layout.spaces[0].polygon;
    const result = analyze(layout, baseline); expect(result.confirmed.reachableCount).toBe(1); expect(result.confirmed.meanDepth).toBeNull();
  });
  it('rejects malformed, dangling and unsupported layouts and mismatched scenarios', () => {
    const { layout, baseline, scenario } = setup();
    expect(() => parseLayout({ ...layout, spaces: [...layout.spaces, layout.spaces[0]] })).toThrow();
    expect(() => parseLayout({ ...layout, unexpected: true })).toThrow();
    layout.passages[0].to = 'missing'; expect(() => analyze(layout, baseline)).toThrow();
    const fresh = setup(); scenario.scenario!.baselineLayoutDigest = `sha256:${'0'.repeat(64)}`;
    expect(() => analyze(fresh.layout, scenario)).toThrow();
  });
});
describe('saved evidence and API artifacts', () => {
  it('reloads exact bindings without computation and returns a distinct projection', () => {
    const { root, baseline, scenario } = setup(), compute = vi.fn(analyze), service = new SpatialAnalysisService(root, () => FIXTURE_TIME, compute);
    const first = service.submit(baseline); service.submit(scenario); expect(compute).toHaveBeenCalledTimes(2);
    expect(service.submit(baseline).status).toBe('EXISTING');
    const reopened = new SpatialAnalysisService(root, () => '2030-01-01T00:00:00.000Z', () => { throw new Error('Must not run'); }).inspect(baseline.requestId);
    expect(reopened?.receipt).toEqual(first.receipt); expect(reopened?.projection.sourceKind).toBe('LOCAL_ANALYSIS');
    expect(reopened?.receipt.result.source).toEqual(baseline.layout); expect(service.compare(baseline.requestId, scenario.requestId).changes).toHaveLength(3);
    expect(() => service.submit({ ...baseline, rootSpaceId: 'S-2' })).toThrow('different inputs');
    expect(() => service.compare(scenario.requestId, baseline.requestId)).toThrow('identical source');
  });
  it('refuses mismatched source, unauthorized purpose and interrupted execution replay', () => {
    const { root, baseline } = setup(), service = new SpatialAnalysisService(root, () => FIXTURE_TIME);
    expect(() => service.submit({ ...baseline, purpose: 'OTHER' })).toThrow('does not allow');
    const altered = structuredClone(baseline); altered.layout.evidence.contentDigest = `sha256:${'0'.repeat(64)}`;
    expect(() => service.submit(altered)).toThrow('exact retained source');
    const failing = new SpatialAnalysisService(root, () => FIXTURE_TIME, () => { throw new Error('Interrupted'); });
    expect(() => failing.submit(baseline)).toThrow('Interrupted'); expect(() => service.submit(baseline)).toThrow('reserved');
  });
});

it('detects corrupted saved results and missing original evidence without recomputation', () => {
  const { root, baseline } = setup(), service = new SpatialAnalysisService(root, () => FIXTURE_TIME);
  service.submit(baseline);
  const directory = join(root, 'spatial', 'receipts');
  const file = join(directory, readdirSync(directory)[0]);
  const original = readFileSync(file);
  const receipt = JSON.parse(original.toString('utf8'));
  receipt.result.confirmed.spaces[1].depth = 999;
  writeFileSync(file, JSON.stringify(receipt));
  expect(() => service.inspect(baseline.requestId)).toThrow('failed verification');
  writeFileSync(file, original);
  // Remove the fixture's entire content-addressed store, confined to its temp root.
  rmSync(join(root, 'objects'), { recursive: true, force: true });
  expect(() => service.inspect(baseline.requestId)).toThrow('failed verification');
});
