import { byteDigest } from './evidence-capture';
import { CARRIER_ADAPTER, CarrierAdapterError, parseCarrierEvidence, type CarrierCandidateData } from './caravan-carrier-adapter';
import { LocalEvidenceIntake, type LocalAcquisition } from './local-intake';
import { publishImmutableFile, readImmutableFile } from './local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from './local-record';
import { evaluateSourceUse } from './source-policy';
import { parseISOInstant, requireIdentifier, requireText } from './validation';

const MAX_RUN_BYTES = 64 * 1024;

export interface NormalizationRequest {
  schema: 'payload.local-normalization-request.v1';
  normalizationId: string;
  acquisitionId: string;
  purpose: string;
  profile: {
    id: string;
    version: string;
    sourceRegistrationId: string;
    sourceId: string;
    adapterId: 'caravan.carrier-json/v1';
  };
}

export interface LocalCarrierCandidate {
  schema: 'payload.local-carrier-candidate.v1';
  candidateId: string;
  domain: 'CARAVAN';
  recordType: 'Carrier';
  state: 'UNADMITTED';
  identity: { state: 'UNRESOLVED'; sourceId: string; sourceRecordId: string; canonicalId: null };
  fields: CarrierCandidateData['fields'];
  missingFields: string[];
  validTime: CarrierCandidateData['validTime'];
  knownAt: string;
  provenance: {
    acquisition: { id: string; digest: string };
    evidence: { id: string; contentDigest: string };
    receipt: { id: string; digest: string };
    sourcePolicy: { id: string; digest: string };
    derivation: { id: string; digest: string };
    adapter: { id: string; version: string; contractDigest: string };
  };
  digest: string;
}

export interface LocalNormalizationRun {
  schema: 'payload.local-normalization-run.v1';
  mode: 'LOCAL_DEVELOPMENT';
  policyAuthority: 'OPERATOR_DECLARATION';
  canonicalAdmission: false;
  sourceTruthClaimed: false;
  fieldAccuracyClaimed: false;
  independentlyVerified: false;
  request: { manifest: NormalizationRequest; acquisitionDigest: string; adapterDigest: string };
  requestDigest: string;
  normalizedAt: string;
  deriveDecision: ReturnType<typeof evaluateSourceUse>;
  state: 'NORMALIZED' | 'QUARANTINED';
  reasons: string[];
  candidate: LocalCarrierCandidate | null;
  digest: string;
}

export function parseNormalizationRequest(value: unknown): NormalizationRequest {
  const input: unknown = JSON.parse(encodeLocalRecord(value).toString('utf8'));
  exactFields(input, ['schema', 'normalizationId', 'acquisitionId', 'purpose', 'profile']);
  if (input.schema !== 'payload.local-normalization-request.v1') throw new Error('Unsupported normalization request schema.');
  requireText(input.normalizationId, 'normalizationId', 180);
  requireIdentifier(input.normalizationId, 'normalizationId');
  requireIdentifier(input.acquisitionId, 'acquisitionId');
  requireText(input.purpose, 'purpose', 180);
  exactFields(input.profile, ['id', 'version', 'sourceRegistrationId', 'sourceId', 'adapterId']);
  for (const key of ['id', 'version', 'sourceRegistrationId', 'sourceId'] as const) requireIdentifier(input.profile[key], `profile.${key}`);
  if (input.profile.adapterId !== CARRIER_ADAPTER.id) throw new Error('UNSUPPORTED_ADAPTER: this version supports only the Caravan carrier JSON adapter.');
  return input as unknown as NormalizationRequest;
}

function recordPath(id: string) {
  requireIdentifier(id, 'normalizationId');
  return ['normalizations', `${byteDigest(Buffer.from(id, 'utf8')).slice(7)}.json`];
}

/** Candidate metadata only: neither this store nor its parser owns canonical domain state. */
export class LocalNormalizationStore {
  readonly intake: LocalEvidenceIntake;
  constructor(root: string) { this.intake = new LocalEvidenceIntake(root); }

  private acquisition(manifest: NormalizationRequest): LocalAcquisition {
    const acquisition = this.intake.inspect(manifest.acquisitionId);
    if (!acquisition) throw new Error('ACQUISITION_NOT_FOUND: capture and verify source evidence first.');
    const registration = acquisition.request.manifest.sourceRegistration;
    if (registration.registrationId !== manifest.profile.sourceRegistrationId || registration.sourceId !== manifest.profile.sourceId) {
      throw new Error('SOURCE_PROFILE_MISMATCH: the profile must bind the acquisition source and registration.');
    }
    return acquisition;
  }

  private request(manifest: NormalizationRequest, acquisition: LocalAcquisition) {
    return { manifest, acquisitionDigest: acquisition.digest, adapterDigest: localRecordDigest(CARRIER_ADAPTER) };
  }

