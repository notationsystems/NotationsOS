import { resolve } from 'node:path';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import { CENSUS_NORMALIZATION_ADAPTER, parseCensusCandidateData, type CensusCandidateData } from './census-adapter';
import { SourceConnectorError } from './errors';
import { SourceCaptureStore } from './store';

const MAX_BYTES = 128 * 1024;
const digest = (value: unknown) => localRecordDigest(value, MAX_BYTES);

export interface CensusNormalizationRequest {
  schema: 'payload.fmcsa-census-normalization-request.v1';
  normalizationId: string;
  purpose: 'source-qualification';
  capture: { requestId: string; receiptDigest: string };
  usdot: string;
}

export interface CensusCandidate {
  schema: 'payload.fmcsa-census-candidate.v1';
  candidateId: string;
  domain: 'CARAVAN';
  recordType: 'FMCSACompanyCensusObservation';
  state: 'UNADMITTED';
  identity: { state: 'UNRESOLVED'; sourceId: 'fmcsa-company-census'; sourceRecordId: string; canonicalId: null };
  fields: CensusCandidateData['fields'];
  validTime: CensusCandidateData['validTime'];
  knownAt: string;
  temporal: {
    capturedAt: string;
    providerLastModified: string | null;
    filingDateMeaning: 'SOURCE_FILING_DATE_NOT_VALID_TIME';
    validTimeMeaning: 'NOT_ESTABLISHED_BY_SNAPSHOT';
  };
  provenance: {
    capture: { requestId: string; intentDigest: string; receiptDigest: string };
    acquisition: { id: string; digest: string };
    evidence: { id: string; contentDigest: string };
    receipt: { id: string; digest: string };
    sourcePolicy: { id: string; digest: string };
    derivation: { id: string; digest: string };
    adapter: { id: string; version: string; contractDigest: string };
  };
  digest: string;
}

export interface CensusNormalizationRun {
  schema: 'payload.fmcsa-census-normalization.v1';
  mode: 'LOCAL_SOURCE_QUALIFICATION';
  policyAuthority: 'OPERATOR_DECLARATION';
  canonicalAdmission: false;
  sourceTruthClaimed: false;
  fieldAccuracyClaimed: false;
  independentlyVerified: false;
  customerDistributionPermitted: false;
  request: {
    manifest: CensusNormalizationRequest;
    captureIntentDigest: string;
    acquisitionDigest: string;
    adapterDigest: string;
  };
  requestDigest: string;
  normalizedAt: string;
  deriveDecision: ReturnType<typeof evaluateSourceUse>;
  state: 'NORMALIZED' | 'NOT_RETURNED';
  notReturned: string[];
  candidate: CensusCandidate | null;
  digest: string;
}

function fault(code: string): never { throw new SourceConnectorError(code, 'The local FMCSA normalization contract was not satisfied.'); }
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) fault('INVALID_CENSUS_NORMALIZATION_REQUEST');
}
function hash(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) fault('INVALID_CENSUS_NORMALIZATION_REQUEST');
}
function instant(value: string): string {
  parseISOInstant(value, 'normalizedAt');
  if (new Date(value).toISOString() !== value) fault('INVALID_CENSUS_NORMALIZATION_TIME');
  return value;
}

export function parseCensusNormalizationRequest(value: unknown): CensusNormalizationRequest {
  try {
    const input: unknown = JSON.parse(encodeLocalRecord(value, 8192).toString('utf8'));
    exactFields(input, ['schema', 'normalizationId', 'purpose', 'capture', 'usdot']);
    if (input.schema !== 'payload.fmcsa-census-normalization-request.v1' || input.purpose !== 'source-qualification') fault('INVALID_CENSUS_NORMALIZATION_REQUEST');
    id(input.normalizationId);
    exactFields(input.capture, ['requestId', 'receiptDigest']);
    id(input.capture.requestId); hash(input.capture.receiptDigest);
    if (typeof input.usdot !== 'string' || !/^[1-9][0-9]{0,7}$/.test(input.usdot)) fault('INVALID_CENSUS_NORMALIZATION_REQUEST');
    return input as unknown as CensusNormalizationRequest;
  } catch { return fault('INVALID_CENSUS_NORMALIZATION_REQUEST'); }
}

