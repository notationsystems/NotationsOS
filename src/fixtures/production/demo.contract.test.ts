/**
 * The committed candidate-production demonstration is exactly what the local
 * rails produce from the committed inputs at the stated instants, and none
 * of it reaches the customer feed or the MCP tools. Node only.
 */
import { describe, expect, it } from 'vitest';
import demoJson from './demo.json';
import { DEMO_IDS, DEMO_INSTANTS, produceDemo } from './pipeline';
import { cutoffChecks, nonClaims, refusalCode, separationTerms, type ProductionDemo } from '@/domain/production';
import { asOfPayload, recordsPayload, releaseManifestPayload, releasePayload, releasesPayload, retractionsPayload, rulingManifestPayload, rulingPayload } from '@/adapter/feed';
import { MCP_TOOLS, runMcpTool } from '@/mcp/tools';
import { FIXTURE_CASES } from '@/fixtures/index';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';

const demo = demoJson as unknown as ProductionDemo;

describe('the candidate-production demonstration reproduces under the local rails', () => {
  it('regenerates byte-for-byte from the committed inputs at the stated instants (run npm run stamp:production after changing them)', () => {
    expect(produceDemo()).toEqual(demo);
  });

  it('carries three acquisitions, one candidate, one quarantine, one build and three refusals, all unadmitted', () => {
    expect(demo.schema).toBe('payload-os.production-demo.v0');
    expect(demo.fixture_only).toBe(true);
    expect(demo.acquisitions.map((a) => a.request.manifest.acquisitionId)).toEqual([DEMO_IDS.carrierAcquisition, DEMO_IDS.driftedAcquisition, DEMO_IDS.noticeAcquisition]);
    for (const a of demo.acquisitions) {
      expect(a.decision).toMatchObject({ state: 'ALLOWED', request: { operation: 'INGEST', audience: 'INTERNAL', requestedAt: DEMO_INSTANTS.capturedAt } });
      expect(a.capture.evidence.sourceTruthClaimed).toBe(false);
      expect(a.capture.receipt.storedAt).toBe(DEMO_INSTANTS.storedAt);
      expect(nonClaims(a).map((n) => n.key)).toEqual(['canonicalAdmission', 'sourceTruthClaimed']);
    }
    const [normalized, quarantined] = demo.normalizations;
    expect(normalized).toMatchObject({ state: 'NORMALIZED', reasons: ['CONTRACT_MATCH'], deriveDecision: { state: 'ALLOWED', request: { operation: 'DERIVE', audience: 'INTERNAL' } } });
    expect(normalized.candidate).toMatchObject({
      state: 'UNADMITTED', domain: 'CARAVAN', recordType: 'Carrier',
      identity: { state: 'UNRESOLVED', sourceRecordId: 'demo-carrier-001', canonicalId: null },
      fields: { legalName: 'Demonstration Carriers Incorporated', registrationNumber: 'DEMO-REG-001' },
      missingFields: ['operatingSite'], validTime: { state: 'UNOBSERVED', from: null, to: null }, knownAt: DEMO_INSTANTS.normalizedAt,
    });
    expect(quarantined).toMatchObject({ state: 'QUARANTINED', reasons: ['SCHEMA_MISMATCH'], candidate: null });
    expect(nonClaims(normalized).map((n) => n.key)).toEqual(['canonicalAdmission', 'sourceTruthClaimed', 'fieldAccuracyClaimed', 'independentlyVerified']);

    const [build] = demo.builds;
    expect(build).toMatchObject({ buildId: DEMO_IDS.build, state: 'UNADMITTED', recordCount: 1, knownThrough: DEMO_INSTANTS.knownThrough, builtAt: DEMO_INSTANTS.builtAt });
    expect(nonClaims(build).map((n) => n.key)).toEqual(['canonicalAdmission', 'canonicalStateMutated', 'identityResolved', 'releaseActivated', 'sourceTruthClaimed', 'independentlyVerified', 'completenessClaimed']);
    expect(cutoffChecks(build)).toEqual([{ normalizationId: DEMO_IDS.carrierNormalization, knownAt: DEMO_INSTANTS.normalizedAt, withinCutoff: true }]);
    expect(build.members[0].deriveDecision.request.requestedAt).toBe(DEMO_INSTANTS.builtAt);
    expect(build.members[0]).not.toHaveProperty('fields');

    expect(demo.refusals.map((r) => [r.step, r.requestId, refusalCode(r.error)])).toEqual([
      ['NORMALIZE', DEMO_IDS.noticeNormalization, 'DERIVATION_NOT_ALLOWED'],
      ['BUILD', DEMO_IDS.refusedBuild, 'MEMBER_NOT_ELIGIBLE'],
      ['BUILD', DEMO_IDS.earlyBuild, 'MEMBER_AFTER_CUTOFF'],
    ]);
    expect(demo.refusals[0].error).toContain('OPERATION_NOT_PERMITTED');
  });
});

describe('candidate production is separate from the corpus, the feed and the tools', () => {
  const terms = separationTerms(demo);

  it('names enough identifiers and digests to make the separation checkable', () => {
    expect(terms.length).toBeGreaterThan(15);
    expect(terms).toContain(DEMO_IDS.build);
    expect(terms).toContain(demo.normalizations[0].candidate!.digest);
  });

  it('no corpus record, release or fixture case refers to a candidate, run, build or its digests', () => {
    const corpus = JSON.stringify({ CARAVAN_CORPUS, FIXTURE_CASES });
    for (const term of terms) expect(corpus, term).not.toContain(term);
    expect(corpus).not.toContain('UNADMITTED');
  });

  it('no customer-feed payload contains one, on either projection', async () => {
    const releaseId = 'REL-CAR-2026.09.01';
    const payloads = await Promise.all([
      releasesPayload(), releasePayload(releaseId), releaseManifestPayload(releaseId),
      recordsPayload(releaseId, 'COUNTERPARTY_SHARED'), recordsPayload(releaseId, 'PUBLIC_RULING'),
      retractionsPayload(undefined, 'COUNTERPARTY_SHARED'),
      asOfPayload(releaseId, { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-09-01T12:00:00Z' }),
      rulingPayload('RUL-7C104-r2', 'COUNTERPARTY_SHARED'), rulingManifestPayload('RUL-7C104-r2', 'COUNTERPARTY_SHARED'),
    ]);
    const text = JSON.stringify(payloads);
    expect(text.length).toBeGreaterThan(1000);
    for (const term of terms) expect(text, term).not.toContain(term);
    expect(text).not.toContain('UNADMITTED');
    expect(text).not.toContain('local-candidate');
  });

  it('no MCP tool result contains one', async () => {
    const releaseId = 'REL-CAR-2026.09.01';
    const args: Record<string, unknown> = {
      list_releases: {}, get_release: { releaseId }, get_release_manifest: { releaseId }, list_records: { releaseId },
      query_as_of: { releaseId, subject: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-09-01T12:00:00Z' },
      list_retractions: {}, get_ruling: { rulingId: 'RUL-7C104-r2' }, get_ruling_manifest: { rulingId: 'RUL-7C104-r2' },
    };
    for (const tool of MCP_TOOLS) {
      expect(args, `arguments for ${tool.name}`).toHaveProperty(tool.name);
      const text = JSON.stringify(await runMcpTool(tool.name, args[tool.name]));
      for (const term of terms) expect(text, `${tool.name} leaks ${term}`).not.toContain(term);
    }
  });
});
