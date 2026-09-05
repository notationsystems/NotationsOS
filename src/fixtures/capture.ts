/**
 * The data-os capture binding of a fixture artifact: a BinaryEvidence record
 * and its StorageReceipt, exactly as captureEvidence would produce them over
 * the artifact's canonical bytes with an ALLOWED INGEST decision. Digests and
 * byte lengths are stamped by scripts/stamp-digests (node);
 * src/fixtures/capture.contract.test.ts reproduces every binding with the
 * data-os captureEvidence and verifyEvidenceCapture. This module is pure so
 * the browser bundle never imports node:crypto.
 */
import type { BinaryEvidence, StorageReceipt } from '@/data-os/contracts';
import type { EvidenceCapture } from '@/domain/corpus';
import { digestOf } from './digestLookup';

/** Mirror of data-os storageKeyFor: sha256/<first two hex>/<hex>. */
export function storageKeyOf(contentDigest: string): string {
  const hex = contentDigest.replace(/^sha256:/, '');
  return `sha256/${hex.slice(0, 2)}/${hex}`;
}

export const CAPTURE_META: Record<string, { mediaType: string; capturedAt: string; storedAt: string }> = {
  'EV-CERT-NIS-4377': { mediaType: 'application/pdf', capturedAt: '2026-08-05T08:30:00Z', storedAt: '2026-08-05T08:30:00Z' },
  'EV-CERT-NIS-4390': { mediaType: 'application/pdf', capturedAt: '2026-08-12T08:30:00Z', storedAt: '2026-08-12T08:30:00Z' },
  'EV-CERT-NIS-4402': { mediaType: 'application/pdf', capturedAt: '2026-08-16T12:00:00Z', storedAt: '2026-08-18T09:30:00Z' },
  'EV-CUSTODY-PCO-5102': { mediaType: 'application/json', capturedAt: '2026-08-17T17:00:00Z', storedAt: '2026-08-18T09:30:00Z' },
  'EV-BOL-BAL-77790': { mediaType: 'application/pdf', capturedAt: '2026-08-17T17:30:00Z', storedAt: '2026-08-18T09:30:00Z' },
  'EV-DRAFT-BAL-DS-118': { mediaType: 'application/pdf', capturedAt: '2026-08-17T16:30:00Z', storedAt: '2026-08-18T09:30:00Z' },
  'EV-WEIGHT-WB-2277': { mediaType: 'application/pdf', capturedAt: '2026-08-17T15:25:00Z', storedAt: '2026-08-25T14:00:00Z' },
  'EV-CERT-NIS-4418': { mediaType: 'application/pdf', capturedAt: '2026-08-25T15:40:00Z', storedAt: '2026-08-26T10:30:00Z' },
  'EV-WEIGHT-WB-2291': { mediaType: 'application/pdf', capturedAt: '2026-08-25T16:35:00Z', storedAt: '2026-08-26T10:30:00Z' },
  'EV-CONTRACT-HB-3310': { mediaType: 'application/pdf', capturedAt: '2026-08-24T12:00:00Z', storedAt: '2026-08-26T10:30:00Z' },
  'EV-BOL-BAL-77812': { mediaType: 'application/pdf', capturedAt: '2026-08-28T15:00:00Z', storedAt: '2026-08-28T16:00:00Z' },
  'EV-CUSTODY-MER-0931': { mediaType: 'text/csv', capturedAt: '2026-08-28T15:30:00Z', storedAt: '2026-08-29T08:50:00Z' },
  'EV-CERT-NIS-4436': { mediaType: 'application/pdf', capturedAt: '2026-09-01T09:40:00Z', storedAt: '2026-09-01T09:40:00Z' },
  'EV-CERT-NIS-4434': { mediaType: 'application/pdf', capturedAt: '2026-09-01T10:20:00Z', storedAt: '2026-09-01T10:20:00Z' },
};

/** The source each artifact was captured from. */
export const CAPTURE_SOURCE: Record<string, string> = {
  'EV-CERT-NIS-4377': 'northgate-lims', 'EV-CERT-NIS-4390': 'northgate-lims', 'EV-CERT-NIS-4402': 'northgate-lims', 'EV-CERT-NIS-4418': 'northgate-lims', 'EV-CERT-NIS-4436': 'northgate-lims', 'EV-CERT-NIS-4434': 'northgate-lims',
  'EV-CUSTODY-PCO-5102': 'port-custody-system', 'EV-BOL-BAL-77790': 'blue-anchor-docs', 'EV-DRAFT-BAL-DS-118': 'blue-anchor-docs', 'EV-BOL-BAL-77812': 'blue-anchor-docs',
  'EV-WEIGHT-WB-2277': 'terminal-weighbridge', 'EV-WEIGHT-WB-2291': 'port-weighbridge', 'EV-CONTRACT-HB-3310': 'harbourline-deals', 'EV-CUSTODY-MER-0931': 'meridian-yard-log',
};

export function captureFor(evidenceId: string, sourceId: string = CAPTURE_SOURCE[evidenceId]): EvidenceCapture {
  const meta = CAPTURE_META[evidenceId];
  const contentDigest = `sha256:${digestOf(`artifact:${evidenceId}`)}`;
  const storageKey = storageKeyOf(contentDigest);
  const byteLength = Number(digestOf(`bytes:${evidenceId}`)) || 0;
  const evidence: BinaryEvidence = {
    kind: 'BinaryEvidence',
    schema: 'notations.binary-evidence.v1',
    evidenceId,
    mediaType: meta?.mediaType ?? 'application/octet-stream',
    contentDigest,
    byteLength,
    storageKey,
    sourceId: `notation://source/payload-os-demo/${sourceId}`,
    capturedAt: meta?.capturedAt ?? '1970-01-01T00:00:00Z',
    sourceTruthClaimed: false,
  };
  const receipt: StorageReceipt = {
    kind: 'StorageReceipt',
    schema: 'notations.storage-receipt.v1',
    receiptId: `capture:${evidenceId}:receipt`,
    evidenceId,
    contentDigest,
    storageKey,
    storedAt: meta?.storedAt ?? evidence.capturedAt,
  };
  return { evidence, receipt, ingestDecisionId: `source-use:capture:${evidenceId}:ingest` };
}
