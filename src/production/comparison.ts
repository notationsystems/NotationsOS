import {
  CandidateBuildComparisonError, compareLocalCandidateBuilds, parseCandidateBuildComparisonRequest,
  type CandidateBuildComparisonRequest,
} from '../data-os/candidate-build-comparison';
import { ProductionError } from './errors';

export const MAX_PRODUCTION_COMPARISON_BODY_BYTES = 64 * 1024;

const failures = {
  INVALID_COMPARISON_REQUEST: { status: 400, message: 'Provide only exact before/after build ids and full SHA-256 digests in the versioned comparison request.' },
  BUILD_NOT_FOUND: { status: 404, message: 'A selected candidate build is not retained in the local store.' },
  BUILD_DIGEST_MISMATCH: { status: 409, message: 'A selected candidate build does not match its expected full digest.' },
  BUILD_INSPECTION_FAILED: { status: 503, message: 'A selected candidate build or its evidence dependencies could not be verified. Existing files were preserved.' },
  INCOMPATIBLE_BUILDS: { status: 409, message: 'Both builds must use the same definition, build contract and purpose.' },
  REVERSED_BUILD_ORDER: { status: 409, message: 'Before must not follow after in build time or knowledge cutoff.' },
} as const;

function failure(error: unknown): ProductionError {
  const code = error instanceof CandidateBuildComparisonError && Object.hasOwn(failures, error.code)
    ? error.code : 'BUILD_INSPECTION_FAILED';
  const detail = failures[code];
  return new ProductionError(code, detail.message, detail.status);
}

/** Reuse the CLI contract; transport does not supply build bodies, state or storage paths. */
export function parseProductionComparisonRequest(input: unknown): CandidateBuildComparisonRequest {
  try { return parseCandidateBuildComparisonRequest(input); }
  catch (error) { throw failure(error); }
}

/** Read-only worker operation. No reservation, production run, comparison artifact or current rights grant. */
export function compareProductionCandidateBuilds(input: unknown, root: string) {
  const request = parseProductionComparisonRequest(input);
  try {
    return { schema: 'payload.production-candidate-comparison.v1' as const,
      mode: 'LOCAL_DEVELOPMENT' as const, inspection: 'HISTORICAL' as const,
      integrity: 'RECOMPUTED_LOCAL' as const, comparison: compareLocalCandidateBuilds(request, root),
      rawBytesIncluded: false as const, candidateFieldsIncluded: false as const,
      sourceIdentifiersIncluded: true as const, comparisonPersisted: false as const,
      canonicalAdmission: false as const, currentRightsGrant: false as const };
  } catch (error) { throw failure(error); }
}

export type ProductionCandidateComparison = ReturnType<typeof compareProductionCandidateBuilds>;
