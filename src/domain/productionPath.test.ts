import { describe, expect, it } from 'vitest';
import type { ProductionResult, ProductionRun } from '@/production/contracts';
import demoJson from '@/fixtures/production/demo.json';
import type { ProductionDemo } from './production';
import { BLOCKERS, ERROR_MEANING, PATH_STAGES, REMEDIATION_MEANING, STAGE_STATES, STAGE_STATE_MEANING, buildReference, byteLength, deriveStages, emptySession, errorRecovery, nextAttemptName, outputOf, requestIds, runRecovery, stepInputs, toBase64 } from './productionPath';

const demo = demoJson as unknown as ProductionDemo;
const D = 'sha256:' + 'a'.repeat(64);
function run(id: string, state: ProductionRun['state'], outputs: ProductionRun['outputs'], failure: ProductionRun['failure'] = null): ProductionRun {
  return { schema: 'payload.production-run.v1', id, mode: 'LOCAL_DEVELOPMENT', request: {}, requestDigest: D, startedAt: '2026-09-06T10:00:00.000Z', completedAt: '2026-09-06T10:00:01.000Z', state, stages: [], outputs, failure,
    policyAuthority: 'OPERATOR_DECLARATION', canonicalAdmission: false, releaseActivated: false, sourceTruthClaimed: false, completenessClaimed: false, digest: D, coverageVerified: false, freshnessVerified: false, definitionRequirementsVerified: false };
}
const done = (id: string, kind: ProductionRun['outputs'][number]['kind'], historicalRetry = false): ProductionResult => ({ status: historicalRetry ? 'EXISTING' : 'CREATED', historicalRetry, run: run(id, 'COMPLETED', [{ kind, id: `${id}:out`, digest: D }]) });

