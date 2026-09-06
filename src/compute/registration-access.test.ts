import { describe, expect, it } from 'vitest';
import { byteDigest } from '../data-os/evidence-capture';
import { encodeLocalRecord } from '../data-os/local-record';
import { buildRegistrationAccessPreview } from './registration-access-demo';
import { evaluateRegistrationAccess } from './registration-access';
import { parseRegistrationAccessExperiment, registrationAccessReferences, type RegistrationAccessExperiment } from './registration-access-contract';

const fixture = () => buildRegistrationAccessPreview().manifest;
describe('weighted registration and explicit distance semantics', () => {
  it('keeps small fitting residuals distinct from deliberately biased withheld observations', () => {
    const m = fixture(), before = structuredClone(m), result = evaluateRegistrationAccess(m);
    expect(m).toEqual(before); expect(evaluateRegistrationAccess(m)).toEqual(result);
    expect(result.registration.state).toBe('COMPUTED');
    expect(result.registration.fittingRmseM!).toBeLessThan(0.02);
    expect(result.registration.checkPointRmseM!).toBeGreaterThan(0.09);
    expect(result.registration.fit!.covariance).toHaveLength(6);
    expect(result.registration.fit!.numerics.covarianceParameterization).toContain('CENTROID');
    expect(result.claims).toEqual({ independentVerification: false, fieldAccuracyEstablished: false, canonicalAdmission: false,
      physicalActionAuthorized: false, learnedModelTrained: false, rawBimParsed: false, fullSensorCalibrationPerformed: false,
      graphExtractedFromBim: false, geographicPlacementEstablished: false });
  });
  it('never passes check points, check noise or access geometry to the estimator', () => {
    const m = fixture(), prior = evaluateRegistrationAccess(m);
    m.checkPoints.forEach((c) => { c.targetM[0] += 100; c.varianceM2 = 20; });
    m.access.geometry.edges[0].lengthM += 20;
    const result = evaluateRegistrationAccess(m);
    expect(result.registration.fit).toEqual(prior.registration.fit);
    expect(result.registration.checkPointRmseM!).toBeGreaterThan(99);
    expect(result.access.base.distanceM).toBe(30);
  });
  it('declares different straight-line and access distances; closure scenarios never mutate the base', () => {
    const result = evaluateRegistrationAccess(fixture());
    expect(result.access.straightLine).toEqual({ metric: 'EUCLIDEAN_3D', distanceM: 2 });
    expect(result.access.base).toMatchObject({ status: 'REACHABLE', metric: 'PERMITTED_NETWORK_LENGTH', distanceM: 10,
      edgeIds: ['exit-a', 'passage', 'exit-b'], excludedUnknownEdgeIds: ['unknown-shortcut'], excludedProhibitedEdgeIds: ['locked-door'] });
    expect(result.access.scenarios[0].result).toMatchObject({ status: 'REACHABLE', distanceM: 16 });
    expect(result.access.scenarios[1].result).toMatchObject({ status: 'UNREACHABLE', distanceM: null, nodeIds: [], edgeIds: [] });
    expect(result.registeredNodesFrame?.id).toBe('synthetic-survey-frame');
    const [a, b] = result.registeredNodes!;
    expect(Math.hypot(...a.positionM.map((v, i) => v - b.positionM[i]))).toBeCloseTo(2, 12);
    expect(result.method.unsupportedDistanceModels).toEqual(['ELLIPSOID_GEODESIC', 'SURFACE_MESH_GEODESIC']);
  });
  it('propagates the full local centroid-parameter covariance to a check point', () => {
    const result = evaluateRegistrationAccess(fixture()), c = result.registration.comparisons[0];
    expect(c.uncertaintyState).toBe('LOCAL_APPROXIMATION_UNDER_DECLARED_INDEPENDENCE');
    expect(c.predictiveResidualCovariance).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(c.predictiveResidualCovariance![i][i]).toBeGreaterThan(0.0001);
      expect(c.marginalStandardizedResidual![i]).toBeCloseTo(c.residualM[i] / Math.sqrt(c.predictiveResidualCovariance![i][i]), 12);
      for (let j = 0; j < 3; j++) expect(c.predictiveResidualCovariance![i][j]).toBeCloseTo(c.predictiveResidualCovariance![j][i], 12);
    }
    expect(result.method.standardizedResiduals).toContain('NOT_INDEPENDENT_UNIT_NORMAL');
  });
  it('matches analytic check-point covariance and is invariant to coordinate-origin translation', () => {
    const experiment = (origin: number[]) => {
      const m = fixture(), template = m.controls[0];
      m.controls = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((p, i) => {
        const at = p.map((v, a) => v + origin[a]) as [number, number, number];
        return { ...template, id: `fit-${i}`, measurementId: `survey-fit-${i}`, sourceM: at, targetM: [...at], varianceM2: 1 };
      });
      const at: [number, number, number] = [origin[0] + 2, origin[1], origin[2]];
      m.checkPoints = [{ ...m.checkPoints[0], sourceM: at, targetM: [...at], varianceM2: 0.25 }];
      return evaluateRegistrationAccess(m).registration.comparisons[0].predictiveResidualCovariance!;
    };
    // Six unit-axis controls: rotation covariance I/4, centroid translation I/6.
    // At [2,0,0], local point covariance is diag(1/6,7/6,7/6), plus reference I/4.
    const zero = experiment([0, 0, 0]), shifted = experiment([1000, 2000, 3000]);
    for (const actual of [zero, shifted]) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      expect(actual[i][j]).toBeCloseTo(i === j ? i === 0 ? 5 / 12 : 17 / 12 : 0, 12);
    }
  });
  it('pins detached numerical contracts and never lets a caller mutate future method metadata', () => {
    const m = fixture(), original = evaluateRegistrationAccess(m), altered = evaluateRegistrationAccess(m);
    Object.assign(altered.method.registrationNumerics, { minimumSourceScatterSecondToFirstRatioExclusive: 0 });
    Object.assign(altered.method.distanceAlgorithm, { network: 'EUCLIDEAN_FALLBACK' });
    altered.method.unsupportedDistanceModels.length = 0;
    expect(evaluateRegistrationAccess(m)).toEqual(original);
  });
  it.each(['variance', 'independence'])('retains raw check discrepancies when %s is unknown', (kind) => {
    const m = fixture();
    if (kind === 'variance') m.checkPoints[0].varianceM2 = null;
    else m.independentCheckPoints.state = 'UNRESOLVED';
    const result = evaluateRegistrationAccess(m);
    expect(result.registration.state).toBe('COMPUTED');
    expect(result.registration.comparisons[0]).toMatchObject({ predictiveResidualCovariance: null, marginalStandardizedResidual: null });
    expect(result.registration.comparisons[0].distanceM).toBeGreaterThan(0.09);
  });
  it.each(['variance', 'source', 'independence', 'collinear'])('preserves an explicit unresolved registration for %s', (kind) => {
    const m = fixture();
    if (kind === 'variance') m.controls[0].varianceM2 = null;
    else if (kind === 'source') m.fixedSourceGeometry.state = 'UNRESOLVED';
    else if (kind === 'independence') m.independentIsotropicControlNoise.state = 'UNRESOLVED';
    else m.controls.forEach((c, i) => { c.sourceM = [i, 0, 0]; });
    const result = evaluateRegistrationAccess(m);
    expect(result.registration).toMatchObject({ state: 'UNRESOLVED_REQUIREMENTS', fit: null, comparisons: [], fittingRmseM: null, checkPointRmseM: null });
    expect(result.registration.blockers).toHaveLength(1);
    expect(result.registeredNodes).toBeNull();
    // Source-frame graph distances need no successful survey alignment.
    expect(result.access.base.distanceM).toBe(10);
  });
  it('does not elevate declared recorded observations or byte references into physical validation', () => {
    const m = fixture(); m.evidenceClass = 'RECORDED_MEASUREMENTS';
    const r = evaluateRegistrationAccess(m);
    expect(r.interpretationAuthority).toBe('OPERATOR_DECLARATION');
    expect(r.claims.fieldAccuracyEstablished).toBe(false);
  });
  it('preview artifact descriptors resolve actual synthetic contents without claiming stored acquisitions', () => {
    const p = buildRegistrationAccessPreview();
    expect(p.mode).toBe('IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED');
    for (const ref of registrationAccessReferences(p.manifest)) {
      const a = p.artifacts.find((a) => a.id === ref.acquisitionId)!;
      expect(a.contentDigest).toBe(ref.contentDigest);
      expect(byteDigest(encodeLocalRecord(a.content))).toBe(ref.contentDigest);
    }
  });
});

