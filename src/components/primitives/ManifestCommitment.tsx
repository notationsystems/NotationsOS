import { CopyButton } from './CopyButton';
import { shortHash } from '@/lib/format';

/** A hash or identifier: monospaced, shortened for the eye, full in title, copyable. */
export function Digest({ label, value, full = false, copy = true }: { label?: string; value: string | undefined; full?: boolean; copy?: boolean }) {
  if (!value) return <span style={{ color: 'var(--text-muted)' }}>Not recorded</span>;
  return (
    <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
      {label && <span className="label-sm">{label}</span>}
      <span className="hash" title={value}>{full ? value : shortHash(value)}</span>
      {copy && <CopyButton value={value} />}
    </span>
  );
}

export function ManifestCommitment({ commitment, manifestId, evidenceRoot, registerDigest, rulingId }: { commitment?: string; manifestId?: string; evidenceRoot?: string; registerDigest?: string; rulingId: string }) {
  return (
    <dl className="kv">
      <dt>Ruling id</dt>
      <dd><Digest value={rulingId} full /></dd>
      <dt>Manifest id</dt>
      <dd><Digest value={manifestId} full /></dd>
      <dt>Manifest commitment</dt>
      <dd><Digest value={commitment} /></dd>
      <dt>Evidence root</dt>
      <dd><Digest value={evidenceRoot} /></dd>
      <dt>Register digest</dt>
      <dd><Digest value={registerDigest} /></dd>
    </dl>
  );
}
