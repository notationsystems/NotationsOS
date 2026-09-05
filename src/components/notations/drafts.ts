/**
 * Browser drafts for the notation workspace: pending, kernel-validated
 * commands and unapplied form text, kept in this tab's sessionStorage so
 * internal navigation, browser back and reload do not lose them. A draft is
 * pinned to the saved version and digest it was made against; restored
 * pending commands are re-validated by the kernel, never trusted, and a
 * draft from another saved version is set aside as stale rather than
 * applied. Nothing here is state authority and nothing here is saved.
 */
import type { KernelCommand, Notation } from '@/state-kernel/types';

export type Edit = Pick<Notation, 'title' | 'body'>;

export interface DraftText {
  createTitle: string;
  createBody: string;
  relationFrom: string;
  relationTo: string;
  relationLabel: string;
  edits: Record<string, Edit>;
}

export interface BrowserDrafts {
  schema: 'payload.notation-browser-drafts.v1';
  baseVersion: number;
  savedDigest: string | null;
  pending: KernelCommand[];
  text: DraftText;
  selectedId: string;
  storedAt: string;
}

export const DRAFT_STORAGE_KEY = 'payload.notation-workspace.drafts';

export const emptyText = (): DraftText => ({ createTitle: '', createBody: '', relationFrom: '', relationTo: '', relationLabel: '', edits: {} });

export function textHasContent(text: DraftText): boolean {
  return Boolean(text.createTitle || text.createBody || text.relationFrom || text.relationTo || text.relationLabel || Object.keys(text.edits).length);
}

export function draftsHaveContent(drafts: BrowserDrafts): boolean {
  return drafts.pending.length > 0 || textHasContent(drafts.text);
}

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

export function readDrafts(): BrowserDrafts | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<BrowserDrafts>;
    if (value?.schema !== 'payload.notation-browser-drafts.v1' || typeof value.baseVersion !== 'number' || !Array.isArray(value.pending) || !value.text) return null;
    return { ...value, text: { ...emptyText(), ...value.text }, selectedId: value.selectedId ?? '', savedDigest: value.savedDigest ?? null, storedAt: value.storedAt ?? '' } as BrowserDrafts;
  } catch { return null; }
}

export function writeDrafts(drafts: BrowserDrafts): void {
  const store = storage();
  if (!store) return;
  try { store.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts)); } catch { /* Storage may be unavailable; drafts then live only in memory. */ }
}

export function clearDrafts(): void {
  const store = storage();
  if (!store) return;
  try { store.removeItem(DRAFT_STORAGE_KEY); } catch { /* Nothing to clear. */ }
}

/** A one-line description of a pending command for inspection lists. */
export function describeCommand(command: KernelCommand): string {
  switch (command.kind) {
    case 'CREATE_NOTATION': return `Create notation "${command.notation.title}" (${command.notation.id})`;
    case 'UPDATE_NOTATION': return `Update notation ${command.notationId}: "${command.title}"`;
    case 'CREATE_RELATION': return `Relate ${command.relation.from} → ${command.relation.label} → ${command.relation.to} (${command.relation.id})`;
    case 'UNDO': return 'Undo';
    case 'REDO': return 'Redo';
  }
}
