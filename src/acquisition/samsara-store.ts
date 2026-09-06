import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { SourceRegistration } from '../data-os/contracts';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake, type LocalAcquisition } from '../data-os/local-intake';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import type { ArtifactReference } from '../observation/contract';
import { parseReplayJson } from '../observation/json';
import { parseSamsaraAuthorization, parseSamsaraCaptureRequest, SAMSARA_MAX_RECORD, SAMSARA_PURPOSE,
  type SamsaraAuthorization, type SamsaraCaptureRequest } from './samsara-contract';
import { buildSamsaraHistoryUrl, fetchSamsaraHistoryBytes } from './samsara-http';
import { assertSamsaraRetentionScope, parseSamsaraGpsBytes, type SamsaraGpsObservations } from './samsara-observations';

const ADAPTER = 'samsara-gps-history.single-page.v1';
const MAX_BODY = 256 * 1024;
type Mode = 'LIVE_HTTPS' | 'SYNTHETIC_OFFLINE';
type Intent = { schema: 'payload.samsara-capture-intent.v1'; request: SamsaraCaptureRequest; requestDigest: string;
  adapter: typeof ADAPTER; transport: Mode; startedAt: string; nonce: string; digest: string };
type Receipt = { schema: 'payload.samsara-capture-receipt.v1'; intentDigest: string; finishedAt: string;
  state: 'CAPTURED' | 'QUARANTINED' | 'FAILED'; failureCode: 'FETCH_FAILED' | 'LOCAL_BUDGET_EXHAUSTED' | 'INVALID_GPS_RESPONSE' | null;
  acquisition: ArtifactReference | null; observationsDigest: string | null; digest: string };
const seal = <T extends object>(value: T) => ({ ...value, digest: localRecordDigest(value, SAMSARA_MAX_RECORD) });
const same = (a: unknown, b: unknown) => localJson(a) === localJson(b);
function instant(value: unknown): string {
  const at = parseISOInstant(value, 'samsara clock');
  if (new Date(at).toISOString() !== value) throw new Error('SAMSARA_TIME_INVALID');
  return value as string;
}
function key(id: string) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('SAMSARA_ID_INVALID');
  return byteDigest(Buffer.from(id)).slice(7);
}
function verifySeal(record: { digest: string }) {
  const { digest, ...core } = record;
  if (localRecordDigest(core, SAMSARA_MAX_RECORD) !== digest) throw new Error('SAMSARA_HISTORY_INVALID');
}
function checkUse(registration: SourceRegistration, operation: 'INGEST' | 'DERIVE' | 'RETRIEVE', at: string) {
  if (registration.retention.mode === 'UNTIL' && parseISOInstant(at, 'now') >= parseISOInstant(registration.retention.until, 'retention')) throw new Error('SAMSARA_CURRENT_USE_NOT_ALLOWED');
  const decision = evaluateSourceUse(registration, { requestId: `samsara:${operation}`, registrationId: registration.registrationId,
    purpose: SAMSARA_PURPOSE, operation, audience: 'INTERNAL', requestedAt: at });
  if (decision.state !== 'ALLOWED') throw new Error('SAMSARA_CURRENT_USE_NOT_ALLOWED');
  return decision;
}
const reference = (a: LocalAcquisition): ArtifactReference => ({ acquisitionId: a.request.manifest.acquisitionId, acquisitionDigest: a.digest, contentDigest: a.request.contentDigest });

/** Reject literal and JSON-escaped reflected bearer secrets BEFORE retaining response bytes. */
function credentialSafeJson(bytes: Buffer, token: string): boolean {
  if (bytes.includes(Buffer.from(token))) return false;
  let value: unknown;
  try { value = parseReplayJson(bytes, MAX_BODY); } catch { return false; }
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'string' && item.includes(token)) return false;
    if (Array.isArray(item)) { for (const entry of item) pending.push(entry); }
    else if (item && typeof item === 'object') {
      for (const [name, entry] of Object.entries(item)) { if (name.includes(token)) return false; pending.push(entry); }
    }
  }
  return true;
}

