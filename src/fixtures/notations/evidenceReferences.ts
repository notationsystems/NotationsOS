/**
 * FIXTURE: evidence references for the notation workspace's reference panel.
 * The notation backend has no attach command yet, so these are not stored
 * anywhere and belong to no real notation; they exist to show the contract
 * and one example of every resolution state against the committed
 * demonstration. Digests that are meant to resolve are taken from the
 * committed production demonstration and corpus, so they stay exact when
 * those are re-stamped; the CHANGED example pins a digest on purpose.
 */
import demoJson from '@/fixtures/production/demo.json';
import { CARAVAN_CORPUS, CARAVAN_RELEASES } from '@/fixtures/caravan/release';
import type { ProductionDemo } from '@/domain/production';
import type { NotationEvidenceReference, ReferenceWorld } from '@/domain/evidenceReference';

export const FIXTURE_NOTATION_ID = 'fixture-notation-caravan-lot-5b-221';
export const FIXTURE_RESOLVED_AT = '2026-09-01T12:00:00Z';

const demo = demoJson as unknown as ProductionDemo;
const build = demo.builds[0];
const normalized = demo.normalizations.find((n) => n.state === 'NORMALIZED')!;
const current = CARAVAN_RELEASES.at(-1)!;

export const FIXTURE_REFERENCE_WORLD: ReferenceWorld = { demo, corpus: CARAVAN_CORPUS };

export const FIXTURE_EVIDENCE_REFERENCES: readonly NotationEvidenceReference[] = [
  {
    schema: 'payload.notation-evidence-reference.v0', referenceId: 'ref-fixture-001', notationId: FIXTURE_NOTATION_ID,
    kind: 'CORPUS_RECORD', targetId: 'REC-0204', digest: current.releaseDigest,
    context: { domain: 'CARAVAN', sourceId: 'terminal-weighbridge', releaseId: current.releaseId, buildId: current.build.buildId },
    temporal: { validFrom: '2026-08-17T15:20:00Z', validTo: null, knownAt: '2026-08-25T14:00:00Z' },
    interpretation: { text: 'The weighbridge figure supersedes the draft-survey estimate; the 0.12 t difference is within the stated accuracy of the earlier estimate being absent, not evidence of a shortfall.', authoredAt: '2026-09-01T10:00:00Z' },
  },
  {
    schema: 'payload.notation-evidence-reference.v0', referenceId: 'ref-fixture-002', notationId: FIXTURE_NOTATION_ID,
    kind: 'CANDIDATE_BUILD', targetId: build.buildId, digest: build.digest,
    context: { domain: 'CARAVAN', buildId: build.buildId },
    temporal: { knownThrough: build.knownThrough, builtAt: build.builtAt },
    interpretation: { text: 'One Carrier candidate under the cutoff. Unadmitted; cited here for the carrier name only.', authoredAt: '2026-09-01T10:05:00Z' },
  },
  {
    schema: 'payload.notation-evidence-reference.v0', referenceId: 'ref-fixture-003', notationId: FIXTURE_NOTATION_ID,
    kind: 'CANDIDATE', targetId: normalized.candidate!.candidateId, digest: `sha256:${'0'.repeat(64)}`,
    context: { domain: 'CARAVAN', sourceId: normalized.candidate!.identity.sourceId, normalizationId: normalized.request.manifest.normalizationId },
    temporal: { normalizedAt: normalized.normalizedAt, knownAt: normalized.candidate!.knownAt },
    interpretation: { text: 'Referenced before the normalization was re-run; the digest on this reference is the earlier one on purpose, to show a CHANGED resolution.', authoredAt: '2026-09-01T10:10:00Z' },
  },
  {
    schema: 'payload.notation-evidence-reference.v0', referenceId: 'ref-fixture-004', notationId: FIXTURE_NOTATION_ID,
    kind: 'ACQUISITION', targetId: 'demo-caravan-carrier-999', digest: `sha256:${'1'.repeat(64)}`,
    context: { domain: 'CARAVAN', acquisitionId: 'demo-caravan-carrier-999' },
    temporal: {},
    interpretation: { text: 'A reference to an acquisition that does not exist where it points, to show an UNAVAILABLE resolution.', authoredAt: '2026-09-01T10:15:00Z' },
  },
  {
    schema: 'payload.notation-evidence-reference.v0', referenceId: 'ref-fixture-005', notationId: FIXTURE_NOTATION_ID,
    kind: 'RELEASE', targetId: current.releaseId, digest: '',
    context: { domain: 'CARAVAN', releaseId: current.releaseId },
    temporal: { knownAt: current.knownAt },
    interpretation: { text: 'A reference that names a release but pins no digest; it cannot resolve exactly.', authoredAt: '2026-09-01T10:20:00Z' },
  },
];
