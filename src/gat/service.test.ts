import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake, type LocalIntakeManifest } from '../data-os/local-intake';
import * as files from '../data-os/local-files';
import { localRecordDigest } from '../data-os/local-record';
import { GAT_ADAPTER_VERSION, GAT_RUNTIME_IDENTITY } from './pin';
import { type GatAuditRequest, parseGatAuditRequest } from './contracts';
import { type GatAuditReport, projectGatAudit, validateGatAuditReport } from './report';
import { runGatAudit } from './runtime';
import { GatAuditService } from './service';

const at = '2026-09-05T12:00:00.000Z';
const expiry = '2026-09-06T00:00:00.000Z';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'payload-gat-service-')); });
afterEach(() => { vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

function capture(bytes = Buffer.from('not an IFC file'), options: { derive?: boolean; mediaType?: string } = {}) {
  const manifest: LocalIntakeManifest = {
    schema: 'payload.local-intake-request.v1', acquisitionId: 'gat-acquisition-1', evidenceId: 'gat-evidence-1', purpose: 'GAT_TEST', mediaType: options.mediaType ?? 'model/ifc', capturedAt: '2026-09-05T10:00:00.000Z',
    sourceRegistration: { registrationId: 'gat-policy-1', sourceId: 'notation://source/local/gat-demo', displayName: 'Synthetic IFC demonstration', sourceClass: 'SYNTHETIC_DEMONSTRATION',
      licenseId: 'local-declaration', policyVersion: '1.0.0', effectiveFrom: '2026-09-01T00:00:00.000Z', effectiveUntil: expiry,
      permittedPurposes: ['GAT_TEST', 'ALTERNATE_TEST'], allowedOperations: options.derive === false ? ['INGEST'] : ['INGEST', 'DERIVE'],
      allowedAudiences: ['INTERNAL'], retention: { mode: 'UNTIL_SOURCE_EXPIRY' } },
  };
  const intake = new LocalEvidenceIntake(root);
  const acquisition = intake.capture(manifest, bytes, '2026-09-05T11:00:00.000Z').acquisition;
  const request: GatAuditRequest = { schema: 'payload.gat-audit-request.v1', requestId: 'gat-audit-1', operation: 'IFC_AUDIT', adapterVersion: GAT_ADAPTER_VERSION, purpose: 'GAT_TEST',
    source: { acquisition: { id: manifest.acquisitionId, digest: acquisition.digest }, evidence: { id: manifest.evidenceId, contentDigest: acquisition.request.contentDigest } } };
  return { bytes, intake, acquisition, request };
}
function blockedReport(bytes: Uint8Array): GatAuditReport {
  const notRun = { status: 'NOT_RUN' as const, error_type: null, message: 'parsing failed', details: {} };
  return { format: 'gat-ifc-audit-v1', source: { path: 'source.ifc', sha256: byteDigest(bytes).slice(7), size_bytes: bytes.byteLength },
    parse: { status: 'BLOCKED', error_type: 'ParserError', message: 'Uncontrolled error C:\\private\\engine.py /host/secret', details: {} }, schema: null, units: [],
    inventory: { instance_count: 0, type_counts: {}, opaque_type_counts: {}, opt_in_product_candidate_counts: {}, supported_product_count: 0, supported_product_status_counts: {}, beam_geometry: null },
    adapter_scope: { supported_ifc_product_types: [], opt_in_ifc_product_types: {}, required_quantities: {}, coverage_boundary: 'supported-product-scope-only' },
    entities: [], model_issues: [{ code: 'PARSE_FAILED', severity: 'ERROR', message: 'C:\\private\\engine.py', step_id: null, ifc_type: null }], issue_counts: { PARSE_FAILED: 1 },
    pipeline: { lowering: notRun, compilation: notRun, verification: notRun, world_digest: null, pipeline_ready: false },
    assurance: { audit_authorizes_decisions: false, requires_explicit_decision_scope: true, partial_ingestion_may_authorize: false } };
}
function runtime() {
  return vi.fn<typeof runGatAudit>().mockImplementation(async (bytes) => {
    const report = blockedReport(bytes);
    return { report, reportBytes: Buffer.from(JSON.stringify(report, null, 2) + '\n'), runtime: { ...GAT_RUNTIME_IDENTITY } };
  });
}
function receiptPath(id = 'gat-audit-1') { return join(root, 'gat-audits', 'receipts', `${byteDigest(Buffer.from(id)).slice(7)}.json`); }
function artifactPath(digest: string) { return join(root, 'gat-audits', 'artifacts', `${digest.slice(7)}.json`); }

describe('GAT persisted service', () => {
  it('retains the original report unchanged and exposes only a separate source-bound safe projection', async () => {
    const source = capture(); const execute = runtime();
    const result = await new GatAuditService(root, execute, () => at).audit(source.request);
    expect(result.status).toBe('CREATED');
    expect(result.inspection).toMatchObject({ outcome: 'AUDIT_BLOCKED', source: source.request.source, currentRightsGrant: false, originalReportDelivered: false, canonicalAdmission: false,
      processingPermission: { state: 'ALLOWED', evaluatedAt: at }, retained: { receipt: true, report: true, projection: true },
      stages: { evidence: 'PASS', processingPermission: 'ALLOWED', execution: 'COMPLETED', report: 'RETAINED', parse: 'BLOCKED', lowering: 'NOT_RUN', compilation: 'NOT_RUN', verification: 'NOT_RUN' } });
    expect(JSON.stringify(result.inspection)).not.toMatch(/private|engine\.py|Uncontrolled|C:\\|\/host/);
    expect(readFileSync(artifactPath(result.inspection.report!.contentDigest))).toEqual((await execute.mock.results[0].value).reportBytes);
    expect(source.intake.objects.get(source.acquisition.request.contentDigest)).toEqual(source.bytes);
    const reopened = new GatAuditService(root, vi.fn<typeof runGatAudit>()).inspect(source.request.requestId);
    expect(reopened).toEqual(result.inspection);
  });

  it('retries identically without executing again or reevaluating current permission and separates new executions', async () => {
    const source = capture(); const execute = runtime();
    const first = await new GatAuditService(root, execute, () => at).audit(source.request);
    const saved = readFileSync(receiptPath());
    const later = new GatAuditService(root, execute, () => expiry);
    expect(await later.audit(Object.fromEntries(Object.entries(source.request).reverse()))).toEqual({ status: 'EXISTING', inspection: first.inspection });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(readFileSync(receiptPath())).toEqual(saved);
    const fresh = await later.audit({ ...source.request, requestId: 'gat-audit-2' });
    expect(fresh.inspection.outcome).toBe('PROCESSING_DISALLOWED');
    expect(fresh.inspection.processingPermission?.reasons).toContain('OUTSIDE_EFFECTIVE_WINDOW');
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(later.audit({ ...source.request, purpose: 'ALTERNATE_TEST' })).rejects.toMatchObject({ code: 'GAT_REQUEST_CONFLICT' });
    expect(readFileSync(receiptPath())).toEqual(saved);
  });

  it.each(['acquisition digest', 'evidence digest', 'evidence id'] as const)('prevents execution for mismatched %s and retains a structured failure', async (field) => {
    const source = capture(); const execute = runtime();
    if (field === 'acquisition digest') source.request.source.acquisition.digest = `sha256:${'0'.repeat(64)}`;
    if (field === 'evidence digest') source.request.source.evidence.contentDigest = `sha256:${'0'.repeat(64)}`;
    if (field === 'evidence id') source.request.source.evidence.id = 'another-evidence';
    const result = await new GatAuditService(root, execute, () => at).audit(source.request);
    expect(result.inspection.outcome).toBe('SOURCE_REFERENCE_MISMATCH');
    expect(result.inspection.report).toBeNull();
    expect(result.inspection.stages.execution).toBe('NOT_RUN');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['missing', 'corrupt', 'denied', 'media'] as const)('retains %s source failure without running the engine', async (defect) => {
    const source = capture(undefined, { derive: defect !== 'denied', mediaType: defect === 'media' ? 'text/plain' : undefined });
    const execute = runtime();
    if (defect === 'missing') source.request.source.acquisition.id = 'unretained';
    if (defect === 'corrupt') writeFileSync(join(root, 'objects', ...source.acquisition.capture.evidence.storageKey.split('/')), 'changed');
    const result = await new GatAuditService(root, execute, () => at).audit(source.request);
    const expected = { missing: 'SOURCE_UNAVAILABLE', corrupt: 'SOURCE_INTEGRITY_FAILED', denied: 'PROCESSING_DISALLOWED', media: 'SOURCE_MEDIA_UNSUPPORTED' };
    expect(result.inspection.outcome).toBe(expected[defect]);
    expect(result.inspection.report).toBeNull(); expect(execute).not.toHaveBeenCalled();
    expect(new GatAuditService(root, execute).inspect(source.request.requestId)).toEqual(result.inspection);
  });

  it.each(['ENGINE_UNAVAILABLE', 'ENGINE_INTEGRITY_FAILED', 'EXECUTION_TIMEOUT', 'EXECUTION_FAILED', 'INVALID_REPORT', 'INPUT_TOO_LARGE', 'ENGINE_BUSY'] as const)('records %s as failure, never a completed audit', async (code) => {
    const source = capture(); const execute = runtime().mockRejectedValue(Object.assign(new Error('C:\\host\\secret stderr'), { code }));
    const result = await new GatAuditService(root, execute, () => at).audit(source.request);
    expect(result.inspection).toMatchObject({ outcome: code, report: null, projection: null, stages: { execution: 'FAILED', report: 'NOT_RETAINED' } });
    expect(JSON.stringify(result.inspection)).not.toContain('secret');
    expect(result.inspection.retry.sameRequest).toBe('HISTORICAL_INSPECTION_NO_EXECUTION');
    await new GatAuditService(root, execute).audit(source.request);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed runtime reports and identities with bounded outcomes', async () => {
    const source = capture();
    const execute = runtime().mockResolvedValue({ report: blockedReport(source.bytes), reportBytes: Buffer.from('{}'), runtime: { ...GAT_RUNTIME_IDENTITY } });
    expect((await new GatAuditService(root, execute, () => at).audit(source.request)).inspection.outcome).toBe('INVALID_REPORT');
    execute.mockResolvedValue({ report: blockedReport(source.bytes), reportBytes: Buffer.from(JSON.stringify(blockedReport(source.bytes))), runtime: { ...GAT_RUNTIME_IDENTITY, engineCommit: 'untrusted' } });
    expect((await new GatAuditService(root, execute, () => at).audit({ ...source.request, requestId: 'other' })).inspection.outcome).toBe('ENGINE_INTEGRITY_FAILED');
  });

  it('reserves the request before awaiting execution and refuses concurrent duplicate work', async () => {
    const source = capture(); const execute = runtime();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    execute.mockImplementation(async (bytes) => { await waiting; const report = blockedReport(bytes); return { report, reportBytes: Buffer.from(JSON.stringify(report)), runtime: { ...GAT_RUNTIME_IDENTITY } }; });
    const service = new GatAuditService(root, execute, () => at);
    const first = service.audit(source.request);
    expect(() => service.inspectRequest(source.request.requestId)).toThrow('reserved but has no confirmed receipt');
    await expect(service.audit(source.request)).rejects.toMatchObject({ code: 'GAT_EXECUTION_INCOMPLETE' });
    await expect(service.audit({ ...source.request, purpose: 'ALTERNATE_TEST' })).rejects.toMatchObject({ code: 'GAT_REQUEST_CONFLICT' });
    expect(execute).toHaveBeenCalledTimes(1);
    release(); await first;
    expect((await service.audit(source.request)).status).toBe('EXISTING');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(['source', 'report', 'projection', 'receipt'] as const)('refuses corrupt retained %s without repair or rerunning', async (target) => {
    const source = capture(); const execute = runtime();
    const result = await new GatAuditService(root, execute, () => at).audit(source.request);
    const selectedPath = target === 'source' ? join(root, 'objects', ...source.acquisition.capture.evidence.storageKey.split('/'))
      : target === 'receipt' ? receiptPath() : artifactPath(target === 'report' ? result.inspection.report!.contentDigest : result.inspection.projectionReference!.contentDigest);
    writeFileSync(selectedPath, 'corrupted');
    const store = new GatAuditService(root, execute);
    expect(() => store.inspect(source.request.requestId)).toThrow('no longer validates');
    await expect(store.audit(source.request)).rejects.toMatchObject({ code: 'INVALID_STORED_GAT_AUDIT' });
    expect(readFileSync(selectedPath, 'utf8')).toBe('corrupted');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('preserves a report published before a later storage failure and never automatically repeats execution', async () => {
    const source = capture(); const execute = runtime(); const publish = files.publishImmutableFile;
    let artifacts = 0;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((base, segments, bytes, max) => {
      if (segments[1] === 'artifacts' && ++artifacts === 2) throw new Error('disk failure C:\\secret');
      return publish(base, segments, bytes, max);
    });
    const store = new GatAuditService(root, execute, () => at);
    await expect(store.audit(source.request)).rejects.toMatchObject({ code: 'GAT_SAVE_UNCONFIRMED', details: { retained: { reservation: true, report: { id: 'gat-audit-1:report' }, projection: 'UNCONFIRMED' },
      expectedOutputs: { projection: { id: 'gat-audit-1:projection' } } } });
    expect(readdirSync(join(root, 'gat-audits', 'artifacts'))).toHaveLength(1);
    expect(existsSync(receiptPath())).toBe(false);
    await expect(store.audit(source.request)).rejects.toMatchObject({ code: 'GAT_EXECUTION_INCOMPLETE' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(['report', 'projection'] as const)('discovers the exact %s when publication succeeds before the publisher throws', async (target) => {
    const source = capture(); const execute = runtime(); const publish = files.publishImmutableFile;
    let artifacts = 0;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((base, segments, bytes, maximum) => {
      const result = publish(base, segments, bytes, maximum);
      if (segments[1] === 'artifacts' && ++artifacts === (target === 'report' ? 1 : 2)) throw new Error('Cleanup failed after publication C:\\private');
      return result;
    });
    const store = new GatAuditService(root, execute, () => at);
    const failure = await store.audit(source.request).catch((error) => error);
    expect(failure).toMatchObject({ code: 'GAT_SAVE_UNCONFIRMED', details: { retained: { reservation: true, report: { id: 'gat-audit-1:report' } } } });
    expect(failure.details.retained.projection).toEqual(target === 'projection' ? expect.objectContaining({ id: 'gat-audit-1:projection' }) : null);
    const retained = failure.details.retained[target];
    expect(byteDigest(readFileSync(artifactPath(retained.contentDigest)))).toBe(retained.contentDigest);
    expect(failure.details.expectedOutputs[target]).toEqual(retained);
    expect(JSON.stringify(failure.details)).not.toContain('private');
    expect(existsSync(receiptPath())).toBe(false);
    await expect(store.audit(source.request)).rejects.toMatchObject({ code: 'GAT_EXECUTION_INCOMPLETE' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(['transient', 'persistent'] as const)('marks %s report readback failure using exact discovery, without claiming absence', async (failureMode) => {
    const source = capture(); const execute = runtime(); const read = files.readImmutableFile;
    let artifactReads = 0;
    vi.spyOn(files, 'readImmutableFile').mockImplementation((base, segments, maximum) => {
      if (segments[1] === 'artifacts' && (++artifactReads === 1 || failureMode === 'persistent')) throw new Error('Readback unavailable');
      return read(base, segments, maximum);
    });
    const store = new GatAuditService(root, execute, () => at);
    const failure = await store.audit(source.request).catch((error) => error);
    expect(failure.code).toBe('GAT_SAVE_UNCONFIRMED');
    expect(failure.details.retained.report).toEqual(failureMode === 'transient' ? expect.objectContaining({ id: 'gat-audit-1:report' }) : 'UNCONFIRMED');
    expect(failure.details.expectedOutputs.report).toMatchObject({ id: 'gat-audit-1:report', contentDigest: expect.stringMatching(/^sha256:/) });
    expect(failure.details.retained.projection).toBeNull();
    const expected = failure.details.expectedOutputs.report;
    expect(byteDigest(readFileSync(artifactPath(expected.contentDigest)))).toBe(expected.contentDigest);
    await expect(store.audit(source.request)).rejects.toMatchObject({ code: 'GAT_EXECUTION_INCOMPLETE' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('retains expected references when artifact readback raises the typed integrity error', async () => {
    const source = capture(); const execute = runtime(); const read = files.readImmutableFile;
    vi.spyOn(files, 'readImmutableFile').mockImplementation((base, segments, maximum) =>
      segments[1] === 'artifacts' ? undefined : read(base, segments, maximum));
    const store = new GatAuditService(root, execute, () => at);
    const failure = await store.audit(source.request).catch((error) => error);
    expect(failure.code).toBe('GAT_SAVE_UNCONFIRMED');
    expect(failure.details.retained.report).toBe('UNCONFIRMED');
    expect(failure.details.expectedOutputs.report).toMatchObject({ id: 'gat-audit-1:report', contentDigest: expect.stringMatching(/^sha256:/) });
    await expect(store.audit(source.request)).rejects.toMatchObject({ code: 'GAT_EXECUTION_INCOMPLETE' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(['missing source', 'media', 'permission'] as const)('rejects a rehashed receipt relabeling the actual %s gate failure', async (gate) => {
    const source = capture(undefined, { derive: gate !== 'permission', mediaType: gate === 'media' ? 'text/plain' : undefined });
    if (gate === 'missing source') source.request.source.acquisition.id = 'not-retained';
    const execute = runtime(); const store = new GatAuditService(root, execute, () => at);
    await store.audit(source.request);
    const receipt = JSON.parse(readFileSync(receiptPath(), 'utf8'));
    receipt.outcome = gate === 'permission' ? 'ENGINE_UNAVAILABLE' : gate === 'media' ? 'SOURCE_TIME_MISMATCH' : 'SOURCE_INTEGRITY_FAILED';
    if (gate === 'permission') receipt.stages.execution = 'FAILED';
    const { digest: oldDigest, ...payload } = receipt;
    expect(oldDigest).toMatch(/^sha256:/);
    receipt.digest = localRecordDigest(payload);
    writeFileSync(receiptPath(), JSON.stringify(receipt));
    expect(() => store.inspect(source.request.requestId)).toThrow('no longer validates');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a rehashed report-backed audit whose reservation/receipt were backdated before evidence storage', async () => {
    const source = capture(); const execute = runtime(); const store = new GatAuditService(root, execute, () => at);
    await store.audit(source.request);
    const reservedPath = join(root, 'gat-audits', 'requests', `${byteDigest(Buffer.from(source.request.requestId)).slice(7)}.json`);
    const reservation = JSON.parse(readFileSync(reservedPath, 'utf8'));
    const receipt = JSON.parse(readFileSync(receiptPath(), 'utf8'));
    reservation.startedAt = '2026-09-05T10:30:00.000Z';
    const { digest: reservedDigest, ...reservedBody } = reservation;
    expect(reservedDigest).toMatch(/^sha256:/); reservation.digest = localRecordDigest(reservedBody);
    receipt.startedAt = reservation.startedAt; receipt.completedAt = reservation.startedAt; receipt.reservationDigest = reservation.digest;
    receipt.deriveDecision.evaluatedAt = reservation.startedAt; receipt.deriveDecision.request.requestedAt = reservation.startedAt;
    const { digest: receiptDigest, ...receiptBody } = receipt;
    expect(receiptDigest).toMatch(/^sha256:/); receipt.digest = localRecordDigest(receiptBody);
    writeFileSync(reservedPath, JSON.stringify(reservation)); writeFileSync(receiptPath(), JSON.stringify(receipt));
    expect(() => store.inspect(source.request.requestId)).toThrow('no longer validates');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('accepts only the closed request and does not create state on invalid input or absent inspection', async () => {
    const source = capture(); const execute = runtime(); const store = new GatAuditService(root, execute);
    expect(store.inspect('absent')).toBeUndefined();
    for (const value of [null, { ...source.request, path: 'C:\\private' }, { ...source.request, operation: 'acceptance' }, { ...source.request, adapterVersion: 'untrusted' }, { ...source.request, source: { ...source.request.source, evidence: { id: 'x', contentDigest: 'short' } } }]) {
      expect(() => parseGatAuditRequest(value)).toThrow(); await expect(store.audit(value)).rejects.toMatchObject({ code: 'INVALID_GAT_REQUEST' });
    }
    expect(existsSync(join(root, 'gat-audits'))).toBe(false); expect(execute).not.toHaveBeenCalled();
  });
});

describe('GAT report validation/projection', () => {
  it('retains bounded original diagnostics while removing them from the separate projection', () => {
    const bytes = Buffer.from('not an IFC file'); const report = blockedReport(bytes);
    const parsed = validateGatAuditReport(Buffer.from(JSON.stringify(report)), { contentDigest: byteDigest(bytes), byteLength: bytes.length });
    expect(parsed).toEqual(report);
    expect(JSON.stringify(projectGatAudit(parsed))).not.toMatch(/private|engine\.py|host\/secret|ParserError/);
  });
  it.each(['source', 'assurance', 'ready', 'count', 'missing stage'] as const)('refuses report $0 mismatches', (defect) => {
    const bytes = Buffer.from('not an IFC file'); const report = blockedReport(bytes);
    if (defect === 'source') report.source.sha256 = '0'.repeat(64);
    if (defect === 'assurance') Object.assign(report.assurance, { audit_authorizes_decisions: true });
    if (defect === 'ready') report.pipeline.pipeline_ready = true;
    if (defect === 'count') report.inventory.supported_product_count = 1;
    if (defect === 'missing stage') Reflect.deleteProperty(report.pipeline, 'compilation');
    expect(() => validateGatAuditReport(Buffer.from(JSON.stringify(report)), { contentDigest: byteDigest(bytes), byteLength: bytes.length })).toThrow('INVALID_REPORT');
  });
});

describe.skipIf(process.env.GAT_INTEGRATION !== '1')('GAT real pinned-engine evidence integration', () => {
  it.each(['supported-demo.ifc', 'unsupported-missing-width.ifc'])('captures and audits %s through the real runtime, then inspects and retries without executing', async (fixture) => {
    const bytes = readFileSync(join(process.cwd(), 'examples', 'gat', fixture));
    const source = capture(bytes); const execute = vi.fn(runGatAudit);
    const store = new GatAuditService(root, execute, () => at);
    const first = await store.audit(source.request);
    expect(first.inspection.outcome).toBe(fixture.startsWith('supported') ? 'SUPPORTED_SCOPE_AUDIT' : 'AUDIT_BLOCKED');
    expect(first.inspection.projection?.inventory.supported_product_count).toBe(10);
    expect(first.inspection.projection?.pipeline.lowering.status).toBe(fixture.startsWith('supported') ? 'PASS' : 'BLOCKED');
    expect(first.inspection.runtime).toEqual(GAT_RUNTIME_IDENTITY);
    expect(first.inspection.projection?.assurance.audit_authorizes_decisions).toBe(false);
    expect(first.inspection.canonicalAdmission).toBe(false);
    expect(source.intake.objects.get(source.acquisition.request.contentDigest)).toEqual(bytes);
    const inspectionOnly = new GatAuditService(root, vi.fn<typeof runGatAudit>().mockRejectedValue(new Error('Must never execute on read/retry')), () => expiry);
    expect(inspectionOnly.inspect(source.request.requestId)).toEqual(first.inspection);
    expect(await inspectionOnly.audit(source.request)).toEqual({ status: 'EXISTING', inspection: first.inspection });
    expect(execute).toHaveBeenCalledTimes(1);
    const originalBytes = readFileSync(artifactPath(first.inspection.report!.contentDigest));
    expect(byteDigest(originalBytes)).toBe(first.inspection.report!.contentDigest);
    expect(first.inspection.receipt.digest).toBe(JSON.parse(readFileSync(receiptPath(), 'utf8')).digest);
    expect(JSON.stringify(first.inspection)).not.toContain(process.cwd());
    expect(localRecordDigest(first.inspection.source)).toMatch(/^sha256:/);
  });
});
