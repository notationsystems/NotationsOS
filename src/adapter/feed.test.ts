import { describe, expect, it } from 'vitest';
import { asOfPayload, recordsPayload, releaseManifestPayload, releasePayload, releasesPayload, retractionsPayload, rulingManifestPayload, rulingPayload } from './feed';

const CURRENT = 'REL-CAR-2026.09.01';

describe('feed payloads', () => {
  it('every payload is marked fixture_only and names the release it was served from', async () => {
    const rel = await releasePayload(CURRENT);
    expect(rel?.fixture_only).toBe(true);
    expect(rel?.release?.releaseId).toBe(CURRENT);
    expect(rel?.release?.buildId).toBe('build-caravan-sc-2026.09.01');
    const list = await releasesPayload();
    expect(list.fixture_only).toBe(true);
    expect(list.releases.map((r) => r.releaseId)).toEqual([CURRENT, 'REL-CAR-2026.08.25', 'REL-CAR-2026.08.11']);
  });

  it('records carry bounds, validity, both clocks, provenance, class and rights; withheld counts are counts only', async () => {
    const p = await recordsPayload(CURRENT, 'COUNTERPARTY_SHARED', { subjectId: 'LOT-5B-221', predicate: 'quantity.gross' });
    expect(p?.count).toBe(2);
    const rec = p!.records.find((r) => r.recordId === 'REC-0204')!;
    expect(rec.uncertainty).toEqual({ low: 40.08, high: 40.16, semantics: 'Weighbridge stated accuracy ±0.040 t' });
    expect(rec.validity).toEqual({ validFrom: '2026-08-17T15:20:00Z', validTo: null });
    expect(rec.knownAt).toBe('2026-08-25T14:00:00Z');
    expect(rec.provenance.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.evidenceClass).toEqual({ claimStrength: 'reported', productionClass: 'measured', interest: 'disinterested' });
    expect(rec.supersedesRecordId).toBe('REC-0203');
    const all = await recordsPayload(CURRENT, 'COUNTERPARTY_SHARED');
    expect(all?.withheld.byRights).toBe(1);
    expect(JSON.stringify(all)).not.toContain('harbourline-deals');
    expect(JSON.stringify(all)).not.toContain('contract.moisture_max');
  });

  it('the public projection withholds counterparty records', async () => {
    const pub = await recordsPayload(CURRENT, 'PUBLIC_RULING');
    expect(pub?.count).toBe(0);
    expect(pub?.withheld.byVisibility).toBeGreaterThan(0);
  });

  it('as-of returns a typed refusal with a remedy, never a zero', async () => {
    const p = await asOfPayload(CURRENT, { subjectId: 'LOT-7C-104', predicate: 'condition.moisture', validAt: '2026-08-28T14:00:00Z', knownAt: '2026-09-01T12:00:00Z' });
    expect(p?.answer).toBeNull();
    expect(p?.refusal?.code).toBe('NO_IDENTITY_LINK');
    expect(p?.refusal?.remedy).toMatch(/identity-link record/);
    expect(p?.candidates).toEqual([]);
  });

  it('as-of resolves through an identity link and reports the link used', async () => {
    const p = await asOfPayload(CURRENT, { subjectId: 'LOT-5B-221', predicate: 'condition.moisture', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-09-01T12:00:00Z' });
    expect(p?.resolution).toBe('VIA_IDENTITY_LINK');
    expect(p?.identityLink?.recordId).toBe('REC-0202');
    expect(p?.answer?.value).toBe(5.1);
    expect(p?.answer?.statusAtKnownAt).toBe('CURRENT');
  });

  it('retractions since a cursor name affected records, replacements and rulings', async () => {
    const p = await retractionsPayload('2026-08-26T00:00:00Z', 'COUNTERPARTY_SHARED');
    expect(p.count).toBe(1);
    expect(p.retractions[0].retractionId).toBe('RET-0002');
    expect(p.retractions[0].affectedRulingIds).toEqual(['RUL-3F440-r1']);
    const all = await retractionsPayload(undefined, 'COUNTERPARTY_SHARED');
    expect(all.retractions.map((r) => r.kind)).toEqual(['CORRECTION', 'WITHDRAWAL']);
    expect(all.retractions[0].replacementRecordIds).toEqual(['REC-0204']);
  });

  it('the application layer is served beside the corpus and respects projection', async () => {
    const shared = await rulingPayload('RUL-7C104-r2', 'COUNTERPARTY_SHARED');
    expect(shared && 'ruling' in shared && shared.ruling.status).toBe('REFUSED');
    expect(shared && 'ruling' in shared && shared.ruling.corpus.releaseId).toBe('REL-CAR-2026.08.25');
    const pub = await rulingPayload('RUL-7C104-r2', 'PUBLIC_RULING');
    expect(pub && 'error' in pub && pub.error).toBe('not_visible');
    const manifest = await rulingManifestPayload('RUL-7C104-r2', 'COUNTERPARTY_SHARED');
    expect(manifest && 'manifest' in manifest && manifest.manifest.corpusBuild).toEqual({ buildId: 'build-caravan-sc-2026.08.25', knownAt: '2026-08-26T09:30:00Z' });
    expect(manifest && 'withheld' in manifest && manifest.withheld.evidenceIdentities).toBe(1);
  });
});

describe('certification, rights and attribution', () => {
  it('every release is certified with a manifest commitment, and the manifest carries stages, rights and governance', async () => {
    const list = await releasesPayload();
    for (const r of list.releases) {
      expect(r.certification.status).toBe('CERTIFIED');
      expect(r.certification.manifestCommitment).toMatch(/^[0-9a-f]{64}$/);
      expect(r.certification.verification).toBe('internal_recompute');
    }
    const m = await releaseManifestPayload(CURRENT);
    expect(m?.manifest.schema).toBe('payload-os.release-manifest.v0-demo');
    expect(m?.manifest.build.stages.map((s) => s.stage)).toContain('release_certification');
    expect(m?.manifest.build.stages.find((s) => s.stage === 'scientific_computation')?.status).toBe('NOT_APPLICABLE');
    expect(m?.manifest.governance.informationBarrier).toMatch(/prohibited by construction/);
    expect(m?.manifestCommitment).toBe(list.releases[0].certification.manifestCommitment);
  });

  it('no source in the corpus permits proprietary strategy or trading; attribution travels with delivered records', async () => {
    const rel = await releasePayload(CURRENT);
    for (const s of rel!.sources) {
      expect(s.permittedUses).not.toContain('proprietary_strategy');
      expect(s.permittedUses).not.toContain('trading');
    }
    const p = await recordsPayload(CURRENT, 'COUNTERPARTY_SHARED', { subjectId: 'SAMPLE-S-4402' });
    const rec = p!.records.find((r) => r.recordId === 'REC-0201')!;
    expect(rec.rights?.attribution).toBe('Northgate Inspection Services LIMS — Inspection-certificate licence (demonstration)');
    expect(rec.rights?.permittedUses).toContain('customer_delivery');
    const a = await asOfPayload(CURRENT, { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-09-01T12:00:00Z' });
    expect(a?.answer?.rights?.sourceName).toBe('Terminal weighbridge');
  });
});
