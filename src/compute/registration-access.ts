import { localRecordDigest } from '../data-os/local-record';
import { transformPoint, type Vec3 } from '../observation/rigid';
import { ACCESS_GEOMETRY_ALGORITHM, evaluateAccessGeometry } from './access-geometry';
import { RIGID_REGISTRATION_NUMERICS, solveRigidRegistration, type RigidRegistrationSolution } from './rigid-registration';
import { MAX_REGISTRATION_RUN_BYTES, parseRegistrationAccessExperiment, type RegistrationAccessExperiment } from './registration-access-contract';

export type CheckPointComparison = {
  id: string; predictedM: Vec3; residualM: Vec3; distanceM: number;
  predictiveResidualCovariance: number[][] | null;
  marginalStandardizedResidual: Vec3 | null;
  uncertaintyState: 'LOCAL_APPROXIMATION_UNDER_DECLARED_INDEPENDENCE' | 'CHECK_POINT_VARIANCE_UNAVAILABLE' | 'CHECK_POINT_INDEPENDENCE_UNRESOLVED';
};

function compareCheckPoint(c: RegistrationAccessExperiment['checkPoints'][number], fit: RigidRegistrationSolution, independent: boolean): CheckPointComparison {
  const predictedM = transformPoint(fit.transform, c.sourceM);
  const residualM = predictedM.map((v, i) => v - c.targetM[i]) as Vec3;
  // Same target-frame perturbation at the fitted centroid as the solver covariance.
  const centered = c.sourceM.map((v, i) => v - fit.sourceCentroidM[i]) as Vec3;
  const [x, y, z] = transformPoint({ ...fit.transform, translationM: [0, 0, 0] }, centered);
  const j = [[0, z, -y, 1, 0, 0], [-z, 0, x, 0, 1, 0], [y, -x, 0, 0, 0, 1]];
  const predictiveResidualCovariance = independent && c.varianceM2 !== null ? j.map((row, a) => j.map((other, b) => {
    let value = a === b ? c.varianceM2! : 0;
    for (let u = 0; u < 6; u++) for (let v = 0; v < 6; v++) value += row[u] * fit.covariance[u][v] * other[v];
    return value;
  })) : null;
  if (predictiveResidualCovariance?.some((row, i) => row.some((v) => !Number.isFinite(v)) || row[i] <= 0)) throw new Error('SPATIAL_UNCERTAINTY_NUMERICAL_FAILURE');
  return { id: c.id, predictedM, residualM, distanceM: Math.hypot(...residualM), predictiveResidualCovariance,
    marginalStandardizedResidual: predictiveResidualCovariance ? residualM.map((v, i) => v / Math.sqrt(predictiveResidualCovariance[i][i])) as Vec3 : null,
    uncertaintyState: !independent ? 'CHECK_POINT_INDEPENDENCE_UNRESOLVED' : c.varianceM2 === null ? 'CHECK_POINT_VARIANCE_UNAVAILABLE' : 'LOCAL_APPROXIMATION_UNDER_DECLARED_INDEPENDENCE' };
}

