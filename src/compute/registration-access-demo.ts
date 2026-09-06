import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake, type LocalIntakeManifest } from '../data-os/local-intake';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import type { ArtifactReference } from '../observation/contract';
import type { Vec3 } from '../observation/rigid';
import { evaluateRegistrationAccess } from './registration-access';
import { MAX_REGISTRATION_MANIFEST_BYTES, type RegistrationAccessExperiment } from './registration-access-contract';
import { RegistrationAccessStore } from './registration-access-store';

const roles = ['geometry', 'controls', 'checks', 'graph', 'assumptions'] as const;
type Role = typeof roles[number];
export type SpatialArtifact = { id: string; content: unknown; contentDigest: string };

/** Invented metre geometry only: no IFC parser, survey capture, or inferred building topology. */
export function syntheticRegistrationAccess(refs: Record<Role, ArtifactReference>): RegistrationAccessExperiment {
  const frame = { id: 'synthetic-bim-frame', kind: 'LOCAL_CARTESIAN' as const, units: 'METRE' as const, handedness: 'RIGHT_HANDED' as const };
  const sourcePoints: Vec3[] = [[0, 0, 0], [4, 0, 0], [0, 4, 0], [0, 0, 4]];
  const noise: Vec3[] = [[0.02, 0, 0], [-0.02, 0, 0], [0, 0.02, 0], [0, -0.02, 0]];
  const nominal = ([x, y, z]: Vec3): Vec3 => [10 - y, 20 + x, 3 + z];
  const declaration = (description: string) => ({ state: 'DECLARED' as const, description, evidence: refs.assumptions });
  const controls = sourcePoints.map((sourceM, i) => ({ id: `fit-${i}`, sourceM,
    targetM: nominal(sourceM).map((v, a) => v + noise[i][a]) as Vec3, varianceM2: 0.0004, evidence: refs.controls, measurementId: `survey-fit-${i}` }));
  const checkPoints = ([[2, 2, 1], [1, 3, 2]] as Vec3[]).map((sourceM, i) => ({ id: `check-${i}`, sourceM,
    targetM: nominal(sourceM).map((v, a) => a === 0 ? v + 0.1 : v) as Vec3, varianceM2: 0.0001, evidence: refs.checks, measurementId: `survey-check-${i}` }));
  return {
    schema: 'payload.registration-access-experiment.v1', experimentId: 'synthetic-building-access-v1',
    purpose: 'spatial-registration-access', evidenceClass: 'SYNTHETIC_TEST',
    description: 'Invented BIM controls and survey readings, separate biased check points, and an annotated building-access graph.',
    validationDomain: 'Software example only: four controls, two held-out check points, one static six-node building graph.',
    exclusions: ['No physical survey or independent accuracy validation', 'No IFC parsing, point-cloud matching or BIM-derived access topology',
      'No general correlated errors, source-coordinate uncertainty, robust loss, scale or reflection', 'No live access, safe egress, travel time, ellipsoid or mesh geodesics'],
    sourceFrame: frame, targetFrame: { ...frame, id: 'synthetic-survey-frame' },
    sourceSnapshot: { kind: 'BIM_CONTROL_GEOMETRY', representationId: 'invented-building-controls-v1', evidence: refs.geometry },
    fixedSourceGeometry: declaration('BIM control coordinates are treated as exact fixed model inputs; not established source accuracy.'),
    independentIsotropicControlNoise: declaration('Independent isotropic Gaussian target noise; invented known variance 0.0004 square metre per axis.'),
    independentCheckPoints: declaration('Separate synthetic check artifact, not used in solve; independence is declared, not independently verified.'),
    controls, checkPoints,
    access: { snapshotId: 'invented-building-access-v1', evidence: refs.graph, geometry: {
      frame,
      nodes: [{ id: 'room-a', positionM: [0, 0, 0] }, { id: 'room-b', positionM: [2, 0, 0] },
        { id: 'junction-a', positionM: [0, 4, 0] }, { id: 'junction-b', positionM: [2, 4, 0] },
        { id: 'detour-a', positionM: [0, 7, 0] }, { id: 'detour-b', positionM: [2, 7, 0] }],
      edges: [
        { id: 'exit-a', fromNodeId: 'room-a', toNodeId: 'junction-a', lengthM: 4 },
        { id: 'passage', fromNodeId: 'junction-a', toNodeId: 'junction-b', lengthM: 2 },
        { id: 'exit-b', fromNodeId: 'junction-b', toNodeId: 'room-b', lengthM: 4 },
        { id: 'detour-up', fromNodeId: 'junction-a', toNodeId: 'detour-a', lengthM: 3 },
        { id: 'detour-across', fromNodeId: 'detour-a', toNodeId: 'detour-b', lengthM: 2 },
        { id: 'detour-down', fromNodeId: 'detour-b', toNodeId: 'junction-b', lengthM: 3 },
      ].map((e) => ({ ...e, direction: 'BIDIRECTIONAL' as const, access: 'PERMITTED' as const })),
      startNodeId: 'room-a', endNodeId: 'room-b',
      scenarios: [{ id: 'passage-closed', closedEdgeIds: ['passage'] }, { id: 'room-exit-closed', closedEdgeIds: ['exit-a'] }],
    } },
  };
}