function recordPath(normalizationId: string): string[] {
  id(normalizationId);
  return ['source-normalizations', `${byteDigest(Buffer.from(normalizationId)).slice(7)}.json`];
}

/** A source-specific extension of the local evidence rail; legacy Carrier v1 stays byte-compatible. */
export class CensusNormalizationStore {
  readonly root: string;
  readonly intake: LocalEvidenceIntake;
  readonly captures: SourceCaptureStore;
  constructor(root: string) {
    this.root = resolve(root);
    this.intake = new LocalEvidenceIntake(this.root);
    this.captures = new SourceCaptureStore(this.root);
  }

  private dependencies(manifest: CensusNormalizationRequest) {
    const capture = this.captures.inspect(manifest.capture.requestId);
    if (!capture) fault('CENSUS_CAPTURE_NOT_FOUND');
    if (capture.state !== 'CAPTURED' || !capture.receipt || !capture.acquisition || !capture.observations) fault('CENSUS_CAPTURE_NOT_ELIGIBLE');
    if (capture.receipt.digest !== manifest.capture.receiptDigest) fault('CENSUS_CAPTURE_REFERENCE_MISMATCH');
    if (!capture.intent.request.usdot.includes(manifest.usdot)) fault('CENSUS_IDENTIFIER_NOT_REQUESTED');
    const acquisition = this.intake.inspect(capture.acquisition.id);
    if (!acquisition || acquisition.digest !== capture.acquisition.digest) fault('CENSUS_ACQUISITION_MISMATCH');
    const content = this.intake.objects.get(acquisition.request.contentDigest);
    if (!content) fault('CENSUS_SOURCE_UNAVAILABLE');
    const data = parseCensusCandidateData(Buffer.from(content), capture.intent.request, manifest.usdot);
    return { capture, receipt: capture.receipt, acquisition, data };
  }

  private request(manifest: CensusNormalizationRequest, dependencies: ReturnType<CensusNormalizationStore['dependencies']>) {
    return { manifest, captureIntentDigest: dependencies.capture.intent.digest,
      acquisitionDigest: dependencies.acquisition.digest, adapterDigest: digest(CENSUS_NORMALIZATION_ADAPTER) };
  }

  private compile(manifest: CensusNormalizationRequest, dependencies: ReturnType<CensusNormalizationStore['dependencies']>, normalizedAt: string): CensusNormalizationRun {
    const { capture, receipt, acquisition, data } = dependencies;
    const at = instant(normalizedAt);
    if (at < receipt.finishedAt || at < acquisition.capture.receipt.storedAt) fault('INVALID_CENSUS_NORMALIZATION_TIME');
    const registration = acquisition.request.manifest.sourceRegistration;
    const deriveDecision = evaluateSourceUse(registration, { requestId: `${manifest.normalizationId}:derive`,
      registrationId: registration.registrationId, operation: 'DERIVE', audience: 'INTERNAL', purpose: manifest.purpose, requestedAt: at });
    if (deriveDecision.state !== 'ALLOWED') fault('CENSUS_DERIVATION_NOT_ALLOWED');
    const request = this.request(manifest, dependencies);
    let candidate: CensusCandidate | null = null;
    if (data) {
      const payload = {
        schema: 'payload.fmcsa-census-candidate.v1' as const, candidateId: `${manifest.normalizationId}:candidate`,
        domain: 'CARAVAN' as const, recordType: 'FMCSACompanyCensusObservation' as const, state: 'UNADMITTED' as const,
        identity: { state: 'UNRESOLVED' as const, sourceId: 'fmcsa-company-census' as const, sourceRecordId: data.sourceRecordId, canonicalId: null },
        fields: data.fields, validTime: data.validTime, knownAt: at,
        temporal: { capturedAt: acquisition.capture.evidence.capturedAt,
          providerLastModified: receipt.response?.lastModified ?? null,
          filingDateMeaning: 'SOURCE_FILING_DATE_NOT_VALID_TIME' as const, validTimeMeaning: 'NOT_ESTABLISHED_BY_SNAPSHOT' as const },
        provenance: {
          capture: { requestId: manifest.capture.requestId, intentDigest: capture.intent.digest, receiptDigest: receipt.digest },
          acquisition: { id: acquisition.request.manifest.acquisitionId, digest: acquisition.digest },
          evidence: { id: acquisition.capture.evidence.evidenceId, contentDigest: acquisition.request.contentDigest },
          receipt: { id: acquisition.capture.receipt.receiptId, digest: digest(acquisition.capture.receipt) },
          sourcePolicy: { id: registration.registrationId, digest: digest(registration) },
          derivation: { id: deriveDecision.decisionId, digest: digest(deriveDecision) },
          adapter: { id: CENSUS_NORMALIZATION_ADAPTER.id, version: CENSUS_NORMALIZATION_ADAPTER.version, contractDigest: request.adapterDigest },
        },
      };
      candidate = { ...payload, digest: digest(payload) };
    }
    const payload = { schema: 'payload.fmcsa-census-normalization.v1' as const, mode: 'LOCAL_SOURCE_QUALIFICATION' as const,
      policyAuthority: 'OPERATOR_DECLARATION' as const, canonicalAdmission: false as const, sourceTruthClaimed: false as const,
      fieldAccuracyClaimed: false as const, independentlyVerified: false as const, customerDistributionPermitted: false as const,
      request, requestDigest: digest(request), normalizedAt: at, deriveDecision,
      state: data ? 'NORMALIZED' as const : 'NOT_RETURNED' as const,
      notReturned: data ? [] : [manifest.usdot], candidate };
    return { ...payload, digest: digest(payload) };
  }

