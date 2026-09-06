import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import demoJson from '@/fixtures/production/demo.json';
import type { ProductionDemo } from '@/domain/production';
import type { ProductionResult, ProductionRun } from '@/production/contracts';
import { CARAVAN_DEMO_DEFINITION, CARAVAN_DEMO_PURPOSE, caravanDemoSource } from '@/production/demo';
import { ProductionPath, type ProductionPathProps } from './ProductionPath';

const demo = demoJson as unknown as ProductionDemo;
const carrierText = '{"schema":"caravan.carrier-source.v1","sourceRecordId":"demo-carrier-001","legalName":"  Demonstration Carriers Incorporated  ","registrationNumber":"DEMO-REG-001","operatingSite":null,"validTime":{"state":"UNOBSERVED","from":null,"to":null}}';
const policy = { registrationId: 'fmcsa-company-census:qualification:2026-09-05', sourceId: 'fmcsa-company-census', displayName: 'FMCSA Company Census — internal qualification', sourceClass: 'public-government-company-census', licenseId: 'operator-qualification:provider-license-unresolved', policyVersion: '2026-09-05.v1', effectiveFrom: '2026-09-05T00:00:00.000Z', effectiveUntil: '2026-10-05T00:00:00.000Z', permittedPurposes: ['source-qualification'], allowedOperations: ['INGEST', 'DERIVE'] as const, allowedAudiences: ['INTERNAL'] as const, retention: { mode: 'INDEFINITE' as const } };
const FIELDS = ['dot_number', 'legal_name', 'business_org_desc', 'status_code', 'carrier_operation', 'phy_country', 'phy_state', 'power_units', 'total_drivers', 'mcs150_date', 'mcs150_mileage', 'mcs150_mileage_year', 'docket1prefix', 'docket1', 'docket1_status_code'];

function digestOf(value: unknown): string {
  const text = JSON.stringify(value); let hash = 5381;
  for (let index = 0; index < text.length; index++) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  return `sha256:${hash.toString(16).padStart(64, '0')}`;
}
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const refusal = (code: string, message: string) => ({ schema: 'payload.production-error.v1', mode: 'LOCAL_DEVELOPMENT', canonicalAdmission: false, error: { code, message } });
const AT = '2026-09-06T10:00:00.000Z';
const census = { schema: 'payload.source-capture-inspection.v1', state: 'CAPTURED', integrity: 'RECOMPUTED_LOCAL', canonicalAdmission: false, sourceTruthClaimed: false, customerDistributionPermitted: false, independentVerification: false, intent: { request: { requestId: 'fmcsa-census-80806-2026-09-05-qualification' } }, receipt: { state: 'CAPTURED', digest: digestOf('receipt') },
  acquisition: { id: 'source-capture:fmcsa-census-80806-2026-09-05-qualification', digest: digestOf('acq'), contentDigest: digestOf('bytes'), byteLength: 371, capturedAt: '2026-09-05T20:48:11.364Z' },
  observations: { schema: 'payload.fmcsa-census-observations.v1', sourceId: 'fmcsa-company-census', records: [{ dot_number: '80806', legal_name: 'SYNTHETIC CENSUS CORPORATION', business_org_desc: 'CORPORATION', phy_country: 'US', phy_state: 'OH', status_code: 'A', carrier_operation: null, power_units: '4', total_drivers: '5', mcs150_date: '20260801', mcs150_mileage: null, mcs150_mileage_year: null, docket1prefix: null, docket1: null, docket1_status_code: null, identityStatus: 'UNRESOLVED', canonicalId: null }], notReturned: [] } };