describe('closed spatial experiment contract', () => {
  const mutations: Array<[string, (m: RegistrationAccessExperiment) => void, string?]> = [
    ['same frames', (m) => { m.targetFrame.id = m.sourceFrame.id; }, 'SPATIAL_DISTINCT_FRAMES_REQUIRED'],
    ['graph frame mismatch', (m) => { m.access.geometry.frame.id = 'other'; }, 'SPATIAL_GRAPH_FRAME_MISMATCH'],
    ['duplicate control', (m) => { m.controls[1].id = m.controls[0].id; }, 'SPATIAL_DUPLICATE_CONTROL_ID'],
    ['double-counted measurement', (m) => { m.controls[1].measurementId = m.controls[0].measurementId; }, 'SPATIAL_MEASUREMENT_REUSE'],
    ['check content reused in fit', (m) => { m.checkPoints[0].evidence = m.controls[0].evidence; }, 'SPATIAL_CHECK_POINT_LEAKAGE'],
    ['check content hidden behind another acquisition', (m) => { m.checkPoints[0].evidence = { ...m.controls[0].evidence, acquisitionId: 'disguised' }; }, 'SPATIAL_CHECK_POINT_LEAKAGE'],
    ['check content in source geometry', (m) => { m.sourceSnapshot.evidence = m.checkPoints[0].evidence; }, 'SPATIAL_CHECK_POINT_LEAKAGE'],
    ['conflicting acquisition identity', (m) => { m.access.evidence = { ...m.sourceSnapshot.evidence, acquisitionDigest: `sha256:${'f'.repeat(64)}` }; }, 'SPATIAL_REFERENCE_CONFLICT'],
    ['missing variance', (m) => { Reflect.deleteProperty(m.controls[0], 'varianceM2'); }],
    ['zero variance', (m) => { m.controls[0].varianceM2 = 0; }],
    ['nonfinite coordinate', (m) => { m.controls[0].targetM[0] = Infinity; }],
    ['missing checks', (m) => { m.checkPoints = []; }],
    ['too few controls', (m) => { m.controls = m.controls.slice(0, 2); }],
    ['too many controls', (m) => { m.controls = Array(65).fill(m.controls[0]); }],
    ['undeclared closure', (m) => { m.access.geometry.scenarios[0].closedEdgeIds = ['not-an-edge']; }],
  ];
  it.each(mutations)('refuses %s', (_, mutate, code) => {
    const m = fixture(); mutate(m);
    if (code) expect(() => parseRegistrationAccessExperiment(m)).toThrow(code);
    else expect(() => parseRegistrationAccessExperiment(m)).toThrow();
  });
  it.each(['threshold', 'model', 'program', 'admitted', 'robustLoss', 'ellipsoid'])('rejects unsupported override %s', (key) => {
    expect(() => parseRegistrationAccessExperiment({ ...fixture(), [key]: 'unsupported' })).toThrow();
  });
  it.each([{ kind: 'GEODETIC' }, { units: 'DEGREE' }, { handedness: 'LEFT_HANDED' }])('refuses incompatible frame %j', (change) => {
    const m = fixture(); Object.assign(m.sourceFrame, change); expect(() => parseRegistrationAccessExperiment(m)).toThrow();
  });
});
