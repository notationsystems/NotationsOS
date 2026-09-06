import { describe, expect, it } from 'vitest';
import { buildObservationReplayPreview } from '@/observation/preview';
import { BLOCKER_MEANING, DISTINCTIONS, LIMITATION_MEANING, comparisonsFor, diagramLayout, distinctionsFor, formatNs, formatTransform, frameChain, timelineModel } from './observationReplay';

const preview = buildObservationReplayPreview();
const { manifest, computation } = preview;
const row = (id: string) => computation.rows.find((r) => r.observationId === id)!;

describe('the observation replay preview', () => {
  it('is an in-memory synthetic preview that the contract accepts, with the support failures the contract can express added for the preview only', () => {
    expect(preview.mode).toBe('IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED');
    expect(manifest.evidenceClass).toBe('SYNTHETIC_TEST');
    expect(computation.evidenceClass).toBe('SYNTHETIC_TEST');
    expect(computation).toMatchObject({ canonicalAdmission: false, earthProjectionEligible: false, sensorFusionPerformed: false, objectIdentityEstablished: false, accuracyEstablished: false });
    expect(computation.rows).toHaveLength(10);
    const states = Object.fromEntries(computation.rows.map((r) => [r.observationId, `${r.state}:${r.blockers.join('+')}`]));
    expect(states['session-a-LIDAR-observation']).toBe('PLACED_ESTIMATE:');
    expect(states['session-b-CAMERA-observation']).toBe('PLACED_ESTIMATE:');
    expect(states['session-a-GNSS-observation']).toBe('UNPLACED:NO_POINT_ESTIMATE');
    expect(states['session-b-RADAR-observation']).toBe('UNPLACED:CALIBRATION_NOT_VALID_AT_OBSERVATION+POSE_TIME_MISMATCH');
    expect(states['session-b-drift-LIDAR-observation']).toBe('UNPLACED:CALIBRATION_NOT_VALID_AT_OBSERVATION+CLOCK_ALIGNMENT_UNAVAILABLE+POINT_TIME_UNRESOLVED+POSE_CLOCK_ALIGNMENT_UNAVAILABLE');
    expect(row('session-b-RADAR-observation').poseDeltaNs).toBe('10000000');
    expect(preview.artifact.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.observations.every((o) => o.rawArtifact.contentDigest === preview.artifact.contentDigest)).toBe(true);
  });

  it('names every blocker and limitation the computation emits, and keeps the distinctions closed', () => {
    for (const code of computation.rows.flatMap((r) => r.blockers)) expect(BLOCKER_MEANING[code], code).toBeDefined();
    for (const code of computation.comparisons.flatMap((c) => [...c.blockers, ...c.limitations])) expect((BLOCKER_MEANING[code] ?? LIMITATION_MEANING[code]), code).toBeDefined();
    expect(Object.keys(DISTINCTIONS)).toEqual(['SYNTHETIC_INPUT', 'RECORDED_INPUT', 'SUPPLIED_ESTIMATE', 'NO_ESTIMATE', 'PLACED_ESTIMATE', 'UNRESOLVED_PLACEMENT', 'RESIDUAL_ONLY']);
    expect(distinctionsFor(manifest, row('session-a-LIDAR-observation'))).toEqual(['SYNTHETIC_INPUT', 'SUPPLIED_ESTIMATE', 'PLACED_ESTIMATE']);
    expect(distinctionsFor(manifest, row('session-a-GNSS-observation'))).toEqual(['SYNTHETIC_INPUT', 'NO_ESTIMATE']);
    expect(distinctionsFor(manifest, row('session-b-RADAR-observation'))).toEqual(['SYNTHETIC_INPUT', 'SUPPLIED_ESTIMATE', 'UNRESOLVED_PLACEMENT']);
  });

  it('derives the frame chain of a supplied point with each link judged at the observation’s aligned time', () => {
    const placed = frameChain(manifest, row('session-a-LIDAR-observation'));
    expect(placed.map((s) => [s.role, s.id, s.state])).toEqual([['SENSOR', 'session-a-LIDAR-frame', 'FRAME'], ['CALIBRATION', 'session-a-LIDAR-calibration', 'VALID'], ['BODY', 'session-a-body', 'FRAME'], ['POSE', 'session-a-pose', 'VALID'], ['WORLD', 'world', 'FRAME']]);
    expect(formatTransform(placed[1].transform!)).toBe('t = (1, 0, 0) m · q(xyzw) = (0, 0, 0, 1)');
    const radar = frameChain(manifest, row('session-b-RADAR-observation'));
    expect(radar.map((s) => s.state)).toEqual(['FRAME', 'INVALID', 'FRAME', 'INVALID', 'FRAME']);
    expect(radar[1].detail).toContain('not valid at the observation');
    expect(radar[3].detail).toContain('10 ms (10000000 ns) from the observation');
    const drift = frameChain(manifest, row('session-b-drift-LIDAR-observation'));
    expect(drift.map((s) => s.state)).toEqual(['FRAME', 'UNAVAILABLE', 'FRAME', 'UNAVAILABLE', 'FRAME']);
    const gnss = frameChain(manifest, row('session-a-GNSS-observation'));
    expect(gnss.map((s) => s.state)).toEqual(['FRAME', 'UNAVAILABLE', 'FRAME', 'UNAVAILABLE', 'FRAME']);
    expect(gnss[1].id).toBe('(none)');
  });

  it('lays the diagram out in three columns and activates only the selected chain', () => {
    const idle = diagramLayout(manifest, null);
    expect(idle.nodes.filter((n) => n.column === 0)).toHaveLength(manifest.sensors.length);
    expect(idle.nodes.filter((n) => n.column === 1).map((n) => n.id)).toEqual(['session-a-body', 'session-b-body']);
    expect(idle.nodes.filter((n) => n.column === 2).map((n) => n.id)).toEqual(['world']);
    expect(idle.edges.filter((e) => e.kind === 'CALIBRATION')).toHaveLength(manifest.calibrations.length);
    expect(idle.edges.filter((e) => e.kind === 'POSE')).toHaveLength(manifest.poses.length);
    expect(idle.nodes.every((n) => !n.active) && idle.edges.every((e) => e.state === 'IDLE')).toBe(true);
    const selected = diagramLayout(manifest, row('session-b-RADAR-observation'));
    expect(selected.nodes.filter((n) => n.active).map((n) => n.id).sort()).toEqual(['session-b-RADAR-frame', 'session-b-body', 'world']);
    expect(selected.edges.find((e) => e.id === 'session-b-RADAR-calibration')?.state).toBe('INVALID');
    expect(selected.edges.find((e) => e.id === 'session-b-late-pose')?.state).toBe('INVALID');
    expect(selected.edges.find((e) => e.id === 'session-a-pose')?.state).toBe('IDLE');
    for (const node of selected.nodes) { expect(node.x).toBeGreaterThan(0); expect(node.y).toBeGreaterThan(0); expect(node.y).toBeLessThan(selected.height); }
  });

  it('puts every aligned instant on the declared timeline with exact nanoseconds beside it, brackets a pose mismatch, and lists the unaligned observation on its own clock', () => {
    const timeline = timelineModel(manifest, computation);
    expect(timeline.timelineId).toBe('test-timeline');
    expect(timeline.originNs).toBe('1600000000000000000');
    expect(timeline.spanSeconds).toBe(10);
    expect(timeline.windows.filter((w) => w.kind === 'CLOCK')).toHaveLength(2);
    expect(timeline.windows.filter((w) => w.kind === 'CALIBRATION').find((w) => w.id === 'session-b-RADAR-calibration')).toMatchObject({ fromSeconds: 0, untilSeconds: 0.5 });
    expect(timeline.ticks.filter((t) => t.kind === 'OBSERVATION')).toHaveLength(9);
    expect(timeline.ticks.find((t) => t.id === 'session-b-RADAR-observation')).toMatchObject({ seconds: expect.closeTo(1.000000001, 9), exactNs: '1600000001000000001', state: 'UNPLACED' });
    expect(timeline.ticks.filter((t) => t.kind === 'POSE').map((t) => t.id).sort()).toEqual(['session-a-pose', 'session-b-late-pose', 'session-b-pose']);
    expect(timeline.mismatches).toEqual([{ observationId: 'session-b-RADAR-observation', poseId: 'session-b-late-pose', fromSeconds: expect.closeTo(1.000000001, 9), toSeconds: expect.closeTo(1.010000001, 9), deltaNs: '10000000', lane: 'observations · session-b' }]);
    expect(timeline.unaligned).toEqual([{ observationId: 'session-b-drift-LIDAR-observation', clockId: 'session-b-drift-clock', basis: 'DEVICE_MONOTONIC', timeNs: '4242' }]);
    expect(timeline.lanes).toContain('observations · session-a');
    // Five session-b observations share one nanosecond: they fan out in their lane, each keeping the exact instant.
    const cluster = timeline.ticks.filter((t) => t.lane === 'observations · session-b' && t.exactNs === '1600000001000000001');
    expect(cluster).toHaveLength(5);
    expect(cluster.map((t) => t.stack).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(cluster.every((t) => t.stackSize === 5)).toBe(true);
    expect(timeline.laneStacks['observations · session-b']).toBe(5);
    expect(timeline.laneStacks['poses · session-b']).toBe(1);
    expect(timeline.ticks.find((t) => t.id === 'session-a-pose')).toMatchObject({ stack: 0, stackSize: 1 });
  });

  it('formats nanoseconds exactly and humanly, and finds an observation’s comparisons', () => {
    expect(formatNs('10000000')).toEqual({ exact: '10000000', human: '10 ms' });
    expect(formatNs('-10000000').human).toBe('-10 ms');
    expect(formatNs('1600000001000000001').human).toBe('1600000001.000 s');
    expect(formatNs('4242').human).toBe('4.242 µs');
    expect(formatNs('42').human).toBe('42 ns');
    const mine = comparisonsFor(computation, 'session-a-LIDAR-observation');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((c) => c.leftObservationId === 'session-a-LIDAR-observation' || c.rightObservationId === 'session-a-LIDAR-observation')).toBe(true);
    const residual = computation.comparisons.find((c) => c.leftObservationId === 'session-a-LIDAR-observation' && c.rightObservationId === 'session-b-LIDAR-observation');
    expect(residual).toMatchObject({ state: 'RESIDUAL_ONLY', crossSession: true, accuracyEstablished: false, distanceM: 0 });
    const unresolved = computation.comparisons.find((c) => c.rightObservationId === 'session-b-RADAR-observation' || c.leftObservationId === 'session-b-RADAR-observation');
    expect(unresolved).toMatchObject({ state: 'UNRESOLVED', blockers: ['POSITION_UNAVAILABLE'] });
  });
});
