'use client';

import { useState } from 'react';
import type { BrowserDrafts } from './drafts';
import { describeCommand, textHasContent } from './drafts';

/**
 * A version conflict or a stale draft is explained, and the work is kept
 * inspectable and copyable before any deliberate reload. Nothing here
 * reloads, saves or discards on its own.
 */
export function ConflictPanel({ drafts, savedVersion, reason, onKeep, onReloadDiscard }: { drafts: BrowserDrafts; savedVersion: number; reason: 'VERSION_CONFLICT' | 'STALE_DRAFTS'; onKeep: () => void; onReloadDiscard: () => void }) {
  const [copied, setCopied] = useState<'' | 'copied' | 'select'>('');
  const json = JSON.stringify(drafts, null, 2);
  async function copy() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(json); setCopied('copied'); return; }
    } catch { /* Fall through to the manual path. */ }
    setCopied('select');
  }
  const edits = Object.keys(drafts.text.edits).length;
  return (
    <section role="region" aria-labelledby="conflict-title" className="surface p-3 flex flex-col gap-2" data-testid="conflict-panel" data-reason={reason}>
      <h2 id="conflict-title" className="font-semibold" style={{ color: 'var(--status-conditional)' }}>{reason === 'VERSION_CONFLICT' ? 'Another save changed this workspace' : 'Drafts from an earlier saved version'}</h2>
      <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        {reason === 'VERSION_CONFLICT'
          ? <>Another writer saved this workspace after version <span className="mono">{drafts.baseVersion}</span>, the version your pending commands were validated against, so the kernel refused to save them on that base. Nothing you typed or previewed was lost, and nothing was saved. Reloading shows the current saved version.</>
          : <>These drafts were made against saved version <span className="mono">{drafts.baseVersion}</span>; the workspace is now at version <span className="mono">{savedVersion}</span>. They were not applied.</>}
        {' '}Inspect or copy them below, then reload deliberately. After a reload you can re-enter what still applies.
      </p>
      <details className="text-[13px]" open>
        <summary className="cursor-pointer">Pending commands ({drafts.pending.length}) and unapplied text ({textHasContent(drafts.text) ? `${edits} edited ${edits === 1 ? 'notation' : 'notations'}${drafts.text.createTitle || drafts.text.createBody ? ', a new notation' : ''}${drafts.text.relationFrom || drafts.text.relationTo || drafts.text.relationLabel ? ', a relation' : ''}` : 'none'})</summary>
        <ol className="mt-2 pl-5 flex flex-col gap-1" data-testid="conflict-commands">
          {drafts.pending.map((command) => <li key={command.commandId} className="break-words">{describeCommand(command)}</li>)}
        </ol>
      </details>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className="btn btn-sm" onClick={() => void copy()}>Copy drafts as JSON</button>
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }} role="status">{copied === 'copied' ? 'Copied to the clipboard.' : copied === 'select' ? 'Clipboard unavailable; select the JSON below.' : ''}</span>
      </div>
      <details className="text-[12px]" open={copied === 'select'}>
        <summary className="cursor-pointer">Draft JSON</summary>
        <textarea readOnly aria-label="Draft JSON" className="surface-inset p-2 w-full mono text-[11px] mt-1" rows={8} value={json} onFocus={(event) => event.currentTarget.select()} />
      </details>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-primary" onClick={onKeep}>Keep working with these drafts</button>
        <button type="button" className="btn btn-sm" onClick={onReloadDiscard}>Reload saved state and discard drafts</button>
      </div>
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Until you reload, further previews will fail on the old base. Keeping the drafts keeps them copyable.</p>
    </section>
  );
}
