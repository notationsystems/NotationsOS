import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { SourceRegistration } from '../data-os/contracts';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake, type LocalIntakeManifest } from '../data-os/local-intake';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import { SourceConnectorError } from './errors';
import { buildCensusUrl, parseCensusBytes, parseSourceCaptureRequest, type CensusObservations, type SourceCaptureRequest } from './fmcsa';
import { fetchSourceBytes, SOURCE_HTTP_MAX_BYTES, type SourceBytes } from './http';

const MAX_RECORD = 64 * 1024;
const ADAPTER = 'fmcsa-company-census.v1';
const PURPOSE = 'source-qualification';
function qualificationBasis() {
  return { reviewedOn: '2026-09-05', authority: 'OPERATOR_DECLARATION',
    scope: 'INTERNAL_PUBLIC_SOURCE_QUALIFICATION', providerLicense: 'UNRESOLVED',
    retentionBasis: 'OPERATOR_LOCAL_EVIDENCE_HISTORY', independentRightsVerification: false,
    references: ['https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program',
      'https://catalog.data.gov/dataset/company-census-file', 'https://dev.socrata.com/docs/app-tokens.html'] } as const;
}
const FAILURE_CODES = ['FETCH_FAILED', 'RATE_LIMITED', 'LOCAL_BUDGET_EXHAUSTED', 'INVALID_SOURCE_RESPONSE'] as const;
type FailureCode = typeof FAILURE_CODES[number];

/** Operator-declared qualification only. This is not a provider-issued license. */
export function censusQualificationPolicy(): SourceRegistration {
  return {
    registrationId: 'fmcsa-company-census:qualification:2026-09-05',
    sourceId: 'fmcsa-company-census', displayName: 'FMCSA Company Census — internal qualification',
    sourceClass: 'public-government-company-census', licenseId: 'operator-qualification:provider-license-unresolved',
    policyVersion: '2026-09-05.v1', effectiveFrom: '2026-09-05T00:00:00.000Z',
    effectiveUntil: '2026-10-05T00:00:00.000Z', permittedPurposes: [PURPOSE],
    allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'], retention: { mode: 'INDEFINITE' },
  };
}

interface Intent {
  schema: 'payload.source-capture-intent.v1';
  request: SourceCaptureRequest;
  requestDigest: string;
  adapter: typeof ADAPTER;
  queryUrl: string;
  startedAt: string;
  nonce: string;
  sourceRegistration: SourceRegistration;
  qualificationBasis: ReturnType<typeof qualificationBasis>;
  digest: string;
}

interface Receipt {
  schema: 'payload.source-capture-receipt.v1';
  intentDigest: string;
  state: 'CAPTURED' | 'QUARANTINED' | 'FAILED';
  failureCode: FailureCode | null;
  finishedAt: string;
  acquisition: { id: string; digest: string } | null;
  response: Omit<SourceBytes, 'bytes'> | null;
  observationsDigest: string | null;
  digest: string;
}

export interface SourceCaptureInspection {
  schema: 'payload.source-capture-inspection.v1';
  state: Receipt['state'] | 'INCOMPLETE';
  intent: Intent;
  receipt: Receipt | null;
  acquisition: { id: string; digest: string; contentDigest: string; byteLength: number; capturedAt: string } | null;
  observations: CensusObservations | null;
  integrity: 'RECOMPUTED_LOCAL';
  canonicalAdmission: false;
  sourceTruthClaimed: false;
  customerDistributionPermitted: false;
  independentVerification: false;
}

function error(code: string, message: string, status = 409): SourceConnectorError {
  return new SourceConnectorError(code, message, status);
}

function instant(value: unknown): string {
  parseISOInstant(value, 'source clock');
  if (new Date(value as string).toISOString() !== value) throw new Error('Use a canonical UTC source clock.');
  return value as string;
}

function same(a: unknown, b: unknown): boolean { return localJson(a) === localJson(b); }
function seal<T extends object>(value: T): T & { digest: string } { return { ...value, digest: localRecordDigest(value) }; }
function verifyDigest(value: { digest: string }): void {
  const { digest, ...payload } = value;
  if (localRecordDigest(payload) !== digest) throw new Error('Stored source metadata does not recompute.');
}
function locations(id: string, name: string): string[] {
  // IDs are validated by the same closed request parser even on historical reads.
  parseSourceCaptureRequest({ schema: 'payload.source-capture-request.v1', sourceId: 'fmcsa-company-census', requestId: id, usdot: ['1'] });
  return ['source-captures', byteDigest(Buffer.from(id)).slice(7), name];
}
function acquisitionId(intent: Intent): string { return `source-capture:${intent.request.requestId}`; }
function manifestFor(intent: Intent, capturedAt: string): LocalIntakeManifest {
  return { schema: 'payload.local-intake-request.v1', acquisitionId: acquisitionId(intent),
    evidenceId: `source-response:${intent.request.requestId}`, sourceRegistration: intent.sourceRegistration,
    purpose: PURPOSE, mediaType: 'application/json', capturedAt };
}
function checkPolicy(intent: Pick<Intent, 'request' | 'sourceRegistration'>, at: string): void {
  for (const operation of ['INGEST', 'DERIVE'] as const) {
    const decision = evaluateSourceUse(intent.sourceRegistration, {
      requestId: `${intent.request.requestId}:${operation}`, registrationId: intent.sourceRegistration.registrationId,
      purpose: PURPOSE, operation, audience: 'INTERNAL', requestedAt: at,
    });
    if (decision.state !== 'ALLOWED') throw error('SOURCE_POLICY_DENIED', 'The internal source qualification policy is not active.');
  }
}

