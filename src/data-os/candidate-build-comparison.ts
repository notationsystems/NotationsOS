import { LocalCandidateBuildStore, type CandidateBuildMember, type LocalCandidateBuild } from './local-candidate-build';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from './local-record';
import { parseISOInstant, requireIdentifier, requireText } from './validation';

export const MAX_CANDIDATE_COMPARISON_BYTES = 512 * 1024;
export const CANDIDATE_BUILD_COMPARISON_CONTRACT = Object.freeze({
  id: 'payload.local-candidate-build-comparison/v1', version: '1.0.0', maximumEntries: 128,
  identity: 'EXACT_SOURCE_ID_AND_SOURCE_RECORD_ID_TUPLE', ordering: 'UTF16_JSON_IDENTITY_TUPLE',
  equality: 'EXACT_NORMALIZATION_AND_CANDIDATE_REFERENCES',
  compatibility: 'SAME_DEFINITION_BUILD_CONTRACT_AND_PURPOSE',
  time: 'NONDECREASING_BUILD_TIME_AND_KNOWLEDGE_CUTOFF',
  persistence: 'NONE', semanticMeaningInferred: false,
} as const);

type ComparisonErrorCode = 'INVALID_COMPARISON_REQUEST' | 'BUILD_NOT_FOUND' | 'BUILD_DIGEST_MISMATCH' |
  'BUILD_INSPECTION_FAILED' | 'INCOMPATIBLE_BUILDS' | 'REVERSED_BUILD_ORDER';

export class CandidateBuildComparisonError extends Error {
  constructor(readonly code: ComparisonErrorCode, detail: string) {
    super(`${code}: ${detail}`); this.name = 'CandidateBuildComparisonError';
  }
}

interface BuildReference { buildId: string; expectedDigest: string }
export interface CandidateBuildComparisonRequest {
  schema: 'payload.local-candidate-build-comparison-request.v1';
  before: BuildReference;
  after: BuildReference;
}

interface MemberReference {
  normalization: { id: string; digest: string };
  candidate: { id: string; digest: string };
}
export interface CandidateComparisonEntry {
  kind: 'ADDED' | 'REMOVED' | 'REFERENCE_CHANGED' | 'UNCHANGED';
  identity: CandidateBuildMember['identity'];
  before: MemberReference | null;
  after: MemberReference | null;
}

/** Only named local build references, never supplied build bodies or filesystem options. */
export function parseCandidateBuildComparisonRequest(value: unknown): CandidateBuildComparisonRequest {
  try {
    const input: unknown = JSON.parse(encodeLocalRecord(value).toString('utf8'));
    exactFields(input, ['schema', 'before', 'after']);
    if (input.schema !== 'payload.local-candidate-build-comparison-request.v1') throw new Error('Unsupported schema.');
    for (const field of ['before', 'after'] as const) {
      const reference = input[field];
      exactFields(reference, ['buildId', 'expectedDigest']);
      requireIdentifier(reference.buildId, 'buildId'); requireText(reference.buildId, 'buildId', 180);
      if (typeof reference.expectedDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(reference.expectedDigest)) throw new Error('Invalid full build digest.');
    }
    return input as unknown as CandidateBuildComparisonRequest;
  } catch {
    throw new CandidateBuildComparisonError('INVALID_COMPARISON_REQUEST', 'Provide only exact before/after build ids and full SHA-256 digests in the bounded comparison contract.');
  }
}

function inspect(store: LocalCandidateBuildStore, reference: BuildReference): LocalCandidateBuild {
  let build: LocalCandidateBuild | undefined;
  try { build = store.inspect(reference.buildId); }
  catch { throw new CandidateBuildComparisonError('BUILD_INSPECTION_FAILED', 'A selected build or its stored dependencies did not recompute.'); }
  if (!build) throw new CandidateBuildComparisonError('BUILD_NOT_FOUND', 'A selected build is not present in the operator-selected local store.');
  if (build.digest !== reference.expectedDigest) throw new CandidateBuildComparisonError('BUILD_DIGEST_MISMATCH', 'The inspected full build digest does not match the requested reference.');
  return build;
}

const references = (member: CandidateBuildMember): MemberReference => ({ normalization: member.normalization, candidate: member.candidate });
const identityKey = (member: CandidateBuildMember) => localJson([member.identity.sourceId, member.identity.sourceRecordId]);
const buildSummary = (build: LocalCandidateBuild) => ({ buildId: build.buildId, digest: build.digest, recordsRoot: build.recordsRoot,
  knownThrough: build.knownThrough, builtAt: build.builtAt, recordCount: build.recordCount });
