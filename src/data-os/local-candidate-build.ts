import { byteDigest } from './evidence-capture';
import { LocalNormalizationStore, type LocalCarrierCandidate, type LocalNormalizationRun } from './local-normalization';
import { publishImmutableFile, readImmutableFile } from './local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from './local-record';
import { evaluateSourceUse } from './source-policy';
import { parseISOInstant, requireIdentifier, requireText } from './validation';

export const MAX_CANDIDATE_BUILD_BYTES = 512 * 1024;
export const CANDIDATE_BUILD_CONTRACT = Object.freeze({
  id: 'payload.local-caravan-candidate-build/v1', version: '1.0.0',
  domain: 'CARAVAN', recordType: 'Carrier', maximumMembers: 64,
  ordering: 'UTF16_NORMALIZATION_ID', sourceIdentityCollisions: 'REJECT',
  knowledgeTime: 'MEMBER_KNOWN_AT_LE_CUTOFF_LE_BUILD_TIME',
  validTime: 'PRESERVE_WITHOUT_FILTERING', sourceClassPolicy: 'EXPLICIT_DECLARED_SET',
  permission: 'INTERNAL_DERIVE_AT_BUILD_TIME_PER_MEMBER',
  canonicalAdmission: false, identityResolved: false, completenessClaimed: false,
} as const);

export interface CandidateBuildRequest {
  schema: 'payload.local-candidate-build-request.v1';
  buildId: string;
  purpose: string;
  knownThrough: string;
  definition: {
    id: string; version: string; domain: 'CARAVAN'; recordType: 'Carrier'; sourceClasses: string[];
  };
  normalizationIds: string[];
}

interface MemberReference {
  normalization: { id: string; digest: string };
  candidate: { id: string; digest: string };
}

export interface CandidateBuildMember extends MemberReference {
  identity: LocalCarrierCandidate['identity'];
  sourceClass: string;
  knownAt: string;
  validTime: LocalCarrierCandidate['validTime'];
  sourcePolicy: { id: string; digest: string };
  deriveDecision: ReturnType<typeof evaluateSourceUse>;
}

export interface LocalCandidateBuild {
  schema: 'payload.local-candidate-build.v1';
  buildId: string;
  state: 'UNADMITTED';
  mode: 'LOCAL_DEVELOPMENT';
  policyAuthority: 'OPERATOR_DECLARATION';
  canonicalAdmission: false;
  canonicalStateMutated: false;
  identityResolved: false;
  releaseActivated: false;
  sourceTruthClaimed: false;
  independentlyVerified: false;
  completenessClaimed: false;
  request: { manifest: CandidateBuildRequest; contractDigest: string; members: MemberReference[] };
  requestDigest: string;
  builtAt: string;
  knownThrough: string;
  definitionDigest: string;
  recordCount: number;
  recordsRoot: string;
  members: CandidateBuildMember[];
  digest: string;
}

const digest = (value: unknown) => localRecordDigest(value, MAX_CANDIDATE_BUILD_BYTES);

function parseRequest(value: unknown): CandidateBuildRequest {
  const input: unknown = JSON.parse(encodeLocalRecord(value).toString('utf8'));
  exactFields(input, ['schema', 'buildId', 'purpose', 'knownThrough', 'definition', 'normalizationIds']);
  if (input.schema !== 'payload.local-candidate-build-request.v1') throw new Error('Unsupported candidate build request schema.');
  requireIdentifier(input.buildId, 'buildId');
  requireText(input.buildId, 'buildId', 180);
  requireText(input.purpose, 'purpose', 180);
  input.knownThrough = new Date(parseISOInstant(input.knownThrough, 'knownThrough')).toISOString();
  exactFields(input.definition, ['id', 'version', 'domain', 'recordType', 'sourceClasses']);
  requireIdentifier(input.definition.id, 'definition.id');
  requireIdentifier(input.definition.version, 'definition.version');
  if (input.definition.domain !== 'CARAVAN' || input.definition.recordType !== 'Carrier') {
    throw new Error('Candidate builds support only the Caravan Carrier contract.');
  }
  const classes = input.definition.sourceClasses;
  if (!Array.isArray(classes) || classes.length === 0 || classes.length > 16 || new Set(classes).size !== classes.length) {
    throw new Error('definition.sourceClasses requires 1–16 unique source classes.');
  }
  for (const value of classes) requireText(value, 'definition.sourceClasses', 180);
  input.definition.sourceClasses = [...classes].sort();
  const ids = input.normalizationIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > CANDIDATE_BUILD_CONTRACT.maximumMembers || new Set(ids).size !== ids.length) {
    throw new Error('normalizationIds requires 1–64 unique normalization ids.');
  }
  for (const id of ids) { requireIdentifier(id, 'normalizationIds'); requireText(id, 'normalizationIds', 180); }
  input.normalizationIds = [...ids].sort();
  return input as unknown as CandidateBuildRequest;
}