  private compile(manifest: NormalizationRequest, acquisition: LocalAcquisition, normalizedAt: string): LocalNormalizationRun {
    if (parseISOInstant(normalizedAt, 'normalizedAt') < parseISOInstant(acquisition.capture.receipt.storedAt, 'storedAt')) {
      throw new Error('Normalization cannot precede evidence storage.');
    }
    const registration = acquisition.request.manifest.sourceRegistration;
    const deriveDecision = evaluateSourceUse(registration, { requestId: `${manifest.normalizationId}:derive`,
      registrationId: registration.registrationId, operation: 'DERIVE', audience: 'INTERNAL', purpose: manifest.purpose, requestedAt: normalizedAt });
    if (deriveDecision.state !== 'ALLOWED') throw new Error(`DERIVATION_NOT_ALLOWED: ${deriveDecision.reasons.join(', ')}.`);
    const request = this.request(manifest, acquisition);
    let candidate: LocalCarrierCandidate | null = null;
    let reasons: string[] = [];
    if (acquisition.capture.evidence.mediaType !== CARRIER_ADAPTER.expectedMediaType) reasons = ['MEDIA_TYPE_MISMATCH'];
    else {
      const content = this.intake.objects.get(acquisition.request.contentDigest);
      if (!content) throw new Error('INVALID_ACQUISITION: source evidence is unavailable.');
      let data: CarrierCandidateData | undefined;
      try { data = parseCarrierEvidence(content); }
      catch (error) { if (error instanceof CarrierAdapterError) reasons = [error.code]; else throw error; }
      if (data) {
        const payload = { schema: 'payload.local-carrier-candidate.v1' as const, candidateId: `${manifest.normalizationId}:candidate`,
          domain: 'CARAVAN' as const, recordType: 'Carrier' as const, state: 'UNADMITTED' as const,
          identity: { state: 'UNRESOLVED' as const, sourceId: registration.sourceId, sourceRecordId: data.sourceRecordId, canonicalId: null },
          fields: data.fields, missingFields: data.missingFields, validTime: data.validTime, knownAt: normalizedAt,
          provenance: {
            acquisition: { id: manifest.acquisitionId, digest: acquisition.digest },
            evidence: { id: acquisition.capture.evidence.evidenceId, contentDigest: acquisition.request.contentDigest },
            receipt: { id: acquisition.capture.receipt.receiptId, digest: localRecordDigest(acquisition.capture.receipt) },
            sourcePolicy: { id: registration.registrationId, digest: localRecordDigest(registration) },
            derivation: { id: deriveDecision.decisionId, digest: localRecordDigest(deriveDecision) },
            adapter: { id: CARRIER_ADAPTER.id, version: CARRIER_ADAPTER.version, contractDigest: request.adapterDigest },
          },
        };
        candidate = { ...payload, digest: localRecordDigest(payload) };
      }
    }
    const payload = { schema: 'payload.local-normalization-run.v1' as const, mode: 'LOCAL_DEVELOPMENT' as const,
      policyAuthority: 'OPERATOR_DECLARATION' as const, canonicalAdmission: false as const, sourceTruthClaimed: false as const,
      fieldAccuracyClaimed: false as const, independentlyVerified: false as const, request, requestDigest: localRecordDigest(request),
      normalizedAt, deriveDecision, state: candidate ? 'NORMALIZED' as const : 'QUARANTINED' as const,
      reasons: candidate ? ['CONTRACT_MATCH'] : reasons, candidate };
    return { ...payload, digest: localRecordDigest(payload) };
  }

  normalize(value: unknown, normalizedAt = new Date().toISOString()): { status: 'CREATED' | 'EXISTING'; run: LocalNormalizationRun } {
    const manifest = parseNormalizationRequest(value);
    const acquisition = this.acquisition(manifest);
    const requestDigest = localRecordDigest(this.request(manifest, acquisition));
    const existing = this.inspect(manifest.normalizationId);
    if (existing) {
      if (existing.requestDigest !== requestDigest) throw new Error('NORMALIZATION_CONFLICT: this id already names a different request.');
      return { status: 'EXISTING', run: existing };
    }
    const run = this.compile(manifest, acquisition, normalizedAt);
    const bytes = encodeLocalRecord(run, MAX_RUN_BYTES);
    try {
      const status = publishImmutableFile(this.intake.root, recordPath(manifest.normalizationId), bytes, MAX_RUN_BYTES);
      return { status, run };
    } catch (error) {
      const winner = this.inspect(manifest.normalizationId);
      if (winner?.requestDigest === requestDigest) return { status: 'EXISTING', run: winner };
      if (winner) throw new Error('NORMALIZATION_CONFLICT: a concurrent request published this id.');
      throw error;
    }
  }

  /** Reparse the original bytes and recompute the historical DERIVE decision without writes. */
  inspect(id: string): LocalNormalizationRun | undefined {
    const bytes = readImmutableFile(this.intake.root, recordPath(id), MAX_RUN_BYTES);
    if (!bytes) return undefined;
    const stored: unknown = JSON.parse(bytes.toString('utf8'));
    exactFields(stored, ['schema', 'mode', 'policyAuthority', 'canonicalAdmission', 'sourceTruthClaimed', 'fieldAccuracyClaimed', 'independentlyVerified', 'request', 'requestDigest', 'normalizedAt', 'deriveDecision', 'state', 'reasons', 'candidate', 'digest']);
    const run = stored as unknown as LocalNormalizationRun;
    exactFields(run.request, ['manifest', 'acquisitionDigest', 'adapterDigest']);
    const manifest = parseNormalizationRequest(run.request.manifest);
    if (manifest.normalizationId !== id) throw new Error('INVALID_NORMALIZATION: the stored identity does not match.');
    const acquisition = this.acquisition(manifest);
    const expected = this.compile(manifest, acquisition, run.normalizedAt);
    if (localJson(expected) !== localJson(run)) throw new Error('INVALID_NORMALIZATION: the acquisition, adapter, policy or candidate does not recompute.');
    return run;
  }
}
