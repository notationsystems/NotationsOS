import { vi } from 'vitest';
import { GET } from './route';
import { getCoordinationSnapshot, localCoordinationEnabled } from '@/coordination/store';
import { createSeed, DEMO_SCOPE, RELEASE_CONTEXTS } from '@/coordination/seed';
import { connectionsFor } from '@/coordination/ledger';

vi.mock('@/coordination/store', () => ({ getCoordinationSnapshot: vi.fn(), localCoordinationEnabled: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(localCoordinationEnabled).mockReturnValue(true);
  const state = createSeed();
  vi.mocked(getCoordinationSnapshot).mockResolvedValue({ ...state, scope: DEMO_SCOPE, fixture_only: true, mode: 'LOCAL_SANDBOX', persistence: 'LOCAL_FILE', canWrite: true, releaseContexts: RELEASE_CONTEXTS, connections: connectionsFor(state, DEMO_SCOPE) });
});

it('serves a pending participant inbox with explicit scope and resume position', async () => {
  const response = await GET(new Request('http://localhost:3000/api/coordination/inbox?participant=agent.release', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } }));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ schema: 'payload.coordination-inbox.v1', fixture_only: true, scope: DEMO_SCOPE, participantId: 'agent.release', messages: [{ id: 'MSG-00003' }], nextSequence: 3, highWaterSequence: 3, hasMore: false });
});

it('applies the same local origin policy before reading messages', async () => {
  const response = await GET(new Request('http://localhost:3000/api/coordination/inbox?participant=agent.release', { headers: { origin: 'https://outside.example' } }));
  expect(response.status).toBe(403);
  expect(getCoordinationSnapshot).not.toHaveBeenCalled();
});

it('rejects unknown participants, cursor resets, and malformed query fields explicitly', async () => {
  for (const [query, status, code] of [
    ['participant=missing', 404, 'UNKNOWN_PARTICIPANT'],
    ['participant=agent.release&after=900', 409, 'CURSOR_AHEAD'],
    ['participant=agent.release&participant=agent.identity', 400, 'INVALID_INBOX_QUERY'],
    ['participant=agent.release&limit=0', 400, 'INVALID_INBOX_QUERY'],
    ['participant=agent.release&scope=other', 400, 'INVALID_INBOX_QUERY'],
  ] as const) {
    const response = await GET(new Request(`http://localhost:3000/api/coordination/inbox?${query}`));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: code });
  }
});