export function parseCandidateBuildRequest(value: unknown): CandidateBuildRequest {
  try { return parseRequest(value); }
  catch (error) { throw new Error(`INVALID_CANDIDATE_BUILD: ${error instanceof Error ? error.message : 'Invalid request.'}`); }
}

function recordPath(id: string) {
  requireIdentifier(id, 'buildId');
  return ['candidate-builds', `${byteDigest(Buffer.from(id, 'utf8')).slice(7)}.json`];
}

/** Explicit local candidate membership only; no canonical admission or active-release pointer. */
export class LocalCandidateBuildStore {
  readonly normalizations: LocalNormalizationStore;
  constructor(root: string) { this.normalizations = new LocalNormalizationStore(root); }

  private dependencies(manifest: CandidateBuildRequest) {
    const seen = new Set<string>();
    return manifest.normalizationIds.map((id) => {
      const run = this.normalizations.inspect(id);
      if (!run) throw new Error(`MEMBER_NOT_FOUND: ${id}.`);
      if (run.state !== 'NORMALIZED' || !run.candidate || run.candidate.domain !== manifest.definition.domain ||
          run.candidate.recordType !== manifest.definition.recordType || run.candidate.state !== 'UNADMITTED') {
        throw new Error(`MEMBER_NOT_ELIGIBLE: ${id} is not a normalized Carrier candidate.`);
      }
      if (parseISOInstant(run.candidate.knownAt, 'candidate.knownAt') > parseISOInstant(manifest.knownThrough, 'knownThrough')) {
        throw new Error(`MEMBER_AFTER_CUTOFF: ${id}.`);
      }
      // Tuple encoding avoids separator collisions; neither labels nor registration numbers are identity.
      const sourceIdentity = localJson([run.candidate.identity.sourceId, run.candidate.identity.sourceRecordId]);
      if (seen.has(sourceIdentity)) throw new Error('SOURCE_IDENTITY_CONFLICT: select one version per source-scoped record; no automatic revision selection exists.');
      seen.add(sourceIdentity);
      const acquisition = this.normalizations.intake.inspect(run.request.manifest.acquisitionId);
      if (!acquisition || acquisition.digest !== run.request.acquisitionDigest) throw new Error('INVALID_CANDIDATE_BUILD: acquisition binding changed.');
      const registration = acquisition.request.manifest.sourceRegistration;
      if (!manifest.definition.sourceClasses.includes(registration.sourceClass)) throw new Error(`SOURCE_CLASS_NOT_DECLARED: ${registration.sourceClass}.`);
      return { run: run as LocalNormalizationRun & { candidate: LocalCarrierCandidate }, registration };
    });
  }

  private request(manifest: CandidateBuildRequest, dependencies: ReturnType<LocalCandidateBuildStore['dependencies']>) {
    return { manifest, contractDigest: digest(CANDIDATE_BUILD_CONTRACT), members: dependencies.map(({ run }) => ({
      normalization: { id: run.request.manifest.normalizationId, digest: run.digest },
      candidate: { id: run.candidate.candidateId, digest: run.candidate.digest },
    })) };
  }