  normalize(value: unknown, normalizedAt?: string): { status: 'CREATED' | 'EXISTING'; run: CensusNormalizationRun } {
    const manifest = parseCensusNormalizationRequest(value);
    const existing = this.inspect(manifest.normalizationId);
    if (existing) {
      if (localJson(existing.request.manifest) !== localJson(manifest)) fault('CENSUS_NORMALIZATION_CONFLICT');
      return { status: 'EXISTING', run: existing };
    }
    const dependencies = this.dependencies(manifest);
    const run = this.compile(manifest, dependencies, normalizedAt ?? new Date().toISOString());
    try {
      const status = publishImmutableFile(this.root, recordPath(manifest.normalizationId), encodeLocalRecord(run, MAX_BYTES), MAX_BYTES);
      const verified = this.inspect(manifest.normalizationId);
      if (!verified || verified.digest !== run.digest) fault('CENSUS_NORMALIZATION_SAVE_UNCONFIRMED');
      return { status, run: verified };
    } catch (error) {
      const winner = this.inspect(manifest.normalizationId);
      if (winner?.requestDigest === run.requestDigest) return { status: 'EXISTING', run: winner };
      if (winner) fault('CENSUS_NORMALIZATION_CONFLICT');
      throw error;
    }
  }

  /** Resolve the exact proof closure and re-run this adapter at the stored time, without writes or collection. */
  inspect(normalizationId: string): CensusNormalizationRun | undefined {
    const bytes = readImmutableFile(this.root, recordPath(normalizationId), MAX_BYTES);
    if (!bytes) return undefined;
    const stored: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    exactFields(stored, ['schema', 'mode', 'policyAuthority', 'canonicalAdmission', 'sourceTruthClaimed', 'fieldAccuracyClaimed',
      'independentlyVerified', 'customerDistributionPermitted', 'request', 'requestDigest', 'normalizedAt', 'deriveDecision', 'state', 'notReturned', 'candidate', 'digest']);
    const run = stored as unknown as CensusNormalizationRun;
    exactFields(run.request, ['manifest', 'captureIntentDigest', 'acquisitionDigest', 'adapterDigest']);
    const manifest = parseCensusNormalizationRequest(run.request.manifest);
    if (manifest.normalizationId !== normalizationId) fault('INVALID_CENSUS_NORMALIZATION');
    const expected = this.compile(manifest, this.dependencies(manifest), run.normalizedAt);
    if (localJson(expected) !== localJson(run)) fault('INVALID_CENSUS_NORMALIZATION');
    return run;
  }
}