/** A fake rail with the real rail's identity discipline: an identity names its inputs forever; a changed command conflicts; malformed bytes are captured and quarantined at normalization. */
function fakeRail(options: { availability?: 'ENABLED' | 'DISABLED' | 'LOCAL_ONLY'; readback?: 'FOUND' | 'NOT_FOUND' } = {}) {
  const runs = new Map<string, { digest: string; result: ProductionResult }>();
  const bytes = new Map<string, string>();
  const run = (id: string, state: ProductionRun['state'], stages: ProductionRun['stages'], outputs: ProductionRun['outputs'], failure: ProductionRun['failure'] = null): ProductionRun => ({ schema: 'payload.production-run.v1', id, mode: 'LOCAL_DEVELOPMENT', request: {}, requestDigest: digestOf(id), startedAt: AT, completedAt: AT, state, stages, outputs, failure, policyAuthority: 'OPERATOR_DECLARATION', canonicalAdmission: false, releaseActivated: false, sourceTruthClaimed: false, completenessClaimed: false, digest: digestOf(`run:${id}`), coverageVerified: false, freshnessVerified: false, definitionRequirementsVerified: false });
  function execute(command: Record<string, unknown>): ProductionResult {
    const id = String(command.requestId);
    const out = (kind: ProductionRun['outputs'][number]['kind'], objectId: string) => ({ kind, id: objectId, digest: digestOf(`${kind}:${objectId}`) });
    switch (command.kind) {
      case 'REGISTER_CORPUS': { const output = out('CORPUS', 'demo-caravan-carrier-definition'); return { status: 'CREATED', historicalRetry: false, run: run(id, 'COMPLETED', [{ stage: 'REGISTRATION', state: 'COMPLETED', code: 'CORPUS_REGISTERED', outputs: [output] }], [output]) }; }
      case 'REGISTER_SOURCE': { const output = out('SOURCE', 'demo-caravan-carrier-source'); return { status: 'CREATED', historicalRetry: false, run: run(id, 'COMPLETED', [{ stage: 'REGISTRATION', state: 'COMPLETED', code: 'SOURCE_REGISTERED', outputs: [output] }], [output]) }; }
      case 'ACQUIRE': { const output = out('ACQUISITION', `acq:${id}`); bytes.set(output.id, Buffer.from(String(command.contentBase64), 'base64').toString('utf8')); return { status: 'CREATED', historicalRetry: false, run: run(id, 'COMPLETED', [{ stage: 'CAPTURE', state: 'COMPLETED', code: 'BYTES_RETAINED', outputs: [output] }, { stage: 'EVIDENCE_INSPECTION', state: 'COMPLETED', code: 'RECOMPUTED', outputs: [] }, { stage: 'EXTRACTION', state: 'NOT_RUN', code: 'SEPARATE_OPERATION_REQUIRED', outputs: [] }], [output]) }; }
      case 'NORMALIZE': {
        const acquisition = command.acquisition as { id: string }; const text = bytes.get(acquisition.id) ?? '';
        let valid = true; try { JSON.parse(text); } catch { valid = false; }
        const output = out('NORMALIZATION', `norm:${id}`);
        if (valid) return { status: 'CREATED', historicalRetry: false, run: run(id, 'COMPLETED', [{ stage: 'EXTRACTION', state: 'COMPLETED', code: 'STRUCTURED_JSON_DECODED', outputs: [output] }, { stage: 'NORMALIZATION', state: 'COMPLETED', code: 'CANDIDATE_PUBLISHED', outputs: [output] }], [output]) };
        return { status: 'CREATED', historicalRetry: false, run: run(id, 'QUARANTINED', [{ stage: 'EXTRACTION', state: 'QUARANTINED', code: 'INVALID_SOURCE_JSON', outputs: [output] }, { stage: 'NORMALIZATION', state: 'NOT_RUN', code: 'INVALID_SOURCE_JSON', outputs: [output] }], [output], { code: 'INVALID_SOURCE_JSON', artifactRetained: true, receiptRetained: true, runReceiptRetained: true, retry: { sameRequest: true, newRequestRequired: true }, remediation: ['INSPECT_QUARANTINE', 'CAPTURE_CORRECTED_SOURCE_UNDER_NEW_REQUEST_ID'] }) };
      }
      case 'BUILD_CANDIDATES': { const output = out('CANDIDATE_BUILD', `build:${id}`); return { status: 'CREATED', historicalRetry: false, run: run(id, 'COMPLETED', [{ stage: 'CANDIDATE_ASSEMBLY', state: 'COMPLETED', code: 'MEMBERS_ASSEMBLED', outputs: [output] }, { stage: 'BUILD_INSPECTION', state: 'COMPLETED', code: 'RECOMPUTED', outputs: [] }], [output]) }; }
      default: throw new Error('unexpected kind');
    }
  }
  function dataFor(kind: string, reference: { id: string; digest: string }): Record<string, unknown> {
    if (kind === 'CANDIDATE_BUILD') return { state: 'UNADMITTED', builtAt: AT, knownThrough: AT, recordCount: 1, recordsRoot: digestOf('root'), members: [{ normalization: { id: 'norm:x', digest: digestOf('NORMALIZATION:norm:x') }, candidate: { id: 'norm:x:candidate', digest: digestOf('candidate') }, identity: { state: 'UNRESOLVED', canonicalId: null }, sourceClass: 'OPERATOR_DECLARATION', knownAt: AT, validTime: { state: 'UNOBSERVED' }, sourcePolicy: { id: 'p', digest: digestOf('p') }, deriveDecision: { state: 'ALLOWED' } }], canonicalAdmission: false, releaseActivated: false };
    if (kind === 'NORMALIZATION') return { state: 'NORMALIZED', deriveDecision: { state: 'ALLOWED' }, normalizedAt: AT, reasons: [], candidate: { candidateId: 'cand-1', state: 'UNADMITTED', identity: { state: 'UNRESOLVED', canonicalId: null, sourceId: 's', sourceRecordId: 'demo-carrier-001' }, fields: { legalName: 'Demonstration Carriers Incorporated', registrationNumber: 'DEMO-REG-001', operatingSite: null }, missingFields: ['operatingSite'], validTime: { state: 'UNOBSERVED' }, knownAt: AT, provenance: { acquisition: { id: 'acq:x', digest: digestOf('ACQUISITION:acq:x') } } } };
    if (kind === 'ACQUISITION') return { id: reference.id, digest: reference.digest, evidence: { id: `evidence:${reference.id}`, contentDigest: digestOf('content'), byteLength: 42, mediaType: 'application/json' }, receipt: { id: `receipt:${reference.id}`, digest: digestOf('receipt'), storedAt: AT }, sourcePolicy: { id: 'demo-caravan-carrier-policy', digest: digestOf('policy'), policyVersion: '1.0.0' }, capturedAt: AT, ingestDecision: { state: 'ALLOWED' } };
    if (kind === 'RUN') return runs.get(reference.id)?.result.run as unknown as Record<string, unknown> ?? {};
    return { id: reference.id, spec: { id: reference.id, version: '1.0.0', domain: 'CARAVAN', recordType: 'Carrier' } };
  }
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? 'GET';
    if (url === '/api/production' && method === 'GET') {
      if (options.availability === 'DISABLED') return json({ schema: 'payload.production-availability.v1', mode: 'LOCAL_DEVELOPMENT', enabled: false });
      if (options.availability === 'LOCAL_ONLY') return json(refusal('LOCAL_ONLY', 'Use the production inspector from the same loopback origin.'), 403);
      return json({ schema: 'payload.production-catalog.v1', mode: 'LOCAL_DEVELOPMENT', corpora: [...runs.values()].filter((entry) => entry.result.run.outputs[0]?.kind === 'CORPUS').map((entry) => ({ reference: entry.result.run.outputs[0], version: '1.0.0', domain: 'CARAVAN', recordType: 'Carrier' })), sources: [], runs: [...runs.values()].map((entry) => ({ id: entry.result.run.id, kind: 'X', state: entry.result.run.state, reference: { id: entry.result.run.id, digest: entry.result.run.digest }, startedAt: AT, outputCount: entry.result.run.outputs.length })), canonicalAdmission: false });
    }
    if (url.startsWith('/api/production/source-captures/')) return options.readback === 'FOUND' ? json({ schema: 'payload.source-capture-readback.v1', requestId: 'fmcsa-census-80806-2026-09-05-qualification', inspection: census, collectionPerformed: false }) : json(refusal('SOURCE_CAPTURE_NOT_FOUND', 'No stored source capture has this request ID.'), 404);
    if (url === '/api/production/inspect') {
      const { kind, reference } = JSON.parse(String(init?.body));
      // The real rail's reference parser: exactly an identifier and a full digest, nothing else.
      if (Object.keys(reference).sort().join() !== 'digest,id' || !/^sha256:[a-f0-9]{64}$/.test(reference.digest)) return json(refusal('INVALID_REQUEST', 'An exact identifier and full SHA-256 digest are required.'), 400);
      return json({ schema: 'payload.production-inspection.v1', mode: 'LOCAL_DEVELOPMENT', kind, reference, integrity: 'RECOMPUTED_LOCAL', historical: true, currentPermissionGranted: false, rawBytesIncluded: false, canonicalAdmission: false, data: dataFor(kind, reference) }); }
    if (url === '/api/production' && method === 'POST') {
      const command = JSON.parse(String(init?.body)) as Record<string, unknown>; const id = String(command.requestId); const digest = digestOf(command);
      const prior = runs.get(id);
      if (prior) return prior.digest === digest ? json({ ...prior.result, status: 'EXISTING', historicalRetry: true }) : json(refusal('REQUEST_CONFLICT', 'This request identity already names different inputs.'), 409);
      const result = execute(command); runs.set(id, { digest, result }); return json(result);
    }
    throw new Error(`unexpected request ${method} ${url}`);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls: fetch, runs };
}