describe('the production path as data', () => {
  it('names seven stages and a closed state vocabulary with a meaning for every state', () => {
    expect(PATH_STAGES).toEqual(['source', 'acquisition', 'normalization', 'build', 'inspection', 'notation', 'release']);
    expect(Object.keys(STAGE_STATE_MEANING).sort()).toEqual([...STAGE_STATES].sort());
  });

  it('derives five request identities from one name under the rail’s identifier rule, and a new attempt keeps the failed identity', () => {
    expect(requestIds('path-1')).toEqual({ corpus: 'path-1-corpus', source: 'path-1-source', capture: 'path-1-capture', normalize: 'path-1-normalize', build: 'path-1-build' });
    expect(() => requestIds('')).toThrow();
    expect(() => requestIds('-bad')).toThrow();
    expect(() => requestIds('a'.repeat(101))).toThrow();
    expect(() => requestIds('has space')).toThrow();
    expect(nextAttemptName('path-1')).toBe('path-1-a2');
    expect(nextAttemptName('path-1-a2')).toBe('path-1-a3');
    for (const id of Object.values(requestIds(nextAttemptName('x'.repeat(90))))) expect(id.length).toBeLessThanOrEqual(120);
  });

  it('encodes the bytes the ACQUIRE command carries and measures them as UTF-8', () => {
    const text = '{"legalName":"Ünïcode Carriers"}';
    expect(toBase64(text)).toBe(Buffer.from(text, 'utf8').toString('base64'));
    expect(byteLength(text)).toBe(Buffer.byteLength(text, 'utf8'));
  });

  it('lets a step be sent only when its inputs are exact references from completed earlier steps; a quarantine is never a member', () => {
    const session = emptySession('p');
    expect(stepInputs(session)).toMatchObject({ corpus: { ready: true }, source: { ready: false, missing: ['corpus reference'] }, capture: { ready: false }, normalize: { ready: false, missing: ['source reference', 'acquisition reference'] }, build: { ready: false, missing: ['corpus reference', 'a NORMALIZED member'] } });
    session.corpus = { ...session.corpus, status: 'DONE', result: done('p-corpus', 'CORPUS') };
    session.source = { ...session.source, status: 'DONE', result: done('p-source', 'SOURCE') };
    expect(stepInputs(session).capture.ready).toBe(true);
    session.capture = { ...session.capture, status: 'DONE', result: done('p-capture', 'ACQUISITION') };
    expect(stepInputs(session).normalize.ready).toBe(true);
    const quarantined: ProductionResult = { status: 'CREATED', historicalRetry: false, run: run('p-normalize', 'QUARANTINED', [{ kind: 'ACQUISITION', id: 'p-capture:out', digest: D }], { code: 'INVALID_SOURCE_JSON', artifactRetained: true, receiptRetained: true, runReceiptRetained: true, retry: { sameRequest: true, newRequestRequired: true }, remediation: ['INSPECT_QUARANTINE', 'CAPTURE_CORRECTED_SOURCE_UNDER_NEW_REQUEST_ID'] }) };
    session.normalize = { ...session.normalize, status: 'DONE', result: quarantined };
    expect(stepInputs(session).build).toEqual({ ready: false, missing: ['a NORMALIZED member'] });
    expect(outputOf(quarantined, 'NORMALIZATION')).toBeNull();
    session.normalize = { ...session.normalize, result: done('p-normalize', 'NORMALIZATION') };
    expect(stepInputs(session).build.ready).toBe(true);
  });

  it('turns a confirmed failure into recovery from its retry policy and remediation, in order, without duplicates, and keeps unknown codes verbatim', () => {
    const failed = run('p-build', 'FAILED', [], { code: 'MEMBER_NOT_ELIGIBLE', artifactRetained: 'UNCONFIRMED', receiptRetained: true, runReceiptRetained: true, retry: { sameRequest: true, newRequestRequired: true }, remediation: ['INSPECT_RETAINED_OUTPUTS', 'RETRY_IDENTICAL_REQUEST', 'USE_NEW_REQUEST_ID', 'SOMETHING_NEW'] });
    expect(runRecovery(failed).map((action) => action.kind)).toEqual(['RETRY_IDENTICAL', 'INSPECT_OUTPUTS', 'NEW_IDENTITY']);
    const quarantined = run('p-normalize', 'QUARANTINED', [], { code: 'INVALID_SOURCE_JSON', artifactRetained: true, receiptRetained: true, runReceiptRetained: true, retry: { sameRequest: true, newRequestRequired: true }, remediation: ['INSPECT_QUARANTINE'] });
    expect(runRecovery(quarantined).map((action) => action.kind)).toEqual(['INSPECT_QUARANTINE', 'RETRY_IDENTICAL', 'NEW_IDENTITY']);
    expect(runRecovery(run('ok', 'COMPLETED', []))).toEqual([]);
    for (const action of runRecovery(failed)) { expect(action.label).toMatch(/\S/); expect(action.why).toMatch(/\S/); }
  });

  it('covers every remediation code and every transport refusal the rail emits', () => {
    for (const code of ['INSPECT_RETAINED_OUTPUTS', 'INSPECT_QUARANTINE', 'RETRY_IDENTICAL_REQUEST', 'USE_NEW_REQUEST_ID', 'USE_NEW_REQUEST_ID_FOR_REMEDIATED_OPERATION', 'CAPTURE_CORRECTED_SOURCE_UNDER_NEW_REQUEST_ID', 'REVIEW_EXACT_DEPENDENCIES_AND_DECLARED_POLICY', 'VERIFY_OPERATOR_CLOCK', 'WAIT_FOR_ACTIVE_OPERATION_OR_USE_NEW_REQUEST_ID', 'WAIT_FOR_ACTIVE_RESERVATION', 'OPERATOR_VERIFY_OWNER_BEFORE_LOCK_RECOVERY']) expect(REMEDIATION_MEANING[code], code).toBeDefined();
    for (const code of ['LOCAL_MODE_DISABLED', 'LOCAL_ONLY', 'INVALID_REQUEST', 'INVALID_CONTENT_TYPE', 'BODY_TOO_LARGE', 'BODY_TIMEOUT', 'REQUEST_CONFLICT', 'REGISTRATION_CONFLICT', 'OPERATION_INCOMPLETE', 'PRODUCTION_BUSY', 'WORKER_UNAVAILABLE', 'WORKER_OUTPUT_LIMIT', 'EXECUTION_TIMEOUT', 'RUN_SAVE_UNCONFIRMED', 'LOCAL_STORAGE_UNAVAILABLE', 'LOCAL_PRODUCTION_UNAVAILABLE', 'CATALOG_CAPACITY', 'OPERATION_UNAVAILABLE', 'INGEST_DISALLOWED', 'DERIVATION_DISALLOWED', 'PURPOSE_NOT_DECLARED', 'MEMBER_NOT_ELIGIBLE', 'SOURCE_BINDING_MISMATCH', 'REFERENCE_MISMATCH', 'REFERENCE_NOT_FOUND', 'DEPENDENCY_INTEGRITY_FAILED', 'EVIDENCE_INTEGRITY_FAILED', 'STORED_RECORD_INVALID', 'CLOCK_ORDER_INVALID']) expect(ERROR_MEANING[code], code).toBeDefined();
    expect(errorRecovery('REQUEST_CONFLICT').map((action) => action.kind)).toEqual(['NEW_IDENTITY']);
    expect(errorRecovery('OPERATION_INCOMPLETE').map((action) => action.kind)).toEqual(['INSPECT_OUTPUTS', 'WAIT', 'NEW_IDENTITY']);
    expect(errorRecovery('NEVER_SEEN').map((action) => action.kind)).toEqual(['REVIEW']);
  });

  it('derives the fixture path from the committed demonstration, with notation and release blocked by named contracts', () => {
    const stages = deriveStages({ mode: 'FIXTURE', session: emptySession('p'), sourceReadback: null, demo });
    expect(stages.map((stage) => [stage.id, stage.state])).toEqual([['source', 'DEMONSTRATION'], ['acquisition', 'DEMONSTRATION'], ['normalization', 'DEMONSTRATION'], ['build', 'DEMONSTRATION'], ['inspection', 'DEMONSTRATION'], ['notation', 'BLOCKED'], ['release', 'BLOCKED']]);
    expect(stages.find((stage) => stage.id === 'build')?.detail).toContain('demo-caravan-carrier-build-001');
    expect(stages.find((stage) => stage.id === 'normalization')?.detail).toContain('1 candidate, 1 quarantine');
    expect(stages.find((stage) => stage.id === 'notation')?.blocker).toEqual(BLOCKERS.notation);
    expect(stages.find((stage) => stage.id === 'release')?.blocker).toEqual(BLOCKERS.release);
    expect(BLOCKERS.notation.what).toContain('ATTACH_EVIDENCE_REFERENCE');
    expect(BLOCKERS.release.what).toContain('UNADMITTED');
    expect(BLOCKERS.fmcsaRail.what).toContain('fmcsa.company-census-observation/v1');
    expect(BLOCKERS.fmcsaRail.what).toContain('Neither is on the HTTP rail');
    for (const stage of stages.filter((entry) => entry.state === 'DEMONSTRATION')) expect(stage.href).toMatch(/^\/candidates/);
  });

  it('derives the live path from the session step by step: waiting, ready, done, historical retry, quarantine with recovery, and the real source readback', () => {
    const session = emptySession('p');
    const idle = deriveStages({ mode: 'LOCAL', session, sourceReadback: { status: 'NOT_FOUND', code: 'SOURCE_CAPTURE_NOT_FOUND' }, demo });
    expect(idle.map((stage) => stage.state)).toEqual(['READY', 'WAITING', 'WAITING', 'WAITING', 'WAITING', 'BLOCKED', 'BLOCKED']);
    expect(idle[0].detail).toContain('not in this machine’s qualification root');
    session.corpus = { ...session.corpus, status: 'DONE', result: done('p-corpus', 'CORPUS') };
    session.source = { ...session.source, status: 'DONE', result: done('p-source', 'SOURCE') };
    expect(deriveStages({ mode: 'LOCAL', session, sourceReadback: null, demo })[1]).toMatchObject({ state: 'READY', object: null });
    session.capture = { ...session.capture, status: 'DONE', result: done('p-capture', 'ACQUISITION', true) };
    const captured = deriveStages({ mode: 'LOCAL', session, sourceReadback: null, demo });
    expect(captured[1]).toMatchObject({ state: 'DONE', detail: expect.stringContaining('Historical retry'), object: { kind: 'ACQUISITION', id: 'p-capture:out' }, run: { id: 'p-capture', state: 'COMPLETED' } });
    expect(captured[2].state).toBe('READY');
    expect(captured[4].state).toBe('READY');
    session.normalize = { ...session.normalize, status: 'DONE', result: { status: 'CREATED', historicalRetry: false, run: run('p-normalize', 'QUARANTINED', [], { code: 'INVALID_SOURCE_JSON', artifactRetained: true, receiptRetained: true, runReceiptRetained: true, retry: { sameRequest: true, newRequestRequired: true }, remediation: ['INSPECT_QUARANTINE', 'CAPTURE_CORRECTED_SOURCE_UNDER_NEW_REQUEST_ID'] }) } };
    const quarantined = deriveStages({ mode: 'LOCAL', session, sourceReadback: null, demo });
    expect(quarantined[2]).toMatchObject({ state: 'QUARANTINED', object: null, run: { state: 'QUARANTINED' } });
    expect(quarantined[2].recovery.map((action) => action.kind)).toEqual(['INSPECT_QUARANTINE', 'RETRY_IDENTICAL', 'CORRECT_INPUT', 'NEW_IDENTITY']);
    expect(quarantined[3].state).toBe('WAITING');
    session.build = { ...session.build, status: 'FAILED', error: { status: 409, body: { schema: 'payload.production-error.v1', mode: 'LOCAL_DEVELOPMENT', canonicalAdmission: false, error: { code: 'REQUEST_CONFLICT', message: 'x' } } } };
    const refused = deriveStages({ mode: 'LOCAL', session, sourceReadback: null, demo });
    expect(refused[3]).toMatchObject({ state: 'FAILED', run: { id: 'p-build', state: 'REFUSED', digest: null } });
    expect(refused[3].recovery.map((action) => action.kind)).toEqual(['NEW_IDENTITY']);
    const summary = { state: 'CAPTURED' as const, requestId: 'fmcsa-census-80806-2026-09-05-qualification', capturedAt: '2026-09-05T20:48:11.364Z', records: 1, notReturned: 0 };
    const found = deriveStages({ mode: 'LOCAL', session, sourceReadback: { status: 'FOUND', summary, continuation: { normalization: { status: 'NOT_FOUND', code: 'CENSUS_NORMALIZATION_NOT_FOUND' }, build: { status: 'NOT_FOUND', code: 'CENSUS_BUILD_NOT_FOUND' } } }, demo });
    expect(found[0]).toMatchObject({ state: 'DONE', blocker: BLOCKERS.fmcsaRail });
    expect(found[0].detail).toContain('CAPTURED, 1 record, 0 not returned. Operator normalization not on this machine; candidate build not on this machine. Not on the HTTP rail.');
    const continued = deriveStages({ mode: 'LOCAL', session, sourceReadback: { status: 'FOUND', summary, continuation: { normalization: { status: 'FOUND', state: 'NORMALIZED', id: 'n' }, build: { status: 'FOUND', state: 'UNADMITTED', id: 'b', recordCount: 1 } } }, demo });
    expect(continued[0].detail).toContain('Operator normalization NORMALIZED; candidate build UNADMITTED, 1 member. Not on the HTTP rail.');
    // A refused or unreachable readback is not a missing record: the summary names the refusal and its code, and keeps not-found as not found.
    const refusedReadback = deriveStages({ mode: 'LOCAL', session, sourceReadback: { status: 'FOUND', summary, continuation: { normalization: { status: 'ERROR', code: 'SOURCE_HISTORY_INVALID' }, build: { status: 'NOT_FOUND', code: 'CENSUS_BUILD_NOT_FOUND' } } }, demo })[0].detail;
    expect(refusedReadback).toContain('Operator normalization readback refused (SOURCE_HISTORY_INVALID)');
    expect(refusedReadback).toContain('candidate build not on this machine');
    expect(refusedReadback).not.toContain('normalization not on this machine');
    const unreachable = deriveStages({ mode: 'LOCAL', session, sourceReadback: { status: 'ERROR', code: 'UNREACHABLE' }, demo })[0].detail;
    expect(unreachable).toContain('refused: UNREACHABLE');
    expect(unreachable).not.toContain('not in this machine');
    expect(ERROR_MEANING.CENSUS_NORMALIZATION_NOT_FOUND.text).toMatch(/not on this machine|on this machine/);
    expect(ERROR_MEANING.CENSUS_BUILD_NOT_FOUND).toBeDefined();
    session.build = { ...session.build, status: 'DONE', error: undefined, result: done('p-build', 'CANDIDATE_BUILD') };
    expect(deriveStages({ mode: 'LOCAL', session, sourceReadback: null, demo })[5].detail).toContain('attachment is disabled');
  });

  it('shows the reference a notation would carry for a build without attaching, promoting or copying anything', () => {
    const built = done('p-build', 'CANDIDATE_BUILD');
    const reference = buildReference(outputOf(built, 'CANDIDATE_BUILD')!, built.run);
    expect(reference).toMatchObject({ schema: 'payload.notation-evidence-reference.v0', kind: 'CANDIDATE_BUILD', targetId: 'p-build:out', digest: D, context: { domain: 'CARAVAN', buildId: 'p-build:out' }, temporal: { builtAt: '2026-09-06T10:00:01.000Z' }, attachment: 'DISABLED' });
    expect(reference.interpretation.text).toBe('');
  });
});
