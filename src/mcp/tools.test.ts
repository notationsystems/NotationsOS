import { describe, expect, it } from 'vitest';
import { MCP_TOOLS, runMcpTool } from './tools';

describe('MCP tools (a distribution mechanism over the same feed)', () => {
  it('every tool has a name, a description and a schema', () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual(['list_releases', 'get_release', 'get_release_manifest', 'list_records', 'query_as_of', 'list_retractions', 'get_ruling', 'get_ruling_manifest']);
    for (const t of MCP_TOOLS) expect(t.description.length).toBeGreaterThan(20);
  });

  it('query_as_of returns the same reconstruction as the HTTP feed, and a refusal is a successful return', async () => {
    const a = (await runMcpTool('query_as_of', { releaseId: 'REL-CAR-2026.09.01', subject: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-08-20T00:00:00Z' })) as { fixture_only: boolean; answer: { value: number } };
    expect(a.fixture_only).toBe(true);
    expect(a.answer.value).toBe(40);
    const r = (await runMcpTool('query_as_of', { releaseId: 'REL-CAR-2026.09.01', subject: 'LOT-7C-104', predicate: 'condition.moisture', validAt: '2026-08-28T14:00:00Z', knownAt: '2026-09-01T12:00:00Z' })) as { answer: null; refusal: { code: string; remedy: string } };
    expect(r.answer).toBeNull();
    expect(r.refusal.code).toBe('NO_IDENTITY_LINK');
  });

  it('malformed arguments are tool errors; an unknown release is a refusal with a remedy', async () => {
    await expect(runMcpTool('query_as_of', { releaseId: 'x', subject: 's', predicate: 'p', validAt: 'yesterday', knownAt: 'now' })).rejects.toThrow(/ISO 8601/);
    const r = (await runMcpTool('get_release', { releaseId: 'nope' })) as { error: string; remedy: string };
    expect(r.error).toBe('release_not_found');
    expect(r.remedy).toBe('Call list_releases.');
  });

  it('list_retractions since a cursor and get_ruling respect projection', async () => {
    const t = (await runMcpTool('list_retractions', { since: '2026-08-26T00:00:00Z' })) as { retractions: Array<{ retractionId: string }> };
    expect(t.retractions.map((x) => x.retractionId)).toEqual(['RET-0002']);
    const pub = (await runMcpTool('get_ruling', { rulingId: 'RUL-7C104-r2', projection: 'PUBLIC_RULING' })) as { error?: string };
    expect(pub.error).toBe('not_visible');
  });
});
