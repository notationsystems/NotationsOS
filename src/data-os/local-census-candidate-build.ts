import { resolve } from 'node:path';
import { CensusNormalizationStore, type CensusCandidate, type CensusNormalizationRun } from '../acquisition/census-normalization';
import { SourceConnectorError } from '../acquisition/errors';
import { byteDigest } from './evidence-capture';
import { publishImmutableFile, readImmutableFile } from './local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from './local-record';
import { evaluateSourceUse } from './source-policy';
import { parseISOInstant, requireText } from './validation';

export const MAX_CENSUS_CANDIDATE_BUILD_BYTES = 512 * 1024;
export const CENSUS_CANDIDATE_BUILD_CONTRACT = Object.freeze({
  id: 'payload.local-fmcsa-census-candidate-build/v2', version: '2.0.0',
  domain: 'CARAVAN', recordType: 'FMCSACompanyCensusObservation', maximumMembers: 64,
  ordering: 'UTF16_NORMALIZATION_ID', sourceIdentityCollisions: 'REJECT',
  knowledgeTime: 'MEMBER_KNOWN_AT_LE_CUTOFF_LE_BUILD_TIME',
  validTime: 'PRESERVE_WITHOUT_FILTERING', sourceClassPolicy: 'EXPLICIT_DECLARED_SET',
  permission: 'INTERNAL_DERIVE_AT_BUILD_TIME_PER_MEMBER', purpose: 'source-qualification',
  canonicalAdmission: false, identityResolved: false, completenessClaimed: false,
  customerDistributionPermitted: false,
} as const);

export interface CensusCandidateBuildRequest {
  schema: 'payload.local-candidate-build-request.v2';
  buildId: string;
  purpose: 'source-qualification';
  knownThrough: string;
  definition: {
    id: string; version: string; domain: 'CARAVAN';
    recordType: 'FMCSACompanyCensusObservation'; sourceClasses: string[];
  };
  normalizations: Array<{ id: string; digest: string }>;
}

interface MemberReference {
  normalization: { id: string; digest: string };
  candidate: { id: string; digest: string };
}

export interface CensusCandidateBuildMember extends MemberReference {
  identity: CensusCandidate['identity'];
  sourceClass: string;
  knownAt: string;
  validTime: CensusCandidate['validTime'];
  sourcePolicy: { id: string; digest: string };
  deriveDecision: ReturnType<typeof evaluateSourceUse>;
}

export interface LocalCensusCandidateBuild {
  schema: 'payload.local-candidate-build.v2';
  buildId: string;
  state: 'UNADMITTED';
  mode: 'LOCAL_SOURCE_QUALIFICATION';
  policyAuthority: 'OPERATOR_DECLARATION';
  canonicalAdmission: false;
  canonicalStateMutated: false;
  identityResolved: false;
  releaseActivated: false;
  sourceTruthClaimed: false;
  independentlyVerified: false;
  completenessClaimed: false;
  customerDistributionPermitted: false;
  request: { manifest: CensusCandidateBuildRequest; contractDigest: string; members: MemberReference[] };
  requestDigest: string;
  builtAt: string;
  knownThrough: string;
  definitionDigest: string;
  recordCount: number;
  recordsRoot: string;
  members: CensusCandidateBuildMember[];
  digest: string;
}

const digest = (value: unknown) => localRecordDigest(value, MAX_CENSUS_CANDIDATE_BUILD_BYTES);
function fault(code: string): never {
  throw new SourceConnectorError(code, 'The local FMCSA candidate build could not be confirmed. Preserve history and inspect the exact dependencies.');
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) fault('INVALID_CENSUS_CANDIDATE_BUILD_REQUEST');
}
function definitionId(value: unknown): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value)) fault('INVALID_CENSUS_CANDIDATE_BUILD_REQUEST');
}
function instant(value: unknown): string {
  parseISOInstant(value, 'candidate build time');
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) fault('INVALID_CENSUS_CANDIDATE_BUILD_TIME');
  return value;
}

