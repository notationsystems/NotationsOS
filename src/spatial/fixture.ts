import { LocalEvidenceIntake, type LocalIntakeManifest } from '../data-os/local-intake';
import { digest, parseLayout, type AnalysisRequest, type EvidenceReference, type SpatialLayout } from './contracts';
import { SpatialAnalysisService } from './service';

export const FIXTURE_TIME = '2026-09-05T12:00:00.000Z';
export const FLOOR_PLAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 280"><rect width="720" height="280" fill="#f8fafc"/><g font-family="sans-serif" fill="#172b4d"><text x="20" y="28" font-size="18">Spatial Inquiry — manually annotated synthetic floor</text><text x="20" y="52" font-size="12">Diagram only. Passage labels explicitly declare access; touching outlines do not.</text></g><g stroke="#42678c" fill="#e8f0f8" stroke-width="2"><rect x="20" y="90" width="100" height="90"/><rect x="160" y="90" width="100" height="90"/><rect x="300" y="90" width="100" height="90"/><rect x="440" y="90" width="100" height="90"/><rect x="580" y="90" width="100" height="90"/></g><g font-family="sans-serif" font-size="14" text-anchor="middle" fill="#172b4d"><text x="70" y="140">Entrance</text><text x="210" y="140">Hall</text><text x="350" y="140">Studio</text><text x="490" y="140">Office</text><text x="630" y="140">Store</text></g><g stroke="#172b4d" stroke-width="3"><path d="M120 135H160 M260 135H300 M400 135H440"/><path d="M540 135H580" stroke="#a66a00" stroke-dasharray="4 4"/></g><g font-family="sans-serif" font-size="12" text-anchor="middle"><text x="140" y="115">P-01</text><text x="280" y="115">P-07</text><text x="420" y="115">P-08</text><text x="560" y="115">P-09</text><text x="360" y="220">Close bridge P-07: Studio and Office lose confirmed access; Store remains unresolved.</text><text x="360" y="245">P-01 / P-07 / P-08: open, both directions. P-09: unknown, both directions.</text></g></svg>`;
export function fixtureManifest(name: string, mediaType: string): LocalIntakeManifest {
  return { schema: 'payload.local-intake-request.v1', acquisitionId: `spatial-demo-${name}`, evidenceId: `spatial-evidence-${name}`, purpose: 'SPATIAL_INQUIRY', mediaType,
    capturedAt: '2026-09-05T10:00:00.000Z', sourceRegistration: { registrationId: `spatial-policy-${name}`, sourceId: `notation://source/spatial/${name}`,
      displayName: 'Manually annotated synthetic floor plan', sourceClass: 'SYNTHETIC_DEMONSTRATION', licenseId: 'local-declaration', policyVersion: '1.0.0', effectiveFrom: '2026-09-01T00:00:00.000Z',
      permittedPurposes: ['SPATIAL_INQUIRY'], allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'], retention: { mode: 'INDEFINITE' } } };
}
export function preserveFixture(root: string) {
  const intake = new LocalEvidenceIntake(root);
  function capture(name: string, media: string, bytes: Buffer): EvidenceReference {
    const { acquisition: a } = intake.capture(fixtureManifest(name, media), bytes, '2026-09-05T11:00:00.000Z');
    return { acquisition: { id: a.request.manifest.acquisitionId, digest: a.digest }, evidence: { id: a.request.manifest.evidenceId, contentDigest: a.request.contentDigest } };
  }
  const planReference = capture('plan', 'image/svg+xml', Buffer.from(FLOOR_PLAN));
  const provenance = { kind: 'MANUAL_ANNOTATION' as const, author: 'NotationsOS demonstration fixture', note: 'Synthetic declared connections; no measured building or polygon inference.', sourceIds: ['plan'] };
  const names = ['Entrance', 'Hall', 'Studio', 'Office', 'Store'];
  const layout: SpatialLayout = parseLayout({ schema: 'payload.spatial-layout.v1', id: 'demo-floor', label: 'Synthetic single-floor access example', floorId: 'floor-1',
    sourceArtifacts: [{ id: 'plan', reference: planReference }], frame: { id: 'plan-frame', units: 'm', axes: 'X_RIGHT_Y_UP', origin: [0, 0], parentFrame: null }, provenance,
    spaces: names.map((label, i) => ({ id: `S-${i + 1}`, label, polygon: [[i * 5, 0], [i * 5 + 4, 0], [i * 5 + 4, 4], [i * 5, 4]] })),
    passages: ['P-01', 'P-07', 'P-08', 'P-09'].map((id, i) => ({ id, from: `S-${i + 1}`, to: `S-${i + 2}`, direction: 'BOTH', state: i === 3 ? 'UNKNOWN' : 'OPEN', conditions: [], provenance })) });
  const layoutReference = capture('layout', 'application/json', Buffer.from(JSON.stringify(layout, null, 2)));
  const baseline: AnalysisRequest = { schema: 'payload.spatial-analysis-request.v1', requestId: 'spatial-demo-baseline', purpose: 'SPATIAL_INQUIRY', layout: layoutReference, rootSpaceId: 'S-1', scenario: null };
  const scenario: AnalysisRequest = { ...baseline, requestId: 'spatial-demo-closed-bridge', scenario: { schema: 'payload.spatial-scenario.v1', baselineLayoutDigest: digest(layout), passageId: 'P-07', assumedState: 'CLOSED', provenance: { kind: 'SCENARIO_ASSUMPTION', author: 'NotationsOS demonstration fixture', note: 'What if the studio connection is closed?', sourceIds: ['plan'] } } };
  return { layout, baseline, scenario };
}
export function runFixture(root: string) {
  const fixture = preserveFixture(root), service = new SpatialAnalysisService(root, () => FIXTURE_TIME);
  return { ...fixture, baselineAnalysis: service.submit(fixture.baseline), scenarioAnalysis: service.submit(fixture.scenario), comparison: service.compare(fixture.baseline.requestId, fixture.scenario.requestId) };
}
