import { describe, expect, it } from 'vitest';
import { byteDigest } from '../data-os/evidence-capture';
import { localRecordDigest } from '../data-os/local-record';
import type { ArtifactReference } from '../observation/contract';
import { clearanceReferences, clearanceRequestSchema, parseClearanceExperiment, type ClearanceExperiment } from './clearance-contract';
import { syntheticClearanceExperiment } from './clearance-demo';

const roles = ['model', 'actions', 'loss', 'references', 'assumptions'] as const;
function fixture() {
  return syntheticClearanceExperiment(Object.fromEntries(roles.map((role) => [role, {
    acquisitionId: `synthetic-${role}`, acquisitionDigest: localRecordDigest({ acquisition: role }),
    contentDigest: byteDigest(Buffer.from(`invented ${role}`)),
  }])) as Record<typeof roles[number], ArtifactReference>);
}
function rejects(change: (m: ClearanceExperiment) => void, message?: string) {
  const m = fixture(); change(m);
  if (message) expect(() => parseClearanceExperiment(m)).toThrow(message);
  else expect(() => parseClearanceExperiment(m)).toThrow();
}

describe('closed clearance declaration and joint measurement contract', () => {
  it('snapshots exact source-linked declarations without upgrading unresolved validation', () => {
    const original = fixture(), before = structuredClone(original), parsed = parseClearanceExperiment(original);
    expect(parsed).toEqual(before); expect(parsed).not.toBe(original);
    expect(parsed.validation.independence.state).toBe('UNRESOLVED');
    parsed.model.states[0].openingWidthM = 4;
    expect(original).toEqual(before);
    expect(clearanceReferences(original)).toHaveLength(5);
    expect(clearanceReferences(original).map((r) => r.acquisitionId)).toEqual([...roles].sort().map((r) => `synthetic-${r}`));
  });

  it.each([
    ['schema', (m: ClearanceExperiment) => Object.assign(m, { url: 'https://not-a-source.example' })],
    ['frame', (m: ClearanceExperiment) => Object.assign(m.frame, { units: 'FOOT' })],
    ['claim', (m: ClearanceExperiment) => Object.assign(m.model.assumptions, { independentlyVerified: true })],
    ['zero width', (m: ClearanceExperiment) => { m.model.states[0].openingWidthM = 0; }],
    ['large width', (m: ClearanceExperiment) => { m.model.states[0].equipmentWidthM = 1001; }],
    ['offset', (m: ClearanceExperiment) => { m.model.states[0].alignmentOffsetM = -1001; }],
    ['negative clearance', (m: ClearanceExperiment) => { m.minimumSideClearanceM = -1; }],
    ['zero loss', (m: ClearanceExperiment) => { m.loss.unsafeAccept = 0; }],
    ['negative cost', (m: ClearanceExperiment) => { m.model.actions[0].cost = -1; }],
    ['infinite cost', (m: ClearanceExperiment) => { m.model.actions[0].cost = Infinity; }],
    ['NaN prior', (m: ClearanceExperiment) => { m.model.states[0].probability = NaN; }],
    ['negative prior', (m: ClearanceExperiment) => { m.model.states[0].probability = -0.1; }],
    ['bad id', (m: ClearanceExperiment) => { m.experimentId = '../escape'; }],
    ['long id', (m: ClearanceExperiment) => { m.experimentId = 'x'.repeat(81); }],
    ['blank description', (m: ClearanceExperiment) => { m.description = ' '; }],
    ['control text', (m: ClearanceExperiment) => { m.description = 'line\nline'; }],
    ['no exclusions', (m: ClearanceExperiment) => { m.exclusions = []; }],
    ['too many states', (m: ClearanceExperiment) => { m.model.states = Array(17).fill(m.model.states[0]); }],
    ['too many actions', (m: ClearanceExperiment) => { m.model.actions = Array(5).fill(m.model.actions[0]); }],
    ['too many outcomes', (m: ClearanceExperiment) => { m.model.actions[0].outcomeIds = ['a', 'b', 'c', 'd', 'e']; }],
    ['too many joint outcomes', (m: ClearanceExperiment) => { m.model.jointOutcomes = Array(65).fill(m.model.jointOutcomes[0]); }],
    ['too many cases', (m: ClearanceExperiment) => { m.validation.cases = Array(65).fill(m.validation.cases[0]); }],
  ] as const)('refuses invalid bound or undeclared field: %s', (_label, change) => rejects(change));

  it('bounds encoded bytes before interpreting the declaration', () => rejects((m) => { m.description = 'x'.repeat(256 * 1024); }));
  it.each(['unsafeAccept', 'unnecessaryReject'] as const)('bounds supported %s loss magnitudes explicitly', (field) => {
    for (const value of [Number.MIN_VALUE, 1e-12, 1e-9 - Number.EPSILON * 1e-9, 1e6 + 1]) {
      rejects((m) => { m.loss[field] = value; });
    }
    for (const value of [1e-9, 1e6]) {
      const m = fixture(); m.loss[field] = value;
      expect(parseClearanceExperiment(m).loss[field]).toBe(value);
    }
  });
  it('requires a unit prior, with a narrow declared rounding tolerance', () => {
    rejects((m) => { m.model.states[0].probability += 1e-8; }, 'CLEARANCE_PROBABILITY_MASS');
    const m = fixture(); m.model.states[0].probability += 1e-13;
    expect(parseClearanceExperiment(m).model.states[0].probability).toBe(m.model.states[0].probability);
  });
  it('requires a normalized likelihood for every state, including a zero-prior state', () => {
    rejects((m) => { m.model.likelihoodByState[0].probabilities[0] = 0.9; }, 'CLEARANCE_PROBABILITY_MASS');
    rejects((m) => { m.model.states[1].probability += m.model.states[0].probability; m.model.states[0].probability = 0;
      m.model.likelihoodByState[0].probabilities.fill(0); }, 'CLEARANCE_PROBABILITY_MASS');
  });
  it.each(['missing', 'unknown', 'short', 'long'] as const)('binds likelihood rows and columns exactly: %s', (kind) => {
    rejects((m) => {
      if (kind === 'missing') m.model.likelihoodByState.pop();
      if (kind === 'unknown') m.model.likelihoodByState[0].stateId = 'unknown';
      if (kind === 'short') m.model.likelihoodByState[0].probabilities.pop();
      if (kind === 'long') m.model.likelihoodByState[0].probabilities.push(0);
    }, 'CLEARANCE_STATE_BINDING');
  });
  it.each(['state', 'action', 'joint', 'row', 'case', 'action outcome'] as const)('refuses duplicate %s identities', (kind) => {
    rejects((m) => {
      if (kind === 'state') m.model.states[1].id = m.model.states[0].id;
      if (kind === 'action') m.model.actions[1].id = m.model.actions[0].id;
      if (kind === 'joint') m.model.jointOutcomes[1].id = m.model.jointOutcomes[0].id;
      if (kind === 'row') m.model.likelihoodByState[1].stateId = m.model.likelihoodByState[0].stateId;
      if (kind === 'case') m.validation.cases[1].id = m.validation.cases[0].id;
      if (kind === 'action outcome') m.model.actions[0].outcomeIds[1] = m.model.actions[0].outcomeIds[0];
    }, 'CLEARANCE_DUPLICATE_ID');
  });
  it('refuses duplicate joint geometry hidden under different state ids', () => rejects((m) => {
    const { openingWidthM, equipmentWidthM, alignmentOffsetM } = m.model.states[0];
    Object.assign(m.model.states[1], { openingWidthM, equipmentWidthM, alignmentOffsetM });
  }, 'CLEARANCE_DUPLICATE_ID'));
  it.each(['model', 'validation'] as const)('requires every declared action exactly once in each %s outcome', (kind) => {
    for (const invalid of ['missing', 'unknown action', 'unknown outcome', 'duplicate action']) rejects((m) => {
      const values = kind === 'model' ? m.model.jointOutcomes[0].values : m.validation.cases[0].outcomes;
      if (invalid === 'missing') values.pop();
      if (invalid === 'unknown action') values[0].actionId = 'not-declared';
      if (invalid === 'unknown outcome') values[0].outcomeId = 'not-declared';
      if (invalid === 'duplicate action') values[1] = { ...values[0] };
    });
  });
  it('recognizes a duplicate joint outcome despite a different id and variable order', () => rejects((m) => {
    m.model.jointOutcomes[1].values = [...m.model.jointOutcomes[0].values].reverse();
  }, 'CLEARANCE_DUPLICATE_ID'));
  it('allows reordering a complete outcome and state likelihood rows without inventing independence', () => {
    const m = fixture(); m.model.jointOutcomes.forEach((o) => o.values.reverse()); m.model.likelihoodByState.reverse();
    expect(parseClearanceExperiment(m)).toEqual(m);
  });
  it.each(['acquisitionDigest', 'contentDigest'] as const)('refuses conflicting %s under one acquisition id', (field) => rejects((m) => {
    m.model.actions[0].evidence = { ...m.model.actions[0].evidence, [field]: `sha256:${'f'.repeat(64)}` };
  }, 'CLEARANCE_REFERENCE_CONFLICT'));
  it('bounds unique dependencies as well as case count', () => rejects((m) => {
    m.validation.cases = Array.from({ length: 61 }, (_, i) => ({ ...m.validation.cases[0], id: `c-${i}`, measurementId: `m-${i}`,
      evidence: { acquisitionId: `r-${i}`, acquisitionDigest: localRecordDigest({ acquisition: i }), contentDigest: localRecordDigest({ content: i }) } }));
  }, 'CLEARANCE_DEPENDENCY_LIMIT'));
});

