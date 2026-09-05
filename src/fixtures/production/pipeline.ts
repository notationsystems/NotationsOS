/**
 * Produce the candidate-production demonstration through the real local
 * rails (src/data-os), with explicit instants, into a throwaway root. Node
 * only. The stamp script commits the result as demo.json; the contract test
 * reproduces it and asserts equality, so the committed demonstration cannot
 * drift from what the rails actually do.
 *
 * Inputs are the committed examples under examples/. Nothing here reads the
 * wall clock, and nothing here touches .payload/.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CARRIER_ADAPTER } from '@/data-os/caravan-carrier-adapter';
import { byteDigest } from '@/data-os/evidence-capture';
import { LocalEvidenceIntake } from '@/data-os/local-intake';
import { LocalNormalizationStore } from '@/data-os/local-normalization';
import { CANDIDATE_BUILD_CONTRACT, LocalCandidateBuildStore, type CandidateBuildRequest } from '@/data-os/local-candidate-build';
import { PRODUCTION_SCHEMA, type ProductionDemo, type ProductionRefusal } from '@/domain/production';

export const DEMO_INSTANTS = {
  capturedAt: '2026-09-05T00:00:00Z',
  storedAt: '2026-09-05T00:05:00.000Z',
  normalizedAt: '2026-09-05T00:10:00.000Z',
  knownThrough: '2026-09-05T00:30:00.000Z',
  builtAt: '2026-09-05T01:00:00.000Z',
  earlyCutoff: '2026-09-05T00:05:00.000Z',
} as const;

export const DEMO_IDS = {
  carrierAcquisition: 'demo-caravan-carrier-001',
  carrierNormalization: 'demo-caravan-carrier-normalization-001',
  driftedAcquisition: 'demo-caravan-carrier-002',
  driftedEvidence: 'demo-evidence-caravan-carrier-002',
  driftedNormalization: 'demo-caravan-carrier-normalization-002',
  noticeAcquisition: 'demo-caravan-local-notice-001',
  noticeNormalization: 'demo-caravan-local-notice-normalization-001',
  build: 'demo-caravan-carrier-build-001',
  refusedBuild: 'demo-caravan-carrier-build-002',
  earlyBuild: 'demo-caravan-carrier-build-003',
} as const;

const INPUTS = ['examples/carrier/acquisition.json', 'examples/carrier/source.json', 'examples/carrier/normalization.json', 'examples/evidence/request.json', 'examples/evidence/notice.txt'] as const;

function refused(step: ProductionRefusal['step'], requestId: string, run: () => unknown): ProductionRefusal {
  try { run(); }
  catch (error) { return { step, requestId, error: error instanceof Error ? error.message : String(error) }; }
  throw new Error(`${step} ${requestId} was expected to be refused.`);
}

export function produceDemo(repoRoot = process.cwd()): ProductionDemo {
  const read = (path: string) => readFileSync(resolve(repoRoot, path));
  const json = (path: string) => JSON.parse(read(path).toString('utf8')) as Record<string, unknown>;
  const root = mkdtempSync(join(tmpdir(), 'payload-production-demo-'));
  try {
    const intake = new LocalEvidenceIntake(root);
    const normalizations = new LocalNormalizationStore(root);
    const builds = new LocalCandidateBuildStore(root);

    // 1. Acquisition: the committed Carrier example, captured under its declared policy.
    const carrierManifest = json('examples/carrier/acquisition.json');
    const carrierBytes = read('examples/carrier/source.json');
    const carrier = intake.capture(carrierManifest, carrierBytes, DEMO_INSTANTS.storedAt).acquisition;

    // 2. Acquisition of a drifted source (schema v2) under the same policy: capture is fine, parsing is not.
    const driftedSource = { ...(JSON.parse(carrierBytes.toString('utf8')) as Record<string, unknown>), schema: 'caravan.carrier-source.v2' };
    const driftedBytes = Buffer.from(JSON.stringify(driftedSource, null, 2) + '\n', 'utf8');
    const drifted = intake.capture({ ...carrierManifest, acquisitionId: DEMO_IDS.driftedAcquisition, evidenceId: DEMO_IDS.driftedEvidence }, driftedBytes, DEMO_INSTANTS.storedAt).acquisition;

    // 3. Acquisition of the plain-text notice, whose registration permits INGEST only.
    const notice = intake.capture(json('examples/evidence/request.json'), read('examples/evidence/notice.txt'), DEMO_INSTANTS.storedAt).acquisition;

    // 4. Normalization: one candidate, one quarantine, one refusal.
    const normalizationManifest = json('examples/carrier/normalization.json');
    const normalized = normalizations.normalize(normalizationManifest, DEMO_INSTANTS.normalizedAt).run;
    const quarantined = normalizations.normalize({ ...normalizationManifest, normalizationId: DEMO_IDS.driftedNormalization, acquisitionId: DEMO_IDS.driftedAcquisition }, DEMO_INSTANTS.normalizedAt).run;
    const noticeRequest = {
      schema: 'payload.local-normalization-request.v1', normalizationId: DEMO_IDS.noticeNormalization, acquisitionId: DEMO_IDS.noticeAcquisition,
      purpose: 'CARAVAN_LOCAL_DEVELOPMENT',
      profile: { id: 'demo-local-notice-profile-v1', version: '1.0.0', sourceRegistrationId: 'demo-local-notice-policy-v1', sourceId: 'notation://source/notation-systems/local-demo', adapterId: CARRIER_ADAPTER.id },
    };
    const refusals: ProductionRefusal[] = [
      refused('NORMALIZE', DEMO_IDS.noticeNormalization, () => normalizations.normalize(noticeRequest, DEMO_INSTANTS.normalizedAt)),
    ];

    // 5. Candidate build: the one eligible candidate, under an explicit knowledge cutoff.
    const definition: CandidateBuildRequest['definition'] = { id: 'demo-caravan-carrier-candidates-v1', version: '1.0.0', domain: 'CARAVAN', recordType: 'Carrier', sourceClasses: ['OPERATOR_DECLARATION'] };
    const request = (buildId: string, normalizationIds: string[], knownThrough: string): CandidateBuildRequest => ({
      schema: 'payload.local-candidate-build-request.v1', buildId, purpose: 'CARAVAN_LOCAL_DEVELOPMENT', knownThrough, definition, normalizationIds,
    });
    const build = builds.build(request(DEMO_IDS.build, [DEMO_IDS.carrierNormalization], DEMO_INSTANTS.knownThrough), DEMO_INSTANTS.builtAt).build;
    refusals.push(
      refused('BUILD', DEMO_IDS.refusedBuild, () => builds.build(request(DEMO_IDS.refusedBuild, [DEMO_IDS.carrierNormalization, DEMO_IDS.driftedNormalization], DEMO_INSTANTS.knownThrough), DEMO_INSTANTS.builtAt)),
      refused('BUILD', DEMO_IDS.earlyBuild, () => builds.build(request(DEMO_IDS.earlyBuild, [DEMO_IDS.carrierNormalization], DEMO_INSTANTS.earlyCutoff), DEMO_INSTANTS.builtAt)),
    );

    return {
      schema: PRODUCTION_SCHEMA,
      fixture_only: true,
      mode: 'LOCAL_DEVELOPMENT',
      instants: { ...DEMO_INSTANTS },
      contracts: { adapter: { id: CARRIER_ADAPTER.id, version: CARRIER_ADAPTER.version }, candidateBuild: { id: CANDIDATE_BUILD_CONTRACT.id, version: CANDIDATE_BUILD_CONTRACT.version } },
      inputs: INPUTS.map((path) => { const bytes = read(path); return { path, contentDigest: byteDigest(bytes), byteLength: bytes.byteLength }; }),
      acquisitions: [carrier, drifted, notice],
      normalizations: [normalized, quarantined],
      builds: [build],
      refusals,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
