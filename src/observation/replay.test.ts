import { describe, expect, it } from 'vitest';
import { syntheticReplayManifest } from '../../examples/observations/synthetic-manifest';
import { manifestArtifactReferences, parseReplayManifest, type ReplayManifest } from './contract';
import { compileReplay } from './replay';
import { parseReplayJson } from './json';

const reference = { acquisitionId: 'synthetic-input', acquisitionDigest: `sha256:${'a'.repeat(64)}`, contentDigest: `sha256:${'b'.repeat(64)}` };
const fixture = () => syntheticReplayManifest(reference);
const identityMatrix = (n: number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
const row = (m: ReplayManifest, id = 'session-a-LIDAR-observation') => compileReplay(m).rows.find((r) => r.observationId === id)!;

describe('explicit recorded-observation computation', () => {
  it('retains exact ns above safe integer precision; no mutation, admission, fusion or accuracy claim', () => {
    const m = fixture(), before = structuredClone(m); const report = compileReplay(m);
    expect(m).toEqual(before);
    expect(report).toMatchObject({ evidenceClass: 'SYNTHETIC_TEST', canonicalAdmission: false, earthProjectionEligible: false,
      sensorFusionPerformed: false, objectIdentityEstablished: false, accuracyEstablished: false });
    expect(row(m)).toMatchObject({ state: 'PLACED_ESTIMATE', worldPointM: [16, 0, 0], poseDeltaNs: '0',
      alignedTime: { timeNs: '1600000000000000001', uncertaintyNs: null }, uncertainty: 'NOT_PROPAGATED' });
    expect(report.comparisons).toHaveLength(6);
    expect(report.comparisons.filter((c) => c.crossSession)).toHaveLength(4);
    expect(report.comparisons.find((c) => c.distanceM !== 0)?.distanceM).toBeCloseTo(0.05, 12);
    expect(report.comparisons.every((c) => c.state === 'RESIDUAL_ONLY' && !c.accuracyEstablished)).toBe(true);
    expect(report.rows.filter((r) => r.state === 'UNPLACED')).toHaveLength(4);
    expect(compileReplay(m)).toEqual(report);
  });
  it('preserves unknown GNSS fields; RTK fixed status never creates coordinates or guaranteed accuracy', () => {
    const m = fixture(), o = m.observations.find((o) => o.gnss)!;
    o.gnss = { rawSolutionStatus: 'synthetic receiver fixed code', receiverSolution: 'RTK_FIXED', correctionService: null, correctionAgeNs: null };
    expect(row(m, o.id)).toMatchObject({ state: 'UNPLACED', worldPointM: null, blockers: ['NO_POINT_ESTIMATE'] });
    expect(parseReplayManifest(m).observations.find((o) => o.gnss)!.gnss).toEqual(o.gnss);
  });
  it('preserves missing covariance and source-declared full covariance without propagating it', () => {
    const m = fixture(); m.poses[0].covariance6 = { convention: 'PARENT_FRAME_XYZ_METRE_ROTATION_VECTOR_RADIAN_LEFT_PERTURBATION', matrix: identityMatrix(6) };
    m.observations[0].pointEstimate!.covarianceM2 = identityMatrix(3);
    expect(parseReplayManifest(m)).toEqual(m);
    expect(row(m).uncertainty).toBe('NOT_PROPAGATED');
  });
  it('sorts timestamps numerically, ties by ID, unknown clocks last, without mutating native stamps', () => {
    const m = fixture(); m.observations.reverse();
    const result = compileReplay(m);
    expect(result.rows.slice(0, 4).map((r) => r.sessionId)).toEqual(Array(4).fill('session-a'));
    m.clocks[0].alignment = null;
    expect(compileReplay(m).rows.slice(-4).every((r) => r.alignedTime === null)).toBe(true);
  });
  it('honours an explicit GPS/UTC offset only within its declared native clock interval', () => {
    const m = fixture(); m.clocks[0].basis = 'GPS'; m.clocks[0].alignment!.offsetNs = '-18000000000';
    m.calibrations.filter((c) => c.sensorId.startsWith('session-a')).forEach((c) => {
      c.validFromNs = '1599999980000000000'; c.validUntilNs = '1600000010000000000';
    });
    expect(row(m).alignedTime?.timeNs).toBe('1599999982000000001');
    expect(row(m).state).toBe('PLACED_ESTIMATE');
    m.clocks[0].alignment!.validUntilNs = m.observations[0].stamp.timeNs;
    expect(row(m).blockers).toContain('CLOCK_ALIGNMENT_UNAVAILABLE');
  });
  it('does not interpolate or use nearest poses even at a single-nanosecond offset', () => {
    const m = fixture(); m.poses[0].stamp.timeNs = '1600000000000000002';
    expect(row(m)).toMatchObject({ state: 'UNPLACED', poseDeltaNs: '1', blockers: ['POSE_TIME_MISMATCH'] });
  });
  it('checks explicit clock timeline IDs rather than assuming equal ticks share a basis', () => {
    const m = fixture(); m.clocks.push({ ...structuredClone(m.clocks[0]), id: 'other-clock', alignment: { ...m.clocks[0].alignment!, timelineId: 'other-timeline' } });
    m.poses[0].stamp.clockId = 'other-clock';
    expect(row(m).blockers).toContain('POSE_CLOCK_ALIGNMENT_UNAVAILABLE');
  });
  it('rejects calibration at its exclusive endpoint, but permits its inclusive start', () => {
    const m = fixture(); m.calibrations[0].validFromNs = m.observations[0].stamp.timeNs;
    expect(row(m).state).toBe('PLACED_ESTIMATE');
    m.calibrations[0].validFromNs = '1600000000000000000'; m.calibrations[0].validUntilNs = m.observations[0].stamp.timeNs;
    expect(row(m).blockers).toContain('CALIBRATION_NOT_VALID_AT_OBSERVATION');
  });
  it.each(['START', 'MIDPOINT', 'END'] as const)('places only supplied exact-stamp points for %s; never deskews a scan', (meaning) => {
    const m = fixture(); m.observations[0].timestampMeaning = meaning; m.observations[0].durationNs = '100000000';
    expect(row(m).state).toBe('PLACED_ESTIMATE');
    m.observations[0].pointEstimate!.temporalSupport = 'UNRESOLVED';
    expect(row(m).blockers).toContain('POINT_TIME_UNRESOLVED');
  });
  it('refuses point placement with unknown timestamp meaning', () => {
    const m = fixture(); m.observations[0].timestampMeaning = 'UNKNOWN';
    expect(row(m).blockers).toContain('TIMESTAMP_MEANING_UNRESOLVED');
  });
  it('never compares positions in distinct world frames', () => {
    const m = fixture(); m.frames.push({ ...m.frames[0], id: 'other-world' });
    m.sessions[1].worldFrameId = 'other-world'; m.poses[1].worldFrameId = 'other-world';
    const pairs = compileReplay(m).comparisons.filter((c) => c.crossSession);
    expect(pairs.every((c) => c.state === 'UNRESOLVED' && c.distanceM === null && c.blockers.includes('WORLD_FRAME_MISMATCH'))).toBe(true);
  });
  it('keeps inter-session time differences and unmodelled motion visible beside residuals', () => {
    const cross = compileReplay(fixture()).comparisons.find((c) => c.crossSession)!;
    expect(cross).toMatchObject({ timestampDeltaNs: '1000000000', limitations: ['UNCERTAINTY_NOT_PROPAGATED', 'ASSOCIATION_UNVERIFIED', 'NO_STATIC_SCENE_OR_MOTION_MODEL'] });
  });
});

describe('closed bounded observation declaration', () => {
  const invalid: Array<[string, (m: ReplayManifest) => void]> = [
    ['duplicate IDs', (m) => m.sensors.push(m.sensors[0])],
    ['dangling sensor', (m) => { m.observations[0].sensorId = 'missing'; }],
    ['dangling clock', (m) => { m.observations[0].stamp.clockId = 'missing'; }],
    ['dangling association', (m) => { m.observations[0].pointEstimate!.associationId = 'missing'; }],
    ['dangling pose', (m) => { m.observations[0].pointEstimate!.poseId = 'missing'; }],
    ['dangling calibration', (m) => { m.observations[0].pointEstimate!.calibrationId = 'missing'; }],
    ['cross-session pose', (m) => { m.observations[0].pointEstimate!.poseId = m.poses[1].id; }],
    ['other sensor calibration', (m) => { m.observations[0].pointEstimate!.calibrationId = m.calibrations[1].id; }],
    ['inverted calibration', (m) => { m.calibrations[0].fromFrameId = m.calibrations[0].toFrameId; }],
    ['pose direction', (m) => { m.poses[0].worldFrameId = m.poses[0].bodyFrameId; }],
    ['world/body collision', (m) => { m.sessions[0].worldFrameId = m.sessions[0].bodyFrameId; }],
    ['world/sensor collision', (m) => { m.sessions[0].worldFrameId = m.sensors[4].frameId; }],
    ['GNSS on LiDAR', (m) => { m.observations[0].gnss = m.observations[2].gnss; }],
    ['GNSS fields missing', (m) => { m.observations[2].gnss = null; }],
    ['invented solution classification', (m) => { m.observations[2].gnss!.receiverSolution = 'RTK_FIXED'; }],
    ['contradictory instantaneous duration', (m) => { m.observations[0].durationNs = '1'; }],
    ['unknown instantaneous duration', (m) => { m.observations[0].durationNs = null; }],
    ['negative duration', (m) => { m.observations[0].durationNs = '-1'; }],
    ['fractional tick', (m) => { m.observations[0].stamp.timeNs = '0.1'; }],
    ['leading zero tick', (m) => { m.observations[0].stamp.timeNs = '01'; }],
    ['negative zero tick', (m) => { m.observations[0].stamp.timeNs = '-0'; }],
    ['oversized tick', (m) => { m.observations[0].stamp.timeNs = '1'.repeat(22); }],
    ['empty clock interval', (m) => { m.clocks[0].alignment!.validUntilNs = m.clocks[0].alignment!.validFromNs; }],
    ['reverse calibration interval', (m) => { m.calibrations[0].validUntilNs = '0'; }],
    ['non-unit quaternion', (m) => { m.poses[0].bodyToWorld.rotationXyzw = [0, 0, 0, 2]; }],
    ['nonfinite position', (m) => { m.poses[0].bodyToWorld.translationM[0] = Infinity; }],
    ['negative variance', (m) => { m.observations[0].pointEstimate!.covarianceM2 = [[-1, 0, 0], [0, 1, 0], [0, 0, 1]]; }],
    ['asymmetric covariance', (m) => { m.observations[0].pointEstimate!.covarianceM2 = [[1, 2, 0], [0, 1, 0], [0, 0, 1]]; }],
    ['indefinite covariance', (m) => { m.observations[0].pointEstimate!.covarianceM2 = [[1, 2, 0], [2, 1, 0], [0, 0, 1]]; }],
  ];
  it.each(invalid)('rejects %s', (_, change) => { const m = fixture(); change(m); expect(() => parseReplayManifest(m)).toThrow(); });
  it('accepts singular PSD covariance without substituting unknown values', () => {
    const m = fixture(); m.observations[0].pointEstimate!.covarianceM2 = [[1, 1, 0], [1, 1, 0], [0, 0, 0]];
    expect(parseReplayManifest(m).observations[0].pointEstimate!.covarianceM2).toEqual([[1, 1, 0], [1, 1, 0], [0, 0, 0]]);
  });
  it('requires explicit 6D covariance convention; does not assume Euler angles or degrees', () => {
    const m = fixture(); Object.assign(m.poses[0], { covariance6: identityMatrix(6) });
    expect(() => parseReplayManifest(m)).toThrow();
    Object.assign(m.poses[0], { covariance6: { convention: 'ROLL_PITCH_YAW_DEGREES', matrix: identityMatrix(6) } });
    expect(() => parseReplayManifest(m)).toThrow();
  });
  it.each(['url', 'command', 'admitted', 'accuracyM'])('rejects unrequested root field %s', (key) => {
    expect(() => parseReplayManifest({ ...fixture(), [key]: 'not allowed' })).toThrow();
  });
  it('separates communications from sensor modalities and RTK from GNSS modality', () => {
    for (const modality of ['COMMUNICATIONS', 'RTK', 'GPS_ANTENNA_SUPERVISOR']) {
      const m = fixture(); Object.assign(m.sensors[0], { modality }); expect(() => parseReplayManifest(m)).toThrow();
    }
  });
  it('bounds sensor count and pair expansion', () => {
    const m = fixture(); m.observations = Array.from({ length: 24 }, (_, i) => ({ ...m.observations[0], id: `obs-${i}` }));
    expect(() => parseReplayManifest(m)).toThrow('REPLAY_TOO_MANY_COMPARISONS');
    m.observations = Array.from({ length: 65 }, (_, i) => ({ ...m.observations[0], id: `obs-${i}` }));
    expect(() => parseReplayManifest(m)).toThrow();
  });
  it('deduplicates identical artifact refs but refuses conflicting identities under the same acquisition', () => {
    const m = fixture(); expect(manifestArtifactReferences(m)).toEqual([reference]);
    m.observations[0].rawArtifact = { ...reference, contentDigest: `sha256:${'c'.repeat(64)}` };
    expect(() => manifestArtifactReferences(m)).toThrow('REPLAY_ARTIFACT_REFERENCE_CONFLICT');
  });
});

describe('bounded replay JSON', () => {
  it.each(['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"a":{"x":1,"x":2}}'])('rejects duplicate keys %s', (json) => {
    expect(() => parseReplayJson(Buffer.from(json), 4096)).toThrow('REPLAY_DUPLICATE_JSON_KEY');
  });
  it('allows repeated keys in separate objects and punctuation in strings', () => {
    const text = '{"a":[{"x":1},{"x":2}],"b":"{,\\\"x\\\":x}"}';
    expect(parseReplayJson(Buffer.from(text), 4096)).toEqual(JSON.parse(text));
  });
  it('rejects invalid UTF-8, BOM, empty or oversized bytes', () => {
    for (const bytes of [Buffer.from([0xff]), Buffer.from('\ufeff{}'), Buffer.alloc(0), Buffer.alloc(4097)]) {
      expect(() => parseReplayJson(bytes, 4096)).toThrow();
    }
  });
});
