import { describe, expect, it } from 'vitest';
import { NON_CLAIM_LABEL, PRODUCTION_BOUNDARY, cutoffChecks, nonClaims, refusalCode, refusalMeaning, type LocalCandidateBuild } from './production';

describe('production view model', () => {
  it('lists only the false-valued non-claims a record carries, in a fixed order', () => {
    expect(nonClaims({ sourceTruthClaimed: false, canonicalAdmission: false, other: false, independentlyVerified: true })).toEqual([
      { key: 'canonicalAdmission', label: NON_CLAIM_LABEL.canonicalAdmission },
      { key: 'sourceTruthClaimed', label: NON_CLAIM_LABEL.sourceTruthClaimed },
    ]);
    expect(nonClaims({})).toEqual([]);
  });

  it('reads the refusal code as the first token and explains it without inventing one', () => {
    expect(refusalCode('MEMBER_AFTER_CUTOFF: demo-x.')).toBe('MEMBER_AFTER_CUTOFF');
    expect(refusalMeaning('MEMBER_AFTER_CUTOFF: demo-x.')).toMatch(/cutoff is not advanced/);
    expect(refusalCode('no colon')).toBe('no colon');
    expect(refusalMeaning('SOMETHING_ELSE: x')).toMatch(/wrote nothing/);
  });

  it('checks knowledge time member by member: knownAt ≤ cutoff ≤ builtAt', () => {
    const build = {
      knownThrough: '2026-09-05T00:30:00.000Z', builtAt: '2026-09-05T01:00:00.000Z',
      members: [
        { normalization: { id: 'a', digest: 'd' }, knownAt: '2026-09-05T00:10:00.000Z' },
        { normalization: { id: 'b', digest: 'd' }, knownAt: '2026-09-05T00:45:00.000Z' },
      ],
    } as unknown as LocalCandidateBuild;
    expect(cutoffChecks(build).map((c) => [c.normalizationId, c.withinCutoff])).toEqual([['a', true], ['b', false]]);
  });

  it('states the boundary in the terms the mandate uses', () => {
    const text = PRODUCTION_BOUNDARY.join(' ');
    for (const phrase of ['UNADMITTED', 'Canonical admission', 'any corpus release', '/api/v1', 'MCP tools', 'canonicalId is null', 'Source truth', 'operator declaration']) expect(text).toContain(phrase);
  });
});