function props(overrides: Partial<ProductionPathProps> = {}): ProductionPathProps {
  return { enabled: true, demo, definition: CARAVAN_DEMO_DEFINITION, sourceTemplate: caravanDemoSource({ id: 'PENDING', digest: `sha256:${'0'.repeat(64)}` }), purpose: CARAVAN_DEMO_PURPOSE,
    carrier: { path: 'examples/carrier/source.json', text: carrierText, base64: Buffer.from(carrierText, 'utf8').toString('base64'), byteLength: Buffer.byteLength(carrierText) },
    fmcsa: { request: { requestId: 'fmcsa-census-80806-2026-09-05-qualification', sourceId: 'fmcsa-company-census', usdot: ['80806'] }, policy, fields: FIELDS, requestPath: 'examples/sources/fmcsa-company-census.json' }, defaultName: 'path-test', ...overrides };
}
const stage = (id: string) => document.querySelector(`[data-stage="${id}"]`)!;
const step = (key: string) => screen.getByTestId(`step-${key}`);

afterEach(() => { vi.restoreAllMocks(); });

describe('ProductionPath', () => {
  it('in fixture mode shows the committed demonstration on the path, the enable command, the real source without readback, and every blocker, without touching the rail', () => {
    const rail = fakeRail();
    render(<ProductionPath {...props({ enabled: false, fetchImpl: rail.fetch })} />);
    expect(screen.getByTestId('production-path')).toHaveAttribute('data-mode', 'FIXTURE');
    expect([...document.querySelectorAll('[data-stage]')].map((cell) => `${cell.getAttribute('data-stage')}:${cell.getAttribute('data-state')}`)).toEqual(['source:DEMONSTRATION', 'acquisition:DEMONSTRATION', 'normalization:DEMONSTRATION', 'build:DEMONSTRATION', 'inspection:DEMONSTRATION', 'notation:BLOCKED', 'release:BLOCKED']);
    expect(screen.getByTestId('stage-build-detail')).toHaveTextContent('demo-caravan-carrier-build-001');
    expect(screen.getByTestId('rail-disabled')).toHaveTextContent('npm run dev:production');
    expect(screen.queryByTestId('run-console')).toBeNull();
    expect(screen.getByTestId('source-readback')).toHaveAttribute('data-status', 'UNAVAILABLE');
    expect(screen.getByTestId('source-readback')).toHaveTextContent('npm run source -- inspect --request-id fmcsa-census-80806-2026-09-05-qualification');
    expect(screen.getByTestId('source-card')).toHaveTextContent('2026-09-05 00:00 UTC → 2026-10-05 00:00 UTC');
    expect(screen.getByTestId('source-card')).toHaveTextContent('No normalization adapter exists for fmcsa-company-census');
    expect(screen.getByTestId('notation-card')).toHaveTextContent('ATTACH_EVIDENCE_REFERENCE');
    expect(screen.getByTestId('release-card')).toHaveTextContent('No admission authority exists');
    expect(screen.getByTestId('no-reference')).toBeInTheDocument();
    expect(rail.calls).not.toHaveBeenCalled();
  });

  it('drives the rail step by step: each stage turns DONE with the exact reference, an identical retry is historical, the build is inspectable as UNADMITTED, and the notation reference appears', async () => {
    const rail = fakeRail(); const user = userEvent.setup();
    render(<ProductionPath {...props({ fetchImpl: rail.fetch })} />);
    expect(screen.getByTestId('production-path')).toHaveAttribute('data-mode', 'LOCAL');
    await waitFor(() => expect(screen.getByTestId('source-readback')).toHaveAttribute('data-status', 'NOT_FOUND'));
    expect(screen.getByTestId('stage-source-detail')).toHaveTextContent('not in this machine’s qualification root');
    expect(stage('acquisition')).toHaveAttribute('data-state', 'WAITING');
    expect(screen.getByTestId('send-source')).toBeDisabled();
    await user.click(screen.getByTestId('send-corpus'));
    await waitFor(() => expect(step('corpus')).toHaveAttribute('data-run-state', 'COMPLETED'));
    expect(within(step('corpus')).getByTestId('receipt')).toHaveTextContent('CREATED');
    expect(within(step('corpus')).getByTestId('run-stages').querySelector('[data-run-stage="REGISTRATION"]')).toHaveAttribute('data-state', 'COMPLETED');
    await user.click(screen.getByTestId('send-source'));
    await waitFor(() => expect(step('source')).toHaveAttribute('data-run-state', 'COMPLETED'));
    const sourceCommand = JSON.parse(String(rail.calls.mock.calls.find((call) => String(call[1]?.body ?? '').includes('REGISTER_SOURCE'))![1]!.body));
    expect(sourceCommand.source.corpus).toEqual({ id: 'demo-caravan-carrier-definition', digest: digestOf('CORPUS:demo-caravan-carrier-definition') });
    expect(stage('acquisition')).toHaveAttribute('data-state', 'READY');
    await user.click(screen.getByTestId('send-capture'));
    await waitFor(() => expect(stage('acquisition')).toHaveAttribute('data-state', 'DONE'));
    expect(stage('acquisition')).toHaveTextContent('acq:path-test-capture');
    const capture = JSON.parse(String(rail.calls.mock.calls.find((call) => String(call[1]?.body ?? '').includes('"ACQUIRE"'))![1]!.body));
    expect(Buffer.from(capture.contentBase64, 'base64').toString('utf8')).toBe(carrierText);
    // The same identity again: the original receipt, no new execution.
    await user.click(screen.getByTestId('send-capture'));
    await waitFor(() => expect(within(step('capture')).getByTestId('receipt')).toHaveAttribute('data-historical', 'true'));
    expect(screen.getByTestId('stage-acquisition-detail')).toHaveTextContent('Historical retry');
    expect(stage('normalization')).toHaveAttribute('data-state', 'READY');
    await user.click(screen.getByTestId('send-normalize'));
    await waitFor(() => expect(stage('normalization')).toHaveAttribute('data-state', 'DONE'));
    expect(stage('build')).toHaveAttribute('data-state', 'READY');
    await user.click(screen.getByTestId('send-build'));
    await waitFor(() => expect(stage('build')).toHaveAttribute('data-state', 'DONE'));
    expect([...document.querySelectorAll('[data-stage]')].map((cell) => cell.getAttribute('data-state'))).toEqual(['READY', 'DONE', 'DONE', 'DONE', 'READY', 'BLOCKED', 'BLOCKED']);
    const build = JSON.parse(String(rail.calls.mock.calls.find((call) => String(call[1]?.body ?? '').includes('BUILD_CANDIDATES'))![1]!.body));
    expect(build.members).toEqual([{ id: 'norm:path-test-normalize', digest: digestOf('NORMALIZATION:norm:path-test-normalize') }]);
    expect(screen.getByTestId('build-reference')).toHaveAttribute('data-target', 'build:path-test-build');
    expect(screen.getByTestId('build-reference')).toHaveTextContent('"attachment": "DISABLED"');
    expect(screen.getByTestId('stage-notation-detail')).toHaveTextContent('attachment is disabled');
    // Inspect the build from its own receipt: exact reference, integrity recomputed, UNADMITTED.
    await user.click(within(step('build')).getAllByRole('button', { name: /CANDIDATE BUILD.*build:path-test-build/ })[0]);
    await waitFor(() => expect(screen.getByTestId('inspection')).toHaveAttribute('data-kind', 'CANDIDATE_BUILD'));
    expect(screen.getByTestId('production-inspector')).toHaveTextContent('UNADMITTED');
    expect(screen.getByTestId('inspection-flags')).toHaveTextContent('canonicalAdmission false');
    expect(screen.getByTestId('production-path')).toHaveAttribute('data-inspecting', 'CANDIDATE_BUILD:build:path-test-build');
    // Follow a member into its normalization and its candidate, then the acquisition.
    expect(screen.getByTestId('build-members')).toHaveTextContent('identity UNRESOLVED · canonical id null · source class OPERATOR_DECLARATION');
    await user.click(within(screen.getByTestId('build-members')).getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(screen.getByTestId('inspection')).toHaveAttribute('data-kind', 'NORMALIZATION'));
    expect(screen.getByTestId('candidate')).toHaveTextContent('UNRESOLVED');
    expect(screen.getByTestId('candidate')).toHaveTextContent('Missing fields, as missing: operatingSite');
    await user.click(within(screen.getByTestId('candidate')).getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(screen.getByTestId('inspection')).toHaveAttribute('data-kind', 'ACQUISITION'));
    expect(screen.getByTestId('inspection')).toHaveTextContent('INGEST decision');
    await waitFor(() => expect(screen.getByTestId('catalog-runs').querySelectorAll('tr[data-run]')).toHaveLength(5));
  });

  it('captures malformed bytes as bytes, quarantines them at normalization with the rail’s recovery, and a new identity renames this step and every later one', async () => {
    const rail = fakeRail(); const user = userEvent.setup();
    render(<ProductionPath {...props({ fetchImpl: rail.fetch })} />);
    await user.click(screen.getByTestId('send-corpus'));
    await waitFor(() => expect(step('corpus')).toHaveAttribute('data-run-state', 'COMPLETED'));
    await user.click(screen.getByTestId('send-source'));
    await waitFor(() => expect(step('source')).toHaveAttribute('data-run-state', 'COMPLETED'));
    await user.click(screen.getByLabelText('pasted bytes'));
    expect(screen.getByTestId('send-capture')).toBeDisabled();
    await user.type(screen.getByLabelText(/Source bytes to capture/), '{{bad');
    await user.click(screen.getByTestId('send-capture'));
    await waitFor(() => expect(stage('acquisition')).toHaveAttribute('data-state', 'DONE'));
    await user.click(screen.getByTestId('send-normalize'));
    await waitFor(() => expect(stage('normalization')).toHaveAttribute('data-state', 'QUARANTINED'));
    expect(step('normalize')).toHaveAttribute('data-run-state', 'QUARANTINED');
    expect(within(step('normalize')).getByTestId('failure')).toHaveAttribute('data-code', 'INVALID_SOURCE_JSON');
    expect(within(step('normalize')).getByTestId('failure')).toHaveTextContent('artifact retained true');
    expect(within(step('normalize')).getByTestId('failure')).toHaveTextContent('Capture corrected source bytes under a new request identity');
    expect([...within(step('normalize')).getByTestId('run-recovery').querySelectorAll('[data-recovery]')].map((item) => item.getAttribute('data-recovery'))).toEqual(['INSPECT_QUARANTINE', 'RETRY_IDENTICAL', 'CORRECT_INPUT', 'NEW_IDENTITY']);
    expect(screen.getByTestId('send-build')).toBeDisabled();
    expect(step('build')).toHaveTextContent('needs a NORMALIZED member');
    expect(stage('build')).toHaveAttribute('data-state', 'WAITING');
    await user.click(within(step('normalize')).getByRole('button', { name: 'Inspect the quarantine' }));
    await waitFor(() => expect(screen.getByTestId('production-path')).toHaveAttribute('data-inspecting', 'NORMALIZATION:norm:path-test-normalize'));
    await user.click(within(step('normalize')).getByRole('button', { name: 'Use a new request identity' }));
    expect(step('normalize')).toHaveAttribute('data-request-id', 'path-test-normalize-a2');
    expect(step('normalize')).toHaveAttribute('data-status', 'IDLE');
    expect(step('build')).toHaveAttribute('data-request-id', 'path-test-build-a2');
    expect(step('capture')).toHaveAttribute('data-request-id', 'path-test-capture');
    expect(stage('normalization')).toHaveAttribute('data-state', 'READY');
  });

  it('shows a transport refusal with its meaning and recovery: a changed command under the same identity is a conflict, resolved by a new identity', async () => {
    const rail = fakeRail(); const user = userEvent.setup();
    render(<ProductionPath {...props({ fetchImpl: rail.fetch })} />);
    await user.click(screen.getByTestId('send-corpus'));
    await waitFor(() => expect(step('corpus')).toHaveAttribute('data-run-state', 'COMPLETED'));
    await user.click(screen.getByTestId('send-source'));
    await waitFor(() => expect(step('source')).toHaveAttribute('data-run-state', 'COMPLETED'));
    await user.click(screen.getByTestId('send-capture'));
    await waitFor(() => expect(stage('acquisition')).toHaveAttribute('data-state', 'DONE'));
    await user.click(screen.getByLabelText('pasted bytes'));
    await user.type(screen.getByLabelText(/Source bytes to capture/), '{{"other":1}');
    await user.click(screen.getByRole('button', { name: 'Capture again (same identity)' }));
    await waitFor(() => expect(step('capture')).toHaveAttribute('data-run-state', 'REFUSED'));
    expect(within(step('capture')).getByTestId('refusal')).toHaveAttribute('data-code', 'REQUEST_CONFLICT');
    expect(within(step('capture')).getByTestId('refusal')).toHaveTextContent('Identities are never reassigned');
    expect(stage('acquisition')).toHaveAttribute('data-state', 'FAILED');
    await user.click(within(step('capture')).getByRole('button', { name: 'Use a new request identity' }));
    expect(step('capture')).toHaveAttribute('data-request-id', 'path-test-capture-a2');
    expect(step('normalize')).toHaveAttribute('data-request-id', 'path-test-normalize-a2');
    await user.click(screen.getByTestId('send-capture'));
    await waitFor(() => expect(stage('acquisition')).toHaveAttribute('data-state', 'DONE'));
    expect(stage('acquisition')).toHaveTextContent('acq:path-test-capture-a2');
  });

  it('reads the real source capture back where it exists, marks the source DONE and names the missing adapter', async () => {
    const rail = fakeRail({ readback: 'FOUND' });
    render(<ProductionPath {...props({ fetchImpl: rail.fetch })} />);
    await waitFor(() => expect(screen.getByTestId('source-readback')).toHaveAttribute('data-status', 'FOUND'));
    expect(stage('source')).toHaveAttribute('data-state', 'DONE');
    expect(screen.getByTestId('stage-source-detail')).toHaveTextContent('CAPTURED, 1 record, 0 not returned. Cannot enter normalization.');
    expect(screen.getByTestId('census-records')).toHaveTextContent('80806');
    expect(screen.getByTestId('census-records')).toHaveTextContent('UNRESOLVED · null');
    expect(screen.getByTestId('source-readback')).toHaveTextContent('371 source-original bytes');
    expect(screen.getByTestId('source-readback')).toHaveTextContent('customerDistributionPermitted false');
  });

  it('follows the rail’s own answer about its mode: an availability descriptor makes the page fixture, and a loopback refusal is shown with its recovery', async () => {
    const disabled = fakeRail({ availability: 'DISABLED' });
    const first = render(<ProductionPath {...props({ fetchImpl: disabled.fetch })} />);
    await waitFor(() => expect(screen.getByTestId('production-path')).toHaveAttribute('data-mode', 'FIXTURE'));
    expect(screen.getByTestId('rail-disabled')).toBeInTheDocument();
    first.unmount();
    const remote = fakeRail({ availability: 'LOCAL_ONLY' });
    render(<ProductionPath {...props({ fetchImpl: remote.fetch })} />);
    await waitFor(() => expect(screen.getByTestId('catalog-error')).toHaveTextContent('LOCAL_ONLY'));
    expect(screen.getByTestId('catalog-error')).toHaveTextContent('answers only the same loopback origin');
  });
});