  private compile(manifest: CandidateBuildRequest, dependencies: ReturnType<LocalCandidateBuildStore['dependencies']>, builtAt: string): LocalCandidateBuild {
    if (parseISOInstant(manifest.knownThrough, 'knownThrough') > parseISOInstant(builtAt, 'builtAt')) {
      throw new Error('Candidate build cutoff cannot follow builtAt.');
    }
    const request = this.request(manifest, dependencies);
    const members = dependencies.map(({ run, registration }, index) => {
      const deriveDecision = evaluateSourceUse(registration, {
        requestId: `${manifest.buildId}:member:${index}:derive`, registrationId: registration.registrationId,
        operation: 'DERIVE', audience: 'INTERNAL', purpose: manifest.purpose, requestedAt: builtAt,
      });
      if (deriveDecision.state !== 'ALLOWED') throw new Error(`BUILD_DERIVATION_NOT_ALLOWED: ${run.request.manifest.normalizationId}: ${deriveDecision.reasons.join(', ')}.`);
      return { ...request.members[index], identity: run.candidate.identity, sourceClass: registration.sourceClass,
        knownAt: run.candidate.knownAt, validTime: run.candidate.validTime,
        sourcePolicy: { id: registration.registrationId, digest: digest(registration) }, deriveDecision };
    });
    const definitionDigest = digest(manifest.definition);
    const recordsRoot = digest({ domain: 'payload.local-candidate-membership.v1',
      definitionDigest, contractDigest: request.contractDigest, members: request.members });
    const payload = { schema: 'payload.local-candidate-build.v1' as const, buildId: manifest.buildId,
      state: 'UNADMITTED' as const, mode: 'LOCAL_DEVELOPMENT' as const, policyAuthority: 'OPERATOR_DECLARATION' as const,
      canonicalAdmission: false as const, canonicalStateMutated: false as const, identityResolved: false as const,
      releaseActivated: false as const, sourceTruthClaimed: false as const, independentlyVerified: false as const, completenessClaimed: false as const,
      request, requestDigest: digest(request), builtAt, knownThrough: manifest.knownThrough, definitionDigest,
      recordCount: members.length, recordsRoot, members };
    return { ...payload, digest: digest(payload) };
  }

  build(value: unknown, builtAt = new Date().toISOString()): { status: 'CREATED' | 'EXISTING'; build: LocalCandidateBuild } {
    const manifest = parseCandidateBuildRequest(value);
    const dependencies = this.dependencies(manifest);
    const requestDigest = digest(this.request(manifest, dependencies));
    const existing = this.inspect(manifest.buildId);
    if (existing) {
      if (existing.requestDigest !== requestDigest) throw new Error('CANDIDATE_BUILD_CONFLICT: this id already names a different request.');
      return { status: 'EXISTING', build: existing };
    }
    const build = this.compile(manifest, dependencies, builtAt);
    const bytes = encodeLocalRecord(build, MAX_CANDIDATE_BUILD_BYTES);
    try {
      const status = publishImmutableFile(this.normalizations.intake.root, recordPath(manifest.buildId), bytes, MAX_CANDIDATE_BUILD_BYTES);
      return { status, build };
    } catch (error) {
      const winner = this.inspect(manifest.buildId);
      if (winner?.requestDigest === requestDigest) return { status: 'EXISTING', build: winner };
      if (winner) throw new Error('CANDIDATE_BUILD_CONFLICT: a concurrent request published this id.');
      throw error;
    }
  }

  /** Reconstruct exact membership and historical decisions from stored source bytes. Never repairs. */
  inspect(id: string): LocalCandidateBuild | undefined {
    const bytes = readImmutableFile(this.normalizations.intake.root, recordPath(id), MAX_CANDIDATE_BUILD_BYTES);
    if (!bytes) return undefined;
    const stored: unknown = JSON.parse(bytes.toString('utf8'));
    exactFields(stored, ['schema', 'buildId', 'state', 'mode', 'policyAuthority', 'canonicalAdmission', 'canonicalStateMutated',
      'identityResolved', 'releaseActivated', 'sourceTruthClaimed', 'independentlyVerified', 'completenessClaimed', 'request',
      'requestDigest', 'builtAt', 'knownThrough', 'definitionDigest', 'recordCount', 'recordsRoot', 'members', 'digest']);
    const build = stored as unknown as LocalCandidateBuild;
    exactFields(build.request, ['manifest', 'contractDigest', 'members']);
    const manifest = parseCandidateBuildRequest(build.request.manifest);
    if (manifest.buildId !== id || build.buildId !== id) throw new Error('INVALID_CANDIDATE_BUILD: stored identity does not match.');
    const expected = this.compile(manifest, this.dependencies(manifest), build.builtAt);
    if (localJson(expected) !== localJson(build)) throw new Error('INVALID_CANDIDATE_BUILD: membership, definition, policy or upstream evidence does not recompute.');
    return build;
  }
}