describe('acquisition as an observable process', () => {
  it('reads every stage metric from the demonstration and names its source; extraction and normalization are one recorded run', async () => {
    const { processStages, coverageGaps } = await import('./production');
    const demo = (await import('@/fixtures/production/demo.json')).default as unknown as import('./production').ProductionDemo;
    const stages = processStages(demo);
    expect(stages.map((s) => s.id)).toEqual(['COLLECTION', 'EXTRACTION', 'NORMALIZATION', 'READINESS']);
    for (const stage of stages) for (const metric of stage.metrics) expect(metric.source, `${stage.id} ${metric.label}`).toMatch(/\S/);
    const metric = (id: string, label: string) => stages.find((s) => s.id === id)!.metrics.find((m) => m.label === label)!.value;
    expect(metric('COLLECTION', 'captures')).toBe(3);
    expect(metric('COLLECTION', 'INGEST allowed')).toBe(3);
    expect(metric('EXTRACTION', 'runs requested')).toBe(3);
    expect(metric('EXTRACTION', 'parsed under contract')).toBe(1);
    expect(metric('EXTRACTION', 'refused by the contract')).toBe(1);
    expect(metric('EXTRACTION', 'refused before parsing')).toBe(1);
    expect(metric('NORMALIZATION', 'fields missing')).toBe(1);
    expect(metric('READINESS', 'within cutoff')).toBe(1);
    expect(metric('READINESS', 'builds refused')).toBe(2);
    expect(stages[1].does).toMatch(/one recorded run/);
    const gaps = coverageGaps(demo);
    expect(gaps.map((g) => g.code)).toEqual(['INGEST_ONLY', 'SCHEMA_MISMATCH', 'DERIVATION_NOT_ALLOWED', 'MEMBER_NOT_ELIGIBLE', 'MEMBER_AFTER_CUTOFF']);
    for (const gap of gaps) { expect(gap.remediation).toMatch(/\S/); expect(gap.source).toMatch(/\S/); }
    expect(gaps[0].subject).toEqual({ kind: 'acquisition', id: 'demo-caravan-local-notice-001' });
    expect(gaps[1].subject).toEqual({ kind: 'normalization', id: 'demo-caravan-carrier-normalization-002' });
  });

  it('lays provenance out as a sequence with labelled clocks, from declared policy to build membership, and marks refusals', async () => {
    const { normalizationSequence, buildSequence, acquisitionSequence, mentionedObjects, refusalsNaming } = await import('./production');
    const demo = (await import('@/fixtures/production/demo.json')).default as unknown as import('./production').ProductionDemo;
    const normalized = demo.normalizations[0];
    const steps = normalizationSequence(demo, normalized);
    // build-002 was refused for naming the quarantine; its refusal text names normalization-002, not this one, so only build-003 follows this candidate.
    expect(steps.map((s) => s.key)).toEqual(['policy', 'ingest', 'capture', 'receipt', 'derive', 'adapter', 'candidate', 'build:demo-caravan-carrier-build-001', 'refusal:demo-caravan-carrier-build-003']);
    expect(steps.find((s) => s.key === 'candidate')?.clock).toBe('knowledge time');
    expect(steps.find((s) => s.key === 'receipt')?.clock).toBe('record time');
    expect(steps.filter((s) => s.outcome === 'REFUSED').map((s) => s.id)).toEqual(['demo-caravan-carrier-build-003']);
    const quarantined = normalizationSequence(demo, demo.normalizations[1]);
    expect(quarantined.find((s) => s.key === 'adapter')?.outcome).toBe('REFUSED');
    expect(quarantined.find((s) => s.key === 'candidate')?.what).toMatch(/SCHEMA_MISMATCH/);
    expect(quarantined.find((s) => s.key === 'build')?.outcome).toBe('NONE');
    expect(acquisitionSequence(demo.acquisitions[2]).map((s) => s.outcome)).toEqual(['DONE', 'DONE', 'DONE', 'DONE']);
    const build = buildSequence(demo, demo.builds[0]);
    expect(build.map((s) => s.label)).toEqual(['Build definition', 'Knowledge cutoff', 'Member reopened', 'DERIVE at build time', 'Membership root']);
    expect(mentionedObjects(demo, demo.refusals[1].error)).toEqual([{ kind: 'normalization', id: 'demo-caravan-carrier-normalization-002' }]);
    expect(refusalsNaming(demo, 'demo-caravan-carrier-normalization-001').map((r) => r.requestId)).toEqual(['demo-caravan-carrier-build-003']);
    expect(refusalsNaming(demo, 'demo-caravan-carrier-normalization-002').map((r) => r.requestId)).toEqual(['demo-caravan-carrier-build-002']);
  });

  it('maps record fields to the source bytes without inferring a missing one, and its field list is the adapter contract’s', async () => {
    const { fieldMapping, CARRIER_CONTRACT_FIELDS } = await import('./production');
    const { CARRIER_ADAPTER } = await import('@/data-os/caravan-carrier-adapter');
    expect([...CARRIER_CONTRACT_FIELDS]).toEqual(Object.keys(CARRIER_ADAPTER.fields));
    const demo = (await import('@/fixtures/production/demo.json')).default as unknown as import('./production').ProductionDemo;
    const candidate = demo.normalizations[0].candidate!;
    const source = '{"schema":"caravan.carrier-source.v1","sourceRecordId":"demo-carrier-001","legalName":"  Demonstration Carriers Incorporated  ","registrationNumber":"DEMO-REG-001","operatingSite":null,"validTime":{"state":"UNOBSERVED","from":null,"to":null}}';
    const rows = fieldMapping(candidate, source);
    expect(rows.map((r) => [r.field, r.status, r.sourceValue])).toEqual([
      ['legalName', 'PARSED', '  Demonstration Carriers Incorporated  '],
      ['registrationNumber', 'PARSED', 'DEMO-REG-001'],
      ['operatingSite', 'MISSING', null],
    ]);
    expect(rows[0].note).toMatch(/trimmed/);
    expect(rows[1].note).toBe('Copied as parsed.');
    expect(rows[2].note).toMatch(/Explicit null.*Not inferred/);
    const unavailable = fieldMapping(candidate);
    expect(unavailable.every((r) => r.sourceValue === undefined)).toBe(true);
    expect(unavailable[0].note).toMatch(/unavailable/);
    expect(unavailable[2].note).toMatch(/Not inferred/);
    expect(fieldMapping(candidate, 'not json')[0].note).toMatch(/not JSON/);
  });
});
