import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localRecordDigest } from '../data-os/local-record';
import { sourceIntegrationInventory } from './source-inventory';

// Explicit source coverage from the pinned prototype registry. These are not
// Payload connector registrations or an independently verified provider list.
const sources = [
  ['usgs-mcs', 'usgs-mcs-live'], ['un-comtrade', 'comtrade-trade'],
  ['yahoo-hg', 'yahoo-copper-price'], ['cftc-cot', 'cftc-positioning'],
  ['fmcsa-qcmobile', 'fmcsa-qcmobile'], ['eia-weekly-diesel', 'eia-weekly-diesel'],
  ['westmetall-lme', 'westmetall-lme-stocks'], ['curated-flow-snapshot', 'curated-copper-v1'],
  ['wb-pink-sheet', null], ['lme-licensed', null], ['shfe-stocks', null],
  ['cme-copper-stocks', null], ['icsg-bulletin', null], ['cochilco', null],
  ['minem-peru', null], ['news-events', null], ['company-filings', null],
  ['sec-edgar', null], ['maritime-ais', null], ['opencorporates', null], ['openownership', null],
];
const blockers = [
  'SOURCE_AND_SCOPE_SELECTION_REQUIRED', 'CURRENT_SOURCE_TERMS_REVIEW_REQUIRED',
  'PAYLOAD_CONNECTOR_IMPLEMENTATION_REQUIRED', 'BOUNDED_ACCEPTANCE_CAPTURE_REQUIRED',
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Inventory must not make network requests.')));
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('pinned source integration inventory', () => {
  it('identifies the exact prototype registry and covers only its 21 named sources', () => {
    const inventory = sourceIntegrationInventory();
    expect(inventory).toMatchObject({
      schema: 'payload.source-integration-inventory.v1', mode: 'LOCAL_DEVELOPMENT',
      basis: 'PINNED_PROTOTYPE_REGISTRY', coverage: 'NAMED_PROTOTYPE_REGISTRY_ONLY',
      prototype: {
        repository: 'notationsystems/Payload-Terminal-V0',
        commit: 'b5c99dd1d40cfb125a322b67904a622c6f6fde74',
        path: 'src/lib/economy/sourceRegistry.ts',
        blobSha: 'c7b67421bf153daba7d0fa3f11cdca102bf8d30a',
      },
      summary: { total: 21, prototypeAdaptersDeclared: 8, prototypeWithoutAdapter: 13, integrated: 0, selected: 0 },
    });
    expect(inventory.entries.map((entry) => [entry.sourceId, entry.prototypeAdapterId])).toEqual(sources);
    expect(new Set(inventory.entries.map((entry) => entry.sourceId)).size).toBe(21);
    for (const entry of inventory.entries) {
      expect(entry.name.trim()).not.toBe('');
      expect(entry.category.trim()).not.toBe('');
    }
  });

  it('distinguishes seven external adapter declarations from the curated snapshot and undeclared adapters', () => {
    const { entries } = sourceIntegrationInventory();
    expect(entries.filter((entry) => entry.prototypeStanding === 'ADAPTER_DECLARED')).toHaveLength(7);
    expect(entries.filter((entry) => entry.prototypeStanding === 'NO_ADAPTER_DECLARED')).toHaveLength(13);
    expect(entries.filter((entry) => entry.prototypeStanding === 'CURATED_SNAPSHOT')).toMatchObject([
      { sourceId: 'curated-flow-snapshot', prototypeAdapterId: 'curated-copper-v1' },
    ]);
    for (const entry of entries) {
      if (entry.prototypeAdapterId === null) expect(entry.prototypeStanding).toBe('NO_ADAPTER_DECLARED');
      else expect(entry.prototypeStanding).not.toBe('NO_ADAPTER_DECLARED');
    }
  });

  it('does not promote prototype declarations into selection, rights, connections or canonical admission', () => {
    const inventory = sourceIntegrationInventory();
    expect(inventory).toMatchObject({
      connectionEstablished: false, liveCollectionEnabled: false, currentRightsGrant: false,
      canonicalAdmission: false, scopeSelected: false, inventoryPersisted: false,
      credentialConfiguration: 'NOT_INSPECTED', providerAvailability: 'NOT_CHECKED',
    });
    for (const entry of inventory.entries) {
      expect(entry).toMatchObject({
        integrationState: 'NOT_INTEGRATED', selectedScope: null, sourceRegistration: null,
        lastAcquisition: null, blockers,
      });
    }
  });

  it('is deterministic and computes its digest over all payload fields without the digest itself', () => {
    const first = sourceIntegrationInventory();
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
    vi.stubEnv('PAYLOAD_PRODUCTION_DIR', 'C:\\private-path\\secret.json');
    vi.stubEnv('PAYLOAD_SOURCE_API_KEY', 'SECRET-credential');
    const second = sourceIntegrationInventory();
    expect(second).toEqual(first);
    const { digest, ...payload } = second;
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(digest).toBe(localRecordDigest(payload));
    expect(JSON.stringify(second)).not.toMatch(/private-path|secret\.json|SECRET|PAYLOAD_SOURCE_API_KEY|PAYLOAD_PRODUCTION_DIR/);
    expect(localRecordDigest({ ...payload, connectionEstablished: true })).not.toBe(digest);
  });

  it('returns independent nested data so caller changes cannot alter later inventory responses', () => {
    const baseline = sourceIntegrationInventory();
    const changed = sourceIntegrationInventory();
    expect(changed).not.toBe(baseline);
    expect(changed.prototype).not.toBe(baseline.prototype);
    expect(changed.summary).not.toBe(baseline.summary);
    expect(changed.entries).not.toBe(baseline.entries);
    expect(changed.entries[0]).not.toBe(baseline.entries[0]);
    expect(changed.entries[0].blockers).not.toBe(baseline.entries[0].blockers);
    Reflect.set(changed.prototype, 'commit', 'caller-supplied');
    Reflect.set(changed.summary, 'integrated', 21);
    Reflect.set(changed.entries[0], 'sourceId', 'caller-supplied');
    Reflect.set(changed.entries[0].blockers, '0', 'CALLER_CLAIMS_ALLOWED');
    Reflect.set(changed, 'currentRightsGrant', true);
    const next = sourceIntegrationInventory();
    expect(next).toEqual(baseline);
    const { digest, ...payload } = next;
    expect(digest).toBe(localRecordDigest(payload));
  });
});
