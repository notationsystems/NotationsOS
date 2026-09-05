/**
 * Read side of the candidate-production rail for the screens. The only
 * implementation returns the committed demonstration, which
 * src/fixtures/production/demo.contract.test.ts reproduces through the real
 * rails. A local implementation would reinspect .payload/evidence through
 * the same stores; it is not here, and this module says so.
 */
import demo from '@/fixtures/production/demo.json';
import type { CommittedSource, ProductionDemo } from '@/domain/production';

export interface ProductionSource {
  origin: { kind: 'FIXTURE'; label: string };
  demo(): Promise<ProductionDemo>;
}

export function getProductionSource(): ProductionSource {
  return {
    origin: { kind: 'FIXTURE', label: 'Committed demonstration, reproduced through the local rails from examples/ at the stated instants' },
    async demo() { return demo as unknown as ProductionDemo; },
  };
}

/**
 * Committed source bytes for the demonstration's evidence, matched by content
 * digest so the screen can show evidence beside the record it became. Server
 * only (the page reads it during rendering); the browser receives text with
 * the digest it was matched on. An evidence record without a committed file
 * of the same digest is reported unavailable by its absence.
 */
export async function readCommittedSources(demoData: ProductionDemo, repoRoot = process.cwd()): Promise<CommittedSource[]> {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const { resolve } = await import('node:path');
  const out: CommittedSource[] = [];
  for (const input of demoData.inputs) {
    let bytes: Buffer;
    try { bytes = await readFile(resolve(repoRoot, input.path)); } catch { continue; }
    const contentDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    for (const a of demoData.acquisitions) {
      if (a.capture.evidence.contentDigest === contentDigest) out.push({ evidenceId: a.capture.evidence.evidenceId, path: input.path, text: bytes.toString('utf8'), byteLength: bytes.byteLength, contentDigest });
    }
  }
  return out;
}
