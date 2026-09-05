import type { Metadata } from 'next';
import { NotationWorkspace } from '@/components/notations/NotationWorkspace';
import { EvidenceReferencePanel } from '@/components/notations/EvidenceReferencePanel';
import { resolveReferences } from '@/domain/evidenceReference';
import { FIXTURE_EVIDENCE_REFERENCES, FIXTURE_NOTATION_ID, FIXTURE_REFERENCE_WORLD, FIXTURE_RESOLVED_AT } from '@/fixtures/notations/evidenceReferences';

export const metadata: Metadata = { title: 'Notations · Local state workspace' };

// Local data is fetched by the browser through the guarded HTTP boundary, never during server rendering.
// The evidence-reference panel is a server-rendered fixture over committed data; it touches no local state.
export default function NotationsPage() {
  const references = resolveReferences(FIXTURE_EVIDENCE_REFERENCES, FIXTURE_REFERENCE_WORLD, FIXTURE_RESOLVED_AT);
  return (
    <>
      <NotationWorkspace />
      <EvidenceReferencePanel references={references} fixture={{ notationId: FIXTURE_NOTATION_ID, resolvedAt: FIXTURE_RESOLVED_AT }} />
    </>
  );
}