function material() {
  // Placeholders only construct contents; preview and retained run each supply their own exact references below.
  const placeholder = { acquisitionId: 'unbound', acquisitionDigest: `sha256:${'0'.repeat(64)}`, contentDigest: `sha256:${'0'.repeat(64)}` };
  const m = syntheticRegistrationAccess(Object.fromEntries(roles.map((r) => [r, placeholder])) as Record<Role, ArtifactReference>);
  m.access.geometry.edges.push(
    { id: 'unknown-shortcut', fromNodeId: 'room-a', toNodeId: 'room-b', lengthM: 2, direction: 'BIDIRECTIONAL', access: 'UNKNOWN' },
    { id: 'locked-door', fromNodeId: 'room-a', toNodeId: 'room-b', lengthM: 2, direction: 'BIDIRECTIONAL', access: 'PROHIBITED' });
  const content: Record<Role, unknown> = {
    geometry: { evidenceClass: 'SYNTHETIC_TEST', kind: 'BIM_CONTROL_GEOMETRY', frame: m.sourceFrame,
      sourcePoints: [...m.controls, ...m.checkPoints].map((c) => ({ id: c.id, sourceM: c.sourceM })) },
    controls: { evidenceClass: 'SYNTHETIC_TEST', frame: m.targetFrame, readings: m.controls.map(({ measurementId, targetM, varianceM2 }) => ({ measurementId, targetM, varianceM2 })) },
    checks: { evidenceClass: 'SYNTHETIC_TEST', frame: m.targetFrame, readings: m.checkPoints.map(({ measurementId, targetM, varianceM2 }) => ({ measurementId, targetM, varianceM2 })), note: 'Invented 0.1 metre check-point bias demonstrates fitting is not independent accuracy.' },
    graph: { evidenceClass: 'SYNTHETIC_TEST', geometry: m.access.geometry, note: 'Manually declared graph; no BIM extraction, live authorization or egress validation.' },
    assumptions: { evidenceClass: 'SYNTHETIC_TEST', declarations: [m.fixedSourceGeometry.description, m.independentIsotropicControlNoise.description, m.independentCheckPoints.description] },
  };
  return { content, graph: m.access.geometry };
}

/** No acquisition receipts or policies are asserted by the browser preview's in-memory descriptors. */
export function buildRegistrationAccessPreview() {
  const { content, graph } = material();
  const artifacts: SpatialArtifact[] = roles.map((role) => ({ id: `synthetic-preview-${role}-v1`, content: content[role], contentDigest: byteDigest(encodeLocalRecord(content[role], MAX_REGISTRATION_MANIFEST_BYTES)) }));
  const refs = Object.fromEntries(roles.map((r, i) => [r, { acquisitionId: artifacts[i].id,
    acquisitionDigest: localRecordDigest({ kind: 'SYNTHETIC_PREVIEW_DESCRIPTOR_NOT_ACQUISITION', id: artifacts[i].id, contentDigest: artifacts[i].contentDigest }),
    contentDigest: artifacts[i].contentDigest }])) as Record<Role, ArtifactReference>;
  const manifest = syntheticRegistrationAccess(refs); manifest.access.geometry = graph;
  return { mode: 'IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED' as const, manifest, result: evaluateRegistrationAccess(manifest), artifacts };
}

export function spatialDemoDeclaration(id: string): LocalIntakeManifest {
  return { schema: 'payload.local-intake-request.v1', acquisitionId: id, evidenceId: `${id}:evidence`, mediaType: 'application/json',
    capturedAt: '2020-01-01T00:00:00.000Z', purpose: 'spatial-registration-access',
    sourceRegistration: { registrationId: 'synthetic-building-access:v1', sourceId: 'synthetic-building-access', displayName: 'Synthetic building-access experiment; not physical evidence',
      sourceClass: 'synthetic-test', licenseId: 'operator-declaration:synthetic-local-test', policyVersion: '1.0.0', effectiveFrom: '2020-01-01T00:00:00.000Z',
      permittedPurposes: ['spatial-registration-access'], allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'], retention: { mode: 'INDEFINITE' } } };
}

export function runRegistrationAccessDemo(root: string, now = new Date().toISOString()) {
  const intake = new LocalEvidenceIntake(root), { content, graph } = material();
  const capture = (id: string, value: unknown): ArtifactReference => {
    const a = intake.capture(spatialDemoDeclaration(id), encodeLocalRecord(value, MAX_REGISTRATION_MANIFEST_BYTES), now).acquisition;
    return { acquisitionId: id, acquisitionDigest: a.digest, contentDigest: a.request.contentDigest };
  };
  const refs = Object.fromEntries(roles.map((r) => [r, capture(`synthetic-building-${r}-v1`, content[r])])) as Record<Role, ArtifactReference>;
  const experiment = syntheticRegistrationAccess(refs); experiment.access.geometry = graph;
  const manifest = capture('synthetic-building-manifest-v1', experiment);
  return new RegistrationAccessStore(root).run({ schema: 'payload.registration-access-request.v1', runId: 'synthetic-building-access-v1', manifest }, now);
}