export function parseCensusCandidateBuildRequest(value: unknown): CensusCandidateBuildRequest {
  try {
    const input: unknown = JSON.parse(encodeLocalRecord(value, 32 * 1024).toString('utf8'));
    exactFields(input, ['schema', 'buildId', 'purpose', 'knownThrough', 'definition', 'normalizations']);
    if (input.schema !== 'payload.local-candidate-build-request.v2' || input.purpose !== 'source-qualification') throw new Error();
    id(input.buildId); instant(input.knownThrough);
    exactFields(input.definition, ['id', 'version', 'domain', 'recordType', 'sourceClasses']);
    definitionId(input.definition.id); definitionId(input.definition.version);
    if (input.definition.domain !== 'CARAVAN' || input.definition.recordType !== 'FMCSACompanyCensusObservation') throw new Error();
    const classes = input.definition.sourceClasses;
    if (!Array.isArray(classes) || !classes.length || classes.length > 16 || new Set(classes).size !== classes.length) throw new Error();
    for (const sourceClass of classes) requireText(sourceClass, 'sourceClass', 180);
    input.definition.sourceClasses = [...classes].sort();
    const references = input.normalizations;
    if (!Array.isArray(references) || !references.length || references.length > CENSUS_CANDIDATE_BUILD_CONTRACT.maximumMembers) throw new Error();
    for (const reference of references) {
      exactFields(reference, ['id', 'digest']); id(reference.id);
      if (typeof reference.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(reference.digest)) throw new Error();
    }
    if (new Set(references.map((reference) => reference.id)).size !== references.length) throw new Error();
    input.normalizations = [...references].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return input as unknown as CensusCandidateBuildRequest;
  } catch { return fault('INVALID_CENSUS_CANDIDATE_BUILD_REQUEST'); }
}

function recordPath(buildId: string): string[] {
  id(buildId);
  return ['source-candidate-builds', `${byteDigest(Buffer.from(buildId)).slice(7)}.json`];
}

/** Source-specific, reference-only membership. The immutable Carrier v1 contract is untouched. */
export class CensusCandidateBuildStore {
  readonly root: string;
  readonly normalizations: CensusNormalizationStore;
  constructor(root: string) {
    this.root = resolve(root);
    this.normalizations = new CensusNormalizationStore(this.root);
  }

  private dependencies(manifest: CensusCandidateBuildRequest) {
    const seen = new Set<string>();
    return manifest.normalizations.map((reference) => {
      const run = this.normalizations.inspect(reference.id);
      if (!run) fault('CENSUS_BUILD_MEMBER_NOT_FOUND');
      if (run.digest !== reference.digest) fault('CENSUS_BUILD_MEMBER_REFERENCE_MISMATCH');
      if (run.state !== 'NORMALIZED' || !run.candidate || run.candidate.state !== 'UNADMITTED'
        || run.candidate.domain !== manifest.definition.domain || run.candidate.recordType !== manifest.definition.recordType) fault('CENSUS_BUILD_MEMBER_NOT_ELIGIBLE');
      if (instant(run.candidate.knownAt) > manifest.knownThrough) fault('CENSUS_BUILD_MEMBER_AFTER_CUTOFF');
      const identity = localJson([run.candidate.identity.sourceId, run.candidate.identity.sourceRecordId]);
      if (seen.has(identity)) fault('CENSUS_BUILD_SOURCE_IDENTITY_CONFLICT');
      seen.add(identity);
      const acquisition = this.normalizations.intake.inspect(run.candidate.provenance.acquisition.id);
      if (!acquisition || acquisition.digest !== run.candidate.provenance.acquisition.digest
        || acquisition.digest !== run.request.acquisitionDigest) fault('CENSUS_BUILD_ACQUISITION_MISMATCH');
      const registration = acquisition.request.manifest.sourceRegistration;
      if (!manifest.definition.sourceClasses.includes(registration.sourceClass)) fault('CENSUS_BUILD_SOURCE_CLASS_NOT_DECLARED');
      return { run: run as CensusNormalizationRun & { candidate: CensusCandidate }, registration };
    });
  }