describe('model/reference separation is structural, not an independence certificate', () => {
  it.each(['model', 'assumptions', 'loss', 'actions'] as const)('refuses reference bytes reused from %s even under another acquisition id', (role) => rejects((m) => {
    const source = role === 'model' ? m.model.evidence : role === 'assumptions' ? m.model.assumptions.evidence : role === 'loss' ? m.loss.evidence : m.model.actions[0].evidence;
    m.validation.cases[0].evidence = { ...source, acquisitionId: 'alias-of-model-bytes' };
  }, 'CLEARANCE_VALIDATION_LEAKAGE'));
  it('refuses reused reference measurements across case ids and acquisition aliases', () => rejects((m) => {
    m.validation.cases[1].measurementId = m.validation.cases[0].measurementId;
    m.validation.cases[1].evidence = { ...m.validation.cases[0].evidence, acquisitionId: 'reference-alias' };
  }, 'CLEARANCE_MEASUREMENT_REUSE'));
  it('accepts separate measurements in one artifact without claiming their independence', () => {
    const parsed = parseClearanceExperiment(fixture());
    expect(new Set(parsed.validation.cases.map((c) => c.evidence.contentDigest)).size).toBe(1);
    expect(parsed.validation.independence.state).toBe('UNRESOLVED');
  });
  it('allows no reference cases without fabricating a holdout set', () => {
    const m = fixture(); m.validation.cases = [];
    expect(parseClearanceExperiment(m).validation.cases).toEqual([]);
  });
  it('keeps the request limited to one immutable manifest, not execution, clocks or URLs', () => {
    const manifest = fixture().model.evidence;
    const request = { schema: 'payload.clearance-voi-request.v1', runId: 'bounded-run', manifest };
    expect(clearanceRequestSchema.parse(request)).toEqual(request);
    for (const field of ['evaluatedAt', 'url', 'action', 'approved', 'token']) expect(() => clearanceRequestSchema.parse({ ...request, [field]: 'forbidden' })).toThrow();
    expect(() => clearanceRequestSchema.parse({ ...request, runId: '../escape' })).toThrow();
  });
});