export function evaluateRegistrationAccess(value: unknown) {
  const manifest = parseRegistrationAccessExperiment(value);
  const blockers: string[] = [];
  if (manifest.fixedSourceGeometry.state !== 'DECLARED') blockers.push('FIXED_SOURCE_GEOMETRY_UNRESOLVED');
  if (manifest.independentIsotropicControlNoise.state !== 'DECLARED') blockers.push('INDEPENDENT_ISOTROPIC_CONTROL_NOISE_UNRESOLVED');
  if (manifest.controls.some((c) => c.varianceM2 === null)) blockers.push('CONTROL_VARIANCE_UNAVAILABLE');
  let fit: RigidRegistrationSolution | null = null;
  if (!blockers.length) {
    try {
      // No held-out check point, graph node, prior transform or BIM-fitted pose enters the fit.
      fit = solveRigidRegistration(manifest.controls.map((c) => ({ id: c.id, sourceM: c.sourceM, targetM: c.targetM, varianceM2: c.varianceM2! })));
    } catch (error) {
      if (!(error instanceof Error) || !['REGISTRATION_DEGENERATE_GEOMETRY', 'REGISTRATION_ILL_CONDITIONED'].includes(error.message)) throw error;
      blockers.push(error.message);
    }
  }
  const comparisons = fit ? manifest.checkPoints.map((c) => compareCheckPoint(c, fit!, manifest.independentCheckPoints.state === 'DECLARED')) : [];
  // Distances are measured in the graph's declared BIM frame, not fabricated from geographic degrees.
  // Rigid alignment does not change these lengths or authorize the edges.
  const access = evaluateAccessGeometry(manifest.access.geometry);
  const registeredNodes = fit ? manifest.access.geometry.nodes.map((n) => ({ id: n.id, positionM: transformPoint(fit!.transform, n.positionM) })) : null;
  const result = {
    schema: 'payload.registration-access-result.v1' as const,
    experimentId: manifest.experimentId, manifestDigest: localRecordDigest(manifest, MAX_REGISTRATION_RUN_BYTES),
    evidenceClass: manifest.evidenceClass, interpretationAuthority: 'OPERATOR_DECLARATION' as const,
    method: { id: 'weighted-rigid-registration-and-permitted-access', version: '1.0.0',
      registrationNumerics: structuredClone(RIGID_REGISTRATION_NUMERICS), distanceAlgorithm: structuredClone(ACCESS_GEOMETRY_ALGORITHM),
      estimator: 'WEIGHTED_RIGID_3D', loss: 'SQUARED', sourceCoordinates: 'EXACT_FIXED_MODEL', targetNoise: 'KNOWN_INDEPENDENT_ISOTROPIC_GAUSSIAN',
      correspondence: 'OPERATOR_SUPPLIED_NOT_ESTIMATED', covariance: 'LOCAL_GAUSS_NEWTON_NOT_GLOBAL_ACCURACY',
      referenceUse: 'HELD_OUT_FROM_SOLVE_NOT_INDEPENDENTLY_ATTESTED',
      standardizedResiduals: 'MARGINAL_ONLY_NOT_INDEPENDENT_UNIT_NORMAL_GUARANTEE',
      distanceModels: ['EUCLIDEAN_3D', 'PERMITTED_NETWORK_LENGTH'],
      unsupportedDistanceModels: ['ELLIPSOID_GEODESIC', 'SURFACE_MESH_GEODESIC'],
      accessAssumptions: 'DECLARED_STATIC_GRAPH_AND_LENGTHS_NOT_UNCERTAINTY_PROPAGATED' },
    registration: { state: fit ? 'COMPUTED' as const : 'UNRESOLVED_REQUIREMENTS' as const, blockers, fit,
      sourceFrame: manifest.sourceFrame, targetFrame: manifest.targetFrame,
      fittingRmseM: fit ? Math.sqrt(fit.residuals.reduce((sum, r) => sum + r.normM ** 2, 0) / fit.residuals.length) : null,
      checkPointRmseM: comparisons.length ? Math.sqrt(comparisons.reduce((sum, r) => sum + r.distanceM ** 2, 0) / comparisons.length) : null,
      comparisons },
    access, registeredNodes, registeredNodesFrame: fit ? manifest.targetFrame : null,
    sourceSnapshot: manifest.sourceSnapshot, accessSnapshot: { id: manifest.access.snapshotId, evidence: manifest.access.evidence },
    validationDomain: manifest.validationDomain, exclusions: manifest.exclusions,
    claims: { independentVerification: false, fieldAccuracyEstablished: false, canonicalAdmission: false,
      physicalActionAuthorized: false, learnedModelTrained: false, rawBimParsed: false, fullSensorCalibrationPerformed: false,
      graphExtractedFromBim: false, geographicPlacementEstablished: false },
  };
  return { ...result, digest: localRecordDigest(result, MAX_REGISTRATION_RUN_BYTES) };
}
export type RegistrationAccessResult = ReturnType<typeof evaluateRegistrationAccess>;