/**
 * Operator-only live acquisition. No browser/board entrypoint and no credential inputs.
 * Storage is a trusted local filesystem, not WORM or an authenticated authority.
 */
export class SourceCaptureStore {
  readonly root: string;
  private readonly intake: LocalEvidenceIntake;
  constructor(root: string, private readonly dependencies: {
    fetch?: typeof fetchSourceBytes; now?: () => string;
  } = {}) {
    this.root = resolve(root);
    this.intake = new LocalEvidenceIntake(this.root);
  }

  private read(id: string, name: string): unknown | undefined {
    const bytes = readImmutableFile(this.root, locations(id, name), MAX_RECORD);
    return bytes === undefined ? undefined : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
  private write(id: string, name: string, value: unknown): 'CREATED' | 'EXISTING' {
    return publishImmutableFile(this.root, locations(id, name), encodeLocalRecord(value), MAX_RECORD);
  }
  private now(): string { return instant((this.dependencies.now ?? (() => new Date().toISOString()))()); }

  private readIntent(id: string): Intent | undefined {
    const value = this.read(id, 'intent.json');
    if (value === undefined) return undefined;
    exactFields(value, ['schema', 'request', 'requestDigest', 'adapter', 'queryUrl', 'startedAt', 'nonce', 'sourceRegistration', 'qualificationBasis', 'digest']);
    const intent = value as unknown as Intent;
    verifyDigest(intent);
    const request = parseSourceCaptureRequest(intent.request);
    if (intent.schema !== 'payload.source-capture-intent.v1' || intent.adapter !== ADAPTER
      || request.requestId !== id || !same(request, intent.request) || localRecordDigest(request) !== intent.requestDigest
      || buildCensusUrl(request).href !== intent.queryUrl || !same(intent.sourceRegistration, censusQualificationPolicy())
      || !same(intent.qualificationBasis, qualificationBasis())
      || typeof intent.nonce !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(intent.nonce)) {
      throw new Error('Stored source intent does not match the supported connector.');
    }
    checkPolicy(intent, instant(intent.startedAt));
    return intent;
  }

  private reserveBudget(intent: Intent): boolean {
    // Permanent create-only slots coordinate processes sharing this root. Never clear stale slots.
    // A failed attempt consumes its slot; four requests/day and one/minute, not a provider quota.
    const day = intent.startedAt.slice(0, 10);
    const minute = intent.startedAt.slice(11, 16).replace(':', '-');
    const claim = encodeLocalRecord({ schema: 'payload.source-request-budget.v1', intentDigest: intent.digest });
    const reserve = (file: string) => {
      const path = ['source-budgets', 'fmcsa-company-census', day, file];
      if (readImmutableFile(this.root, path, MAX_RECORD) !== undefined) return false;
      try { return publishImmutableFile(this.root, path, claim, MAX_RECORD) === 'CREATED'; }
      catch (failure) {
        const saved = readImmutableFile(this.root, path, MAX_RECORD);
        if (saved !== undefined && !saved.equals(claim)) return false;
        throw failure;
      }
    };
    if (!reserve(`minute-${minute}.json`)) return false;
    for (let slot = 0; slot < 4; slot += 1) if (reserve(`day-${slot}.json`)) return true;
    return false;
  }

  private validateBudget(intent: Intent): void {
    const base = ['source-budgets', 'fmcsa-company-census', intent.startedAt.slice(0, 10)];
    const expected = encodeLocalRecord({ schema: 'payload.source-request-budget.v1', intentDigest: intent.digest });
    const minute = `minute-${intent.startedAt.slice(11, 16).replace(':', '-')}.json`;
    if (!readImmutableFile(this.root, [...base, minute], MAX_RECORD)?.equals(expected)
      || ![0, 1, 2, 3].some((slot) => readImmutableFile(this.root, [...base, `day-${slot}.json`], MAX_RECORD)?.equals(expected))) {
      throw new Error('Stored source request has no matching request budget.');
    }
  }

  private validateBudgetDenial(intent: Intent): void {
    const base = ['source-budgets', 'fmcsa-company-census', intent.startedAt.slice(0, 10)];
    const owner = (name: string): string => {
      const bytes = readImmutableFile(this.root, [...base, name], MAX_RECORD);
      if (!bytes) throw new Error('Missing source budget denial evidence.');
      const value: unknown = JSON.parse(bytes.toString('utf8'));
      exactFields(value, ['schema', 'intentDigest']);
      if (value.schema !== 'payload.source-request-budget.v1' || typeof value.intentDigest !== 'string'
        || !/^sha256:[a-f0-9]{64}$/.test(value.intentDigest)) throw new Error('Invalid budget claim.');
      return value.intentDigest;
    };
    const minute = `minute-${intent.startedAt.slice(11, 16).replace(':', '-')}.json`;
    if (owner(minute) !== intent.digest) return;
    if ([0, 1, 2, 3].some((slot) => owner(`day-${slot}.json`) === intent.digest)) {
      throw new Error('Granted source budget cannot be reported as exhausted.');
    }
  }

  async capture(value: unknown, enabled = process.env.PAYLOAD_SOURCE_COLLECTION === '1'): Promise<SourceCaptureInspection> {
    const request = parseSourceCaptureRequest(value);
    // Historical replay never recontacts the provider, even when collection is disabled or policy expired.
    const existing = this.inspect(request.requestId);
    if (existing) {
      if (!same(existing.intent.request, request)) throw error('SOURCE_REQUEST_CONFLICT', 'This request ID already names a different source scope.');
      return existing;
    }
    if (!enabled) throw error('SOURCE_COLLECTION_DISABLED', 'Set PAYLOAD_SOURCE_COLLECTION=1 explicitly to collect a new source response.', 403);
    const intent: Intent = seal({ schema: 'payload.source-capture-intent.v1', request,
      requestDigest: localRecordDigest(request), adapter: ADAPTER, queryUrl: buildCensusUrl(request).href,
      startedAt: this.now(), nonce: randomUUID(), sourceRegistration: censusQualificationPolicy(), qualificationBasis: qualificationBasis() });
    checkPolicy(intent, intent.startedAt);
    try {
      if (this.write(request.requestId, 'intent.json', intent) !== 'CREATED') return this.inspect(request.requestId)!;
    } catch (failure) {
      const winner = this.inspect(request.requestId);
      if (winner) {
        if (!same(winner.intent.request, request)) throw error('SOURCE_REQUEST_CONFLICT', 'A concurrent request claimed this ID for another source scope.');
        return winner;
      }
      throw failure;
    }

    let earliestFinish = intent.startedAt;
    const finish = (result: Pick<Receipt, 'state' | 'failureCode' | 'acquisition' | 'response' | 'observationsDigest'>) => {
      const finishedAt = this.now();
      if (finishedAt < earliestFinish) throw new Error('Source clock moved backwards.');
      const receipt: Receipt = seal({ schema: 'payload.source-capture-receipt.v1', intentDigest: intent.digest, ...result, finishedAt });
      this.write(request.requestId, 'receipt.json', receipt);
      return this.inspect(request.requestId)!;
    };
    if (!this.reserveBudget(intent)) return finish({ state: 'FAILED', failureCode: 'LOCAL_BUDGET_EXHAUSTED', acquisition: null, response: null, observationsDigest: null });
    let fetched: SourceBytes;
    try { fetched = await (this.dependencies.fetch ?? fetchSourceBytes)(new URL(intent.queryUrl)); }
    catch (failure) {
      return finish({ state: 'FAILED', failureCode: failure instanceof SourceConnectorError && failure.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'FETCH_FAILED',
        acquisition: null, response: null, observationsDigest: null });
    }
    const capturedAt = this.now();
    if (capturedAt < intent.startedAt) throw new Error('Source clock moved backwards.');
    earliestFinish = capturedAt;
    if (!Buffer.isBuffer(fetched.bytes) || fetched.bytes.length === 0 || fetched.bytes.length > SOURCE_HTTP_MAX_BYTES) {
      return finish({ state: 'FAILED', failureCode: 'FETCH_FAILED', acquisition: null, response: null, observationsDigest: null });
    }
    // Source-original bytes enter the existing evidence rail BEFORE source parsing.
    // Any storage failure leaves the intent/partial evidence intact and INCOMPLETE; never auto-retry.
    const { acquisition } = this.intake.capture(manifestFor(intent, capturedAt), fetched.bytes, capturedAt);
    const reference = { id: acquisitionId(intent), digest: acquisition.digest };
    const response = { mediaType: fetched.mediaType, lastModified: fetched.lastModified, etag: fetched.etag };
    let observations: CensusObservations;
    try { observations = parseCensusBytes(fetched.bytes, request); }
    catch { return finish({ state: 'QUARANTINED', failureCode: 'INVALID_SOURCE_RESPONSE', acquisition: reference, response, observationsDigest: null }); }
    return finish({ state: 'CAPTURED', failureCode: null, acquisition: reference, response, observationsDigest: localRecordDigest(observations) });
  }

  /** Reopens raw bytes and reexecutes the source parser. No writes, clocks, network or policy renewal. */
  inspect(id: string): SourceCaptureInspection | undefined {
    try {
      const intent = this.readIntent(id);
      if (!intent) {
        if (this.read(id, 'receipt.json') !== undefined || this.intake.inspect(`source-capture:${id}`)) throw new Error('Orphaned source history.');
        return undefined;
      }
      const stored = this.read(id, 'receipt.json');
      const acquisition = this.intake.inspect(acquisitionId(intent));
      if (acquisition && (!same(acquisition.request.manifest, manifestFor(intent, acquisition.request.manifest.capturedAt))
        || instant(acquisition.request.manifest.capturedAt) < intent.startedAt || acquisition.request.byteLength > SOURCE_HTTP_MAX_BYTES)) {
        throw new Error('Source evidence does not match the request.');
      }
      if (acquisition) this.validateBudget(intent);
      let receipt: Receipt | null = null;
      let observations: CensusObservations | null = null;
      if (stored !== undefined) {
        exactFields(stored, ['schema', 'intentDigest', 'state', 'failureCode', 'finishedAt', 'acquisition', 'response', 'observationsDigest', 'digest']);
        receipt = stored as unknown as Receipt;
        verifyDigest(receipt);
        if (receipt.schema !== 'payload.source-capture-receipt.v1' || receipt.intentDigest !== intent.digest
          || !['CAPTURED', 'QUARANTINED', 'FAILED'].includes(receipt.state) || instant(receipt.finishedAt) < intent.startedAt
          || (receipt.failureCode !== null && !FAILURE_CODES.includes(receipt.failureCode))) throw new Error('Invalid source receipt.');
        if (receipt.state === 'FAILED') {
          if (!['FETCH_FAILED', 'RATE_LIMITED', 'LOCAL_BUDGET_EXHAUSTED'].includes(receipt.failureCode!)
            || receipt.acquisition !== null || receipt.response !== null || receipt.observationsDigest !== null || acquisition) throw new Error('Invalid failed source receipt.');
          if (receipt.failureCode === 'LOCAL_BUDGET_EXHAUSTED') this.validateBudgetDenial(intent);
          else this.validateBudget(intent);
        } else {
          this.validateBudget(intent);
          if (!acquisition || !same(receipt.acquisition, { id: acquisitionId(intent), digest: acquisition.digest })
            || receipt.finishedAt < acquisition.request.manifest.capturedAt) throw new Error('Missing or mismatched source evidence.');
          exactFields(receipt.response, ['mediaType', 'lastModified', 'etag']);
          const headers = receipt.response!;
          if (headers.mediaType !== 'application/json'
            || (headers.etag !== null && (typeof headers.etag !== 'string' || !/^[\x20-\x7e]{1,256}$/.test(headers.etag)))
            || (headers.lastModified !== null && (typeof headers.lastModified !== 'string' || !Number.isFinite(Date.parse(headers.lastModified))
              || new Date(headers.lastModified).toUTCString() !== headers.lastModified))) throw new Error('Invalid source response metadata.');
          checkPolicy(intent, acquisition.request.manifest.capturedAt);
          const bytes = Buffer.from(this.intake.objects.get(acquisition.request.contentDigest)!);
          try { observations = parseCensusBytes(bytes, intent.request); } catch { observations = null; }
          if (receipt.state === 'CAPTURED') {
            if (observations === null || receipt.failureCode !== null || localRecordDigest(observations) !== receipt.observationsDigest) throw new Error('Source observations do not recompute.');
          } else if (observations !== null || receipt.failureCode !== 'INVALID_SOURCE_RESPONSE' || receipt.observationsDigest !== null) throw new Error('Source quarantine does not recompute.');
        }
      }
      return { schema: 'payload.source-capture-inspection.v1', state: receipt?.state ?? 'INCOMPLETE', intent, receipt,
        acquisition: acquisition ? { id: acquisitionId(intent), digest: acquisition.digest, contentDigest: acquisition.request.contentDigest,
          byteLength: acquisition.request.byteLength, capturedAt: acquisition.request.manifest.capturedAt } : null,
        observations, integrity: 'RECOMPUTED_LOCAL', canonicalAdmission: false, sourceTruthClaimed: false,
        customerDistributionPermitted: false, independentVerification: false };
    } catch {
      throw error('SOURCE_HISTORY_INVALID', 'Stored source history failed local integrity checks; no history was changed.');
    }
  }
}