export class SamsaraCaptureStore {
  readonly root: string;
  readonly intake: LocalEvidenceIntake;
  constructor(root: string, private readonly dependencies: { fetch?: typeof fetchSamsaraHistoryBytes; now?: () => string;
    token?: () => string | undefined; mode?: Mode } = {}) {
    this.root = resolve(root); this.intake = new LocalEvidenceIntake(this.root);
  }
  private now() { return instant((this.dependencies.now ?? (() => new Date().toISOString()))()); }
  private read(id: string, file: string): unknown | undefined {
    const bytes = readImmutableFile(this.root, ['samsara-captures', key(id), file], SAMSARA_MAX_RECORD);
    return bytes ? parseReplayJson(bytes, SAMSARA_MAX_RECORD) : undefined;
  }
  private write(id: string, file: string, record: unknown) {
    return publishImmutableFile(this.root, ['samsara-captures', key(id), file], encodeLocalRecord(record, SAMSARA_MAX_RECORD), SAMSARA_MAX_RECORD);
  }
  private exact(ref: ArtifactReference, at: string) {
    const acquisition = this.intake.inspect(ref.acquisitionId);
    if (!acquisition || !same(reference(acquisition), ref)) throw new Error('SAMSARA_EVIDENCE_UNAVAILABLE_OR_CHANGED');
    if (parseISOInstant(at, 'now') < parseISOInstant(acquisition.capture.receipt.storedAt, 'storedAt')) throw new Error('SAMSARA_BEFORE_AUTHORIZATION_STORAGE');
    for (const operation of ['RETRIEVE', 'DERIVE'] as const) checkUse(acquisition.request.manifest.sourceRegistration, operation, at);
    return acquisition;
  }
  private authorization(request: SamsaraCaptureRequest, at: string) {
    const acquired = this.exact(request.authorization, at);
    const bytes = this.intake.objects.get(acquired.request.contentDigest)!;
    const a = parseSamsaraAuthorization(parseReplayJson(bytes, 32 * 1024));
    this.exact(a.termsEvidence, at);
    for (const operation of ['INGEST', 'DERIVE', 'RETRIEVE'] as const) checkUse(a.sourceRegistration, operation, at);
    return a;
  }
  private binding(a: SamsaraAuthorization, create: boolean) {
    const expected = encodeLocalRecord({ schema: 'payload.samsara-local-binding.v1', connectionId: a.connectionId, fleetId: a.fleetId, region: a.scope.region,
      organizationBinding: 'OPERATOR_DECLARED_NOT_PROVIDER_VERIFIED' });
    const path = ['samsara-binding.json'];
    let stored = readImmutableFile(this.root, path, 4096);
    if (!stored && create) {
      try { publishImmutableFile(this.root, path, expected, 4096); }
      catch { /* Read back the winner; never overwrite a conflicting local binding. */ }
      stored = readImmutableFile(this.root, path, 4096);
    }
    if (!stored?.equals(expected)) throw new Error('SAMSARA_LOCAL_BINDING_CONFLICT');
  }
  private manifest(intent: Intent, a: SamsaraAuthorization, capturedAt: string) {
    return { schema: 'payload.local-intake-request.v1' as const, acquisitionId: `samsara-response:${intent.request.requestId}`,
      evidenceId: `samsara-response-evidence:${intent.request.requestId}`, sourceRegistration: a.sourceRegistration,
      purpose: SAMSARA_PURPOSE, mediaType: 'application/json', capturedAt };
  }
  private budget(intent: Intent, reserve: boolean, denied = false) {
    const base = ['samsara-budgets', intent.startedAt.slice(0, 10)];
    const minute = `minute-${intent.startedAt.slice(11, 16).replace(':', '-')}.json`;
    const expected = encodeLocalRecord({ schema: 'payload.samsara-budget.v1', intentDigest: intent.digest });
    const owner = (name: string) => readImmutableFile(this.root, [...base, name], 4096);
    const claim = (name: string) => {
      if (owner(name)) return false;
      try { return publishImmutableFile(this.root, [...base, name], expected, 4096) === 'CREATED'; }
      catch (error) { if (owner(name)) return false; throw error; }
    };
    if (reserve) {
      if (!claim(minute)) return false;
      return [0, 1, 2, 3].some((slot) => claim(`day-${slot}.json`));
    }
    const minuteOwner = owner(minute);
    if (denied) {
      const validClaim = (bytes: Buffer | undefined) => {
        if (!bytes) throw new Error('SAMSARA_BUDGET_HISTORY_INVALID');
        const value = parseReplayJson(bytes, 4096); exactFields(value, ['schema', 'intentDigest']);
        if (value.schema !== 'payload.samsara-budget.v1' || typeof value.intentDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.intentDigest)) throw new Error('SAMSARA_BUDGET_HISTORY_INVALID');
      };
      validClaim(minuteOwner);
      if (!minuteOwner!.equals(expected)) return true;
      for (const slot of [0, 1, 2, 3]) {
        const bytes = owner(`day-${slot}.json`); validClaim(bytes);
        if (bytes!.equals(expected)) throw new Error('SAMSARA_BUDGET_HISTORY_INVALID');
      }
      return true;
    }
    if (!minuteOwner?.equals(expected) || ![0, 1, 2, 3].some((slot) => owner(`day-${slot}.json`)?.equals(expected))) throw new Error('SAMSARA_BUDGET_HISTORY_INVALID');
    return true;
  }

  async capture(value: unknown, enabled = process.env.PAYLOAD_SAMSARA_COLLECTION === '1') {
    const request = parseSamsaraCaptureRequest(value);
    const existing = this.inspect(request.requestId);
    if (existing) {
      if (!same(existing.intent.request, request)) throw new Error('SAMSARA_REQUEST_CONFLICT');
      return existing;
    }
    if (!enabled) throw new Error('SAMSARA_COLLECTION_DISABLED');
    const startedAt = this.now(), a = this.authorization(request, startedAt);
    if (a.scope.endTime > startedAt) throw new Error('SAMSARA_FUTURE_WINDOW');
    const mode = this.dependencies.mode ?? 'LIVE_HTTPS';
    if ((mode === 'SYNTHETIC_OFFLINE') !== (a.evidenceClass === 'SYNTHETIC_TEST')) throw new Error('SAMSARA_EVIDENCE_CLASS_MISMATCH');
    let token: string | undefined;
    try { token = (this.dependencies.token ?? (() => process.env.PAYLOAD_SAMSARA_TOKEN))(); } catch { throw new Error('SAMSARA_CREDENTIAL_UNAVAILABLE'); }
    if (typeof token !== 'string' || !/^[A-Za-z0-9._~-]{1,4096}$/.test(token)) throw new Error('SAMSARA_CREDENTIAL_UNAVAILABLE');
    this.binding(a, true);
    const intent: Intent = seal({ schema: 'payload.samsara-capture-intent.v1', request, requestDigest: localRecordDigest(request), adapter: ADAPTER,
      transport: mode, startedAt, nonce: randomUUID() });
    try {
      if (this.write(request.requestId, 'intent.json', intent) !== 'CREATED') return this.inspect(request.requestId)!;
    } catch (error) {
      const winner = this.inspect(request.requestId);
      if (winner) {
        if (!same(winner.intent.request, request)) throw new Error('SAMSARA_REQUEST_CONFLICT');
        return winner;
      }
      throw error;
    }
    let earliestFinish = intent.startedAt;
    const finish = (fields: Pick<Receipt, 'state' | 'failureCode' | 'acquisition' | 'observationsDigest'>) => {
      const finishedAt = this.now();
      if (finishedAt < earliestFinish) throw new Error('SAMSARA_CLOCK_REVERSED');
      const receipt: Receipt = seal({ schema: 'payload.samsara-capture-receipt.v1', intentDigest: intent.digest, finishedAt, ...fields });
      this.write(request.requestId, 'receipt.json', receipt); return this.inspect(request.requestId)!;
    };
    if (!this.budget(intent, true)) return finish({ state: 'FAILED', failureCode: 'LOCAL_BUDGET_EXHAUSTED', acquisition: null, observationsDigest: null });
    let response: Awaited<ReturnType<typeof fetchSamsaraHistoryBytes>>;
    try { response = await (this.dependencies.fetch ?? fetchSamsaraHistoryBytes)(a.scope, token); }
    catch { return finish({ state: 'FAILED', failureCode: 'FETCH_FAILED', acquisition: null, observationsDigest: null }); }
    if (!Buffer.isBuffer(response.bytes) || response.bytes.length === 0 || response.bytes.length > MAX_BODY || response.mediaType !== 'application/json' || !credentialSafeJson(response.bytes, token)) {
      return finish({ state: 'FAILED', failureCode: 'FETCH_FAILED', acquisition: null, observationsDigest: null });
    }
    try { assertSamsaraRetentionScope(response.bytes, a.scope); }
    catch { return finish({ state: 'FAILED', failureCode: 'FETCH_FAILED', acquisition: null, observationsDigest: null }); }
    const capturedAt = this.now();
    if (capturedAt < startedAt) throw new Error('SAMSARA_CLOCK_REVERSED');
    earliestFinish = capturedAt;
    this.authorization(request, capturedAt); // Expired or withdrawn local evidence never grants storage after contact.
    const acquired = this.intake.capture(this.manifest(intent, a, capturedAt), response.bytes, capturedAt).acquisition;
    const ref = reference(acquired);
    let observations: SamsaraGpsObservations;
    try { observations = parseSamsaraGpsBytes(response.bytes, a.scope); }
    catch { return finish({ state: 'QUARANTINED', failureCode: 'INVALID_GPS_RESPONSE', acquisition: ref, observationsDigest: null }); }
    return finish({ state: 'CAPTURED', failureCode: null, acquisition: ref, observationsDigest: localRecordDigest(observations, SAMSARA_MAX_RECORD) });
  }

  /** Current use/retention gate precedes private data output; readback never renews permission or recontacts Samsara. */
  inspect(id: string) {
    key(id);
    const rawIntent = this.read(id, 'intent.json');
    if (rawIntent === undefined) {
      if (this.read(id, 'receipt.json') !== undefined || this.intake.inspect(`samsara-response:${id}`) !== undefined) throw new Error('SAMSARA_ORPHANED_HISTORY');
      return undefined;
    }
    exactFields(rawIntent, ['schema', 'request', 'requestDigest', 'adapter', 'transport', 'startedAt', 'nonce', 'digest']);
    const intent = rawIntent as unknown as Intent; verifySeal(intent);
    const request = parseSamsaraCaptureRequest(intent.request);
    if (intent.schema !== 'payload.samsara-capture-intent.v1' || intent.adapter !== ADAPTER || request.requestId !== id ||
      !same(request, intent.request) || localRecordDigest(request) !== intent.requestDigest ||
      !['LIVE_HTTPS', 'SYNTHETIC_OFFLINE'].includes(intent.transport) || typeof intent.nonce !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(intent.nonce)) throw new Error('SAMSARA_HISTORY_INVALID');
    instant(intent.startedAt);
    const currentAt = this.now();
    if (currentAt < intent.startedAt) throw new Error('SAMSARA_CLOCK_REVERSED');
    const a = this.authorization(request, currentAt); // Unlike public fixture history, expired customer-data use is blocked.
    this.authorization(request, intent.startedAt);
    this.binding(a, false);
    if (a.scope.endTime > intent.startedAt || (intent.transport === 'SYNTHETIC_OFFLINE') !== (a.evidenceClass === 'SYNTHETIC_TEST')) throw new Error('SAMSARA_HISTORY_INVALID');
    const acquired = this.intake.inspect(`samsara-response:${id}`);
    if (acquired && (!same(acquired.request.manifest, this.manifest(intent, a, acquired.request.manifest.capturedAt)) ||
      instant(acquired.request.manifest.capturedAt) < intent.startedAt || acquired.request.byteLength > MAX_BODY ||
      acquired.request.manifest.capturedAt > currentAt ||
      acquired.capture.receipt.storedAt !== acquired.request.manifest.capturedAt)) throw new Error('SAMSARA_HISTORY_INVALID');
    if (acquired) {
      this.budget(intent, false); this.authorization(request, acquired.request.manifest.capturedAt);
      assertSamsaraRetentionScope(Buffer.from(this.intake.objects.get(acquired.request.contentDigest)!), a.scope);
    }
    const stored = this.read(id, 'receipt.json');
    let receipt: Receipt | null = null, observations: SamsaraGpsObservations | null = null;
    if (stored !== undefined) {
      exactFields(stored, ['schema', 'intentDigest', 'finishedAt', 'state', 'failureCode', 'acquisition', 'observationsDigest', 'digest']);
      receipt = stored as unknown as Receipt; verifySeal(receipt);
      if (receipt.schema !== 'payload.samsara-capture-receipt.v1' || receipt.intentDigest !== intent.digest || instant(receipt.finishedAt) < intent.startedAt || receipt.finishedAt > currentAt ||
        !['CAPTURED', 'QUARANTINED', 'FAILED'].includes(receipt.state)) throw new Error('SAMSARA_HISTORY_INVALID');
      if (receipt.state === 'FAILED') {
        if (!['FETCH_FAILED', 'LOCAL_BUDGET_EXHAUSTED'].includes(receipt.failureCode!) || receipt.acquisition !== null || acquired !== undefined || receipt.observationsDigest !== null) throw new Error('SAMSARA_HISTORY_INVALID');
        this.budget(intent, false, receipt.failureCode === 'LOCAL_BUDGET_EXHAUSTED');
      } else {
        if (!acquired || !same(reference(acquired), receipt.acquisition) || receipt.finishedAt < acquired.request.manifest.capturedAt) throw new Error('SAMSARA_HISTORY_INVALID');
        const bytes = this.intake.objects.get(acquired.request.contentDigest)!;
        try { observations = parseSamsaraGpsBytes(Buffer.from(bytes), a.scope); } catch { observations = null; }
        if (receipt.state === 'CAPTURED') {
          if (!observations || receipt.failureCode !== null || receipt.observationsDigest !== localRecordDigest(observations, SAMSARA_MAX_RECORD)) throw new Error('SAMSARA_HISTORY_INVALID');
        } else if (observations || receipt.failureCode !== 'INVALID_GPS_RESPONSE' || receipt.observationsDigest !== null) throw new Error('SAMSARA_HISTORY_INVALID');
      }
    }
    return { schema: 'payload.samsara-capture-inspection.v1' as const, state: receipt?.state ?? 'INCOMPLETE', intent, receipt,
      source: { connectionId: a.connectionId, fleetId: a.fleetId, scope: a.scope, queryUrl: buildSamsaraHistoryUrl(a.scope).href,
        organizationBinding: a.organizationBinding, providerApiVersion: a.providerApiVersion, evidenceClass: a.evidenceClass },
      acquisition: acquired ? reference(acquired) : null, observations,
      claims: { rawBytesIncluded: false, tokenIncluded: false, independentVerification: false, liveQualificationEstablished: false,
        canonicalAdmission: false, customerDistributionPermitted: false, physicalVisitEstablished: false, shipmentLinked: false, unloadingEstablished: false,
        surveyAccuracyEstablished: false, continuousSynchronization: false }, integrity: 'RECOMPUTED_LOCAL' as const };
  }
}
export type SamsaraCaptureInspection = NonNullable<ReturnType<SamsaraCaptureStore['inspect']>>;
