import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as releases } from './releases/route';
import { GET as release } from './releases/[releaseId]/route';
import { GET as records } from './releases/[releaseId]/records/route';
import { GET as asOf } from './releases/[releaseId]/as-of/route';
import { GET as retractions } from './retractions/route';
import { GET as ruling } from './rulings/[rulingId]/route';
import { GET as releaseManifest } from './releases/[releaseId]/manifest/route';

const req = (url: string) => new NextRequest(`http://127.0.0.1:3111${url}`);
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

describe('/api/v1 route handlers (fixture feed)', () => {
  it('marks every response as fixture-only in the headers and body', async () => {
    const res = await releases(req('/api/v1/releases'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Payload-Fixture-Only')).toBe('true');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body.fixture_only).toBe(true);
    expect(body.releases.length).toBe(3);
  });

  /**
   * The ?corpus= filter is documented on /api and was inert in a real build while
   * the route declared force-static: Next prerendered it with empty search params.
   */
  it('filters the release list by corpus', async () => {
    const all = await (await releases(req('/api/v1/releases'))).json();
    const corpusId = all.releases[0].corpusId ?? all.releases[0].corpus_id;
    expect(corpusId, 'a release payload should name its corpus').toBeTruthy();
    const filtered = await (await releases(req(`/api/v1/releases?corpus=${encodeURIComponent(corpusId)}`))).json();
    expect(filtered.releases.length).toBeGreaterThan(0);
    for (const r of filtered.releases) expect(r.corpusId ?? r.corpus_id).toBe(corpusId);
    const none = await (await releases(req('/api/v1/releases?corpus=notation://corpus/does-not-exist'))).json();
    expect(none.releases).toEqual([]);
  });

  it('serves a release with its rights schedule', async () => {
    const res = await release(req('/api/v1/releases/REL-CAR-2026.09.01'), params({ releaseId: 'REL-CAR-2026.09.01' }));
    const body = await res.json();
    expect(body.sources.find((s: { sourceId: string }) => s.sourceId === 'harbourline-deals').redistribution).toBe('internal_only');
    expect(body.build.deterministic).toBe(true);
  });

  it('serves the certified release manifest with its commitment', async () => {
    const res = await releaseManifest(req('/api/v1/releases/REL-CAR-2026.08.25/manifest'), params({ releaseId: 'REL-CAR-2026.08.25' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.manifest.releaseId).toBe('REL-CAR-2026.08.25');
    expect(body.manifest.retractionsApplied).toEqual(['RET-0001']);
    expect(body.manifestCommitment).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses an unknown release with a remedy', async () => {
    const res = await release(req('/api/v1/releases/nope'), params({ releaseId: 'nope' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('release_not_found');
    expect(body.remedy).toMatch(/List releases/);
  });

  it('filters records and applies the projection', async () => {
    const res = await records(req('/api/v1/releases/REL-CAR-2026.09.01/records?subject=LOT-7C-104&projection=PUBLIC_RULING'), params({ releaseId: 'REL-CAR-2026.09.01' }));
    const body = await res.json();
    expect(body.projection).toBe('PUBLIC_RULING');
    expect(body.count).toBe(0);
  });

  it('as-of validates its query and returns a refusal shape on absence', async () => {
    const bad = await asOf(req('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=LOT-7C-104'), params({ releaseId: 'REL-CAR-2026.09.01' }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('query_incomplete');
    const notIso = await asOf(req('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=LOT-7C-104&predicate=quantity.gross&validAt=yesterday&knownAt=now'), params({ releaseId: 'REL-CAR-2026.09.01' }));
    expect(notIso.status).toBe(400);
    const ok = await asOf(req('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=LOT-7C-104&predicate=quantity.gross&validAt=2026-08-28T14:00:00Z&knownAt=2026-09-01T12:00:00Z'), params({ releaseId: 'REL-CAR-2026.09.01' }));
    const body = await ok.json();
    expect(body.answer.recordId).toBe('REC-0302');
    expect(body.answer.uncertainty.low).toBe(19.94);
  });

  it('serves the retraction feed since a cursor', async () => {
    const res = await retractions(req('/api/v1/retractions?since=2026-08-26T00:00:00Z'));
    const body = await res.json();
    expect(body.retractions.map((r: { retractionId: string }) => r.retractionId)).toEqual(['RET-0002']);
  });

  it('serves the application layer with 403 when the projection cannot see the ruling', async () => {
    const res = await ruling(req('/api/v1/rulings/RUL-7C104-r2?projection=PUBLIC_RULING'), params({ rulingId: 'RUL-7C104-r2' }));
    expect(res.status).toBe(403);
    const ok = await ruling(req('/api/v1/rulings/RUL-5B221-r2?projection=PUBLIC_RULING'), params({ rulingId: 'RUL-5B221-r2' }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).ruling.status).toBe('ADMITTED_WITH_CONDITIONS');
  });
});