  private compile(manifest: CensusCandidateBuildRequest, dependencies: ReturnType<CensusCandidateBuildStore['dependencies']>, builtAt: string): LocalCensusCandidateBuild {
    let at: string;
    try { at = instant(builtAt); } catch { return fault('INVALID_CENSUS_CANDIDATE_BUILD_TIME'); }
    if (manifest.knownThrough > at) fault('INVALID_CENSUS_CANDIDATE_BUILD_TIME');
    const request = { manifest, contractDigest: digest(CENSUS_CANDIDATE_BUILD_CONTRACT),
      members: dependencies.map(({ run }) => ({
        normalization: { id: run.request.manifest.normalizationId, digest: run.digest },
        candidate: { id: run.candidate.candidateId, digest: run.candidate.digest },
      })) };
    const members = dependencies.map(({ run, registration }, index) => {
      const deriveDecision = evaluateSourceUse(registration, {
        requestId: `${manifest.buildId}:member:${index}:derive`, registrationId: registration.registrationId,
        operation: 'DERIVE', audience: 'INTERNAL', purpose: manifest.purpose, requestedAt: at,
      });
      if (deriveDecision.state !== 'ALLOWED') fault('CENSUS_BUILD_DERIVATION_NOT_ALLOWED');
      return { ...request.members[index], identity: run.candidate.identity, sourceClass: registration.sourceClass,
        knownAt: run.candidate.knownAt, validTime: run.candidate.validTime,
        sourcePolicy: { id: registration.registrationId, digest: digest(registration) }, deriveDecision };
    });
    const definitionDigest = digest(manifest.definition);
    const recordsRoot = digest({ domain: 'payload.local-census-candidate-membership.v2',
      definitionDigest, contractDigest: request.contractDigest, members: request.members });
    const payload = { schema: 'payload.local-candidate-build.v2' as const, buildId: manifest.buildId,
      state: 'UNADMITTED' as const, mode: 'LOCAL_SOURCE_QUALIFICATION' as const, policyAuthority: 'OPERATOR_DECLARATION' as const,
      canonicalAdmission: false as const, canonicalStateMutated: false as const, identityResolved: false as const,
      releaseActivated: false as const, sourceTruthClaimed: false as const, independentlyVerified: false as const,
      completenessClaimed: false as const, customerDistributionPermitted: false as const,
      request, requestDigest: digest(request), builtAt: at, knownThrough: manifest.knownThrough,
      definitionDigest, recordCount: members.length, recordsRoot, members };
    return { ...payload, digest: digest(payload) };
  }

  build(value: unknown, builtAt?: string): { status: 'CREATED' | 'EXISTING'; build: LocalCensusCandidateBuild } {
    const manifest = parseCensusCandidateBuildRequest(value);
    const existing = this.inspect(manifest.buildId);
    if (existing) {
      if (localJson(existing.request.manifest) !== localJson(manifest)) fault('CENSUS_CANDIDATE_BUILD_CONFLICT');
      return { status: 'EXISTING', build: existing };
    }
    const build = this.compile(manifest, this.dependencies(manifest), builtAt ?? new Date().toISOString());
    try {
      const status = publishImmutableFile(this.root, recordPath(manifest.buildId), encodeLocalRecord(build, MAX_CENSUS_CANDIDATE_BUILD_BYTES), MAX_CENSUS_CANDIDATE_BUILD_BYTES);
      const verified = this.inspect(manifest.buildId);
      if (!verified || verified.digest !== build.digest) fault('CENSUS_CANDIDATE_BUILD_SAVE_UNCONFIRMED');
      return { status, build: verified };
    } catch {
      let winner: LocalCensusCandidateBuild | undefined;
      try { winner = this.inspect(manifest.buildId); } catch { return fault('CENSUS_CANDIDATE_BUILD_SAVE_UNCONFIRMED'); }
      if (winner?.requestDigest === build.requestDigest) return { status: 'EXISTING', build: winner };
      if (winner) fault('CENSUS_CANDIDATE_BUILD_CONFLICT');
      return fault('CENSUS_CANDIDATE_BUILD_SAVE_UNCONFIRMED');
    }
  }

  /** Reconstruct membership and original policy decisions from preserved evidence. No clocks, writes or collection. */
  inspect(buildId: string): LocalCensusCandidateBuild | undefined {
    id(buildId);
    try {
      const bytes = readImmutableFile(this.root, recordPath(buildId), MAX_CENSUS_CANDIDATE_BUILD_BYTES);
      if (!bytes) return undefined;
      const stored: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      exactFields(stored, ['schema', 'buildId', 'state', 'mode', 'policyAuthority', 'canonicalAdmission', 'canonicalStateMutated',
        'identityResolved', 'releaseActivated', 'sourceTruthClaimed', 'independentlyVerified', 'completenessClaimed',
        'customerDistributionPermitted', 'request', 'requestDigest', 'builtAt', 'knownThrough', 'definitionDigest', 'recordCount',
        'recordsRoot', 'members', 'digest']);
      const build = stored as unknown as LocalCensusCandidateBuild;
      exactFields(build.request, ['manifest', 'contractDigest', 'members']);
      const manifest = parseCensusCandidateBuildRequest(build.request.manifest);
      if (build.buildId !== buildId || manifest.buildId !== buildId) fault('CENSUS_CANDIDATE_BUILD_INVALID');
      const expected = this.compile(manifest, this.dependencies(manifest), build.builtAt);
      if (localJson(expected) !== localJson(build)) fault('CENSUS_CANDIDATE_BUILD_INVALID');
      return build;
    } catch { return fault('CENSUS_CANDIDATE_BUILD_INVALID'); }
  }
}
