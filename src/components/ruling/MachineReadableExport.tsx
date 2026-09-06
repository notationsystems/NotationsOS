
import { useState } from 'react';
import type { ClaimCaseBundle, Ruling } from '@/domain/types';
import { buildResultManifest } from '@/fixtures/manifest';
import { CopyButton } from '@/components/primitives/CopyButton';

/**
 * The machine-readable projection of the SAME ruling the page renders: the
 * notations.result-manifest.v1 sidecar and the projected ruling object.
 * What is exported is what the viewer may see — the projection is applied
 * before export, so a public export never carries private detail.
 */
export function MachineReadableExport({ bundle, ruling, projected }: { bundle: ClaimCaseBundle; ruling: Ruling; projected?: { viewerLabel: string; withheldEvidence: number } }) {
  const [tab, setTab] = useState<'manifest' | 'ruling'>('manifest');
  const manifest = buildResultManifest(bundle, ruling);
  const text = tab === 'manifest' ? JSON.stringify(manifest, null, 2) : JSON.stringify(ruling, null, 2);
  return (
    <div className="flex flex-col gap-2" data-testid="machine-readable-export">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div role="tablist" aria-label="Export format" className="flex gap-1">
          <button role="tab" type="button" aria-selected={tab === 'manifest'} className="btn btn-sm" onClick={() => setTab('manifest')} style={tab === 'manifest' ? { borderColor: 'var(--border-accent)', color: 'var(--accent-strong)' } : undefined}>Result manifest (v1)</button>
          <button role="tab" type="button" aria-selected={tab === 'ruling'} className="btn btn-sm" onClick={() => setTab('ruling')} style={tab === 'ruling' ? { borderColor: 'var(--border-accent)', color: 'var(--accent-strong)' } : undefined}>Ruling object</button>
        </div>
        <CopyButton value={text} label="Copy JSON" />
      </div>
      <pre role="tabpanel" tabIndex={0} className="surface-inset p-3 m-0 overflow-x-auto text-[11.5px] mono leading-relaxed" style={{ color: 'var(--text-secondary)', maxHeight: 420 }}>{text}</pre>
      <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
        Schema <span className="id">notations.result-manifest.v1</span> (control plane contract).{' '}
        {projected && projected.withheldEvidence > 0
          ? `Projected at ${projected.viewerLabel}: ${projected.withheldEvidence} evidence identit${projected.withheldEvidence === 1 ? 'y is' : 'ies are'} withheld from this export. The committed manifest was computed over the full evidence set; the manifest commitment identifies it and will not match a hash of this projected export.`
          : 'The manifest commitment shown above is the sha256 of this manifest in canonical JSON.'}
      </p>
    </div>
  );
}