const digest = (value: unknown) => localRecordDigest(value, MAX_CANDIDATE_COMPARISON_BYTES);

/**
 * Read-only diagnostic over two fully reopened local candidate builds. No live
 * policy grant, mutation, release, semantic diff, or execution timestamp is made.
 */
export function compareLocalCandidateBuilds(value: unknown, root = '.payload/evidence') {
  const request = parseCandidateBuildComparisonRequest(value);
  const store = new LocalCandidateBuildStore(root);
  const before = inspect(store, request.before);
  const after = inspect(store, request.after);
  if (before.definitionDigest !== after.definitionDigest ||
      localJson(before.request.manifest.definition) !== localJson(after.request.manifest.definition) ||
      before.request.contractDigest !== after.request.contractDigest || before.request.manifest.purpose !== after.request.manifest.purpose) {
    throw new CandidateBuildComparisonError('INCOMPATIBLE_BUILDS', 'The comparison requires one exact definition, build contract and purpose.');
  }
  if (parseISOInstant(before.knownThrough, 'before cutoff') > parseISOInstant(after.knownThrough, 'after cutoff') ||
      parseISOInstant(before.builtAt, 'before build time') > parseISOInstant(after.builtAt, 'after build time')) {
    throw new CandidateBuildComparisonError('REVERSED_BUILD_ORDER', 'Before must not follow after in either build time or knowledge cutoff.');
  }
  const prior = new Map(before.members.map((member) => [identityKey(member), member]));
  const next = new Map(after.members.map((member) => [identityKey(member), member]));
  const keys = [...new Set([...prior.keys(), ...next.keys()])].sort();
  const entries: CandidateComparisonEntry[] = keys.map((key) => {
    const oldMember = prior.get(key);
    const newMember = next.get(key);
    const oldReference = oldMember ? references(oldMember) : null;
    const newReference = newMember ? references(newMember) : null;
    const kind = !oldReference ? 'ADDED' : !newReference ? 'REMOVED' :
      localJson(oldReference) === localJson(newReference) ? 'UNCHANGED' : 'REFERENCE_CHANGED';
    return { kind, identity: (oldMember ?? newMember)!.identity, before: oldReference, after: newReference };
  });
  const count = (kind: CandidateComparisonEntry['kind']) => entries.filter((entry) => entry.kind === kind).length;
  const summary = { beforeCount: before.recordCount, afterCount: after.recordCount,
    added: count('ADDED'), removed: count('REMOVED'), referenceChanged: count('REFERENCE_CHANGED'), unchanged: count('UNCHANGED'),
    total: entries.length, recordsRootChanged: before.recordsRoot !== after.recordsRoot, buildDigestChanged: before.digest !== after.digest };
  if (entries.length > CANDIDATE_BUILD_COMPARISON_CONTRACT.maximumEntries ||
      summary.beforeCount !== summary.removed + summary.referenceChanged + summary.unchanged ||
      summary.afterCount !== summary.added + summary.referenceChanged + summary.unchanged) {
    throw new CandidateBuildComparisonError('BUILD_INSPECTION_FAILED', 'The compared membership does not conserve the inspected build counts.');
  }
  const payload = {
    schema: 'payload.local-candidate-build-comparison.v1' as const, mode: 'LOCAL_DEVELOPMENT' as const,
    basis: 'REFERENCE_COMPARISON' as const, temporalBasis: 'INPUT_BUILD_TIMES_ONLY' as const,
    request, contractDigest: digest(CANDIDATE_BUILD_COMPARISON_CONTRACT), definitionDigest: before.definitionDigest,
    buildContractDigest: before.request.contractDigest, purpose: before.request.manifest.purpose,
    before: buildSummary(before), after: buildSummary(after), entries, summary,
    nonclaims: { canonicalAdmission: false, canonicalStateMutated: false, identityResolved: false,
      semanticMeaningInferred: false, fieldChangeInferred: false, correctionInferred: false, retractionInferred: false,
      completenessClaimed: false, sourceTruthClaimed: false, independentlyVerified: false, currentSourceUseGranted: false,
      customerDeliveryClaimed: false, releaseActivated: false, rawBytesIncluded: false, candidateFieldsIncluded: false,
      sourceIdentifiersIncluded: true, comparisonPersisted: false },
  };
  return structuredClone({ ...payload, digest: digest(payload) });
}
