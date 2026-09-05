// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DRAFT_STORAGE_KEY, clearDrafts, describeCommand, draftsHaveContent, emptyText, readDrafts, textHasContent, writeDrafts, type BrowserDrafts } from './drafts';

const drafts: BrowserDrafts = {
  schema: 'payload.notation-browser-drafts.v1', baseVersion: 3, savedDigest: 'sha256:abc', selectedId: 'n1', storedAt: '2026-09-05T00:00:00.000Z',
  pending: [{ commandId: 'c1', kind: 'CREATE_NOTATION', notation: { id: 'n1', title: 'Carrier note', body: '' } }, { commandId: 'c2', kind: 'UNDO' }],
  text: { ...emptyText(), createTitle: 'Next' },
};

afterEach(() => sessionStorage.clear());

describe('browser drafts', () => {
  it('round-trips through sessionStorage and clears', () => {
    expect(readDrafts()).toBeNull();
    writeDrafts(drafts);
    expect(JSON.parse(sessionStorage.getItem(DRAFT_STORAGE_KEY)!).schema).toBe('payload.notation-browser-drafts.v1');
    expect(readDrafts()).toEqual(drafts);
    clearDrafts();
    expect(readDrafts()).toBeNull();
  });

  it('rejects malformed or foreign storage content instead of trusting it', () => {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, '{not json');
    expect(readDrafts()).toBeNull();
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ schema: 'other', pending: [] }));
    expect(readDrafts()).toBeNull();
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ schema: 'payload.notation-browser-drafts.v1', baseVersion: 1, pending: [], text: {} }));
    expect(readDrafts()).toMatchObject({ baseVersion: 1, pending: [], text: emptyText(), selectedId: '', savedDigest: null });
  });

  it('knows when there is anything to keep and describes commands for inspection', () => {
    expect(textHasContent(emptyText())).toBe(false);
    expect(draftsHaveContent({ ...drafts, pending: [], text: emptyText() })).toBe(false);
    expect(draftsHaveContent({ ...drafts, pending: [] })).toBe(true);
    expect(drafts.pending.map(describeCommand)).toEqual(['Create notation "Carrier note" (n1)', 'Undo']);
    expect(describeCommand({ commandId: 'c3', kind: 'CREATE_RELATION', relation: { id: 'r1', from: 'a', to: 'b', label: 'mentions' } })).toBe('Relate a → mentions → b (r1)');
  });
});
