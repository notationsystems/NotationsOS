import { localRecordDigest } from '../data-os/local-record';

// Factual inventory from one pinned prototype registry, not imported executable
// code, a current provider contract, or a list of authorized collection jobs.
const prototype = {
  repository: 'notationsystems/Payload-Terminal-V0',
  commit: 'b5c99dd1d40cfb125a322b67904a622c6f6fde74',
  path: 'src/lib/economy/sourceRegistry.ts',
  blobSha: 'c7b67421bf153daba7d0fa3f11cdca102bf8d30a',
} as const;

const declaredSources = [
  ['usgs-mcs', 'USGS Mineral Commodity Summaries (ScienceBase)', 'production', 'usgs-mcs-live'],
  ['un-comtrade', 'UN Comtrade public preview', 'trade', 'comtrade-trade'],
  ['yahoo-hg', 'COMEX HG=F via Yahoo Finance', 'price', 'yahoo-copper-price'],
  ['cftc-cot', 'CFTC Commitments of Traders', 'positioning', 'cftc-positioning'],
  ['fmcsa-qcmobile', 'FMCSA QCMobile carrier registry', 'registration', 'fmcsa-qcmobile'],
  ['eia-weekly-diesel', 'EIA weekly U.S. on-highway diesel benchmark', 'fuel', 'eia-weekly-diesel'],
  ['westmetall-lme', 'LME daily stocks via Westmetall', 'stocks', 'westmetall-lme-stocks'],
  ['curated-flow-snapshot', 'Curated facility flow snapshot (annual topology)', 'trade', 'curated-copper-v1'],
  ['wb-pink-sheet', 'World Bank Pink Sheet (commodity prices)', 'price', null],
  ['lme-licensed', 'LME licensed data feed', 'stocks', null],
  ['shfe-stocks', 'SHFE weekly warehouse stocks', 'stocks', null],
  ['cme-copper-stocks', 'CME/COMEX copper warehouse stocks', 'stocks', null],
  ['icsg-bulletin', 'ICSG monthly copper bulletin', 'production', null],
  ['cochilco', 'Cochilco (Chilean copper statistics)', 'production', null],
  ['minem-peru', 'MINEM Peru mining statistics', 'production', null],
  ['news-events', 'News / wire event extraction', 'events', null],
  ['company-filings', 'Company disclosures & filings (event stream)', 'events', null],
  ['sec-edgar', 'SEC EDGAR filings (facility structure)', 'production', null],
  ['maritime-ais', 'Maritime AIS vessel movement', 'movement', null],
  ['opencorporates', 'OpenCorporates company register', 'ownership', null],
  ['openownership', 'OpenOwnership beneficial-ownership register', 'ownership', null],
] as const;

/** No network, credential lookup, local-store inspection, registration or execution. */
export function sourceIntegrationInventory() {
  const entries = declaredSources.map(([sourceId, name, category, prototypeAdapterId]) => ({
    sourceId, name, category, prototypeAdapterId,
    prototypeStanding: sourceId === 'curated-flow-snapshot' ? 'CURATED_SNAPSHOT' as const
      : prototypeAdapterId === null ? 'NO_ADAPTER_DECLARED' as const : 'ADAPTER_DECLARED' as const,
    integrationState: 'NOT_INTEGRATED' as const,
    selectedScope: null, sourceRegistration: null, lastAcquisition: null,
    blockers: ['SOURCE_AND_SCOPE_SELECTION_REQUIRED', 'CURRENT_SOURCE_TERMS_REVIEW_REQUIRED',
      'PAYLOAD_CONNECTOR_IMPLEMENTATION_REQUIRED', 'BOUNDED_ACCEPTANCE_CAPTURE_REQUIRED'] as const,
  }));
  const payload = {
    schema: 'payload.source-integration-inventory.v1' as const, mode: 'LOCAL_DEVELOPMENT' as const,
    basis: 'PINNED_PROTOTYPE_REGISTRY' as const, prototype, entries,
    summary: { total: entries.length, prototypeAdaptersDeclared: entries.filter((entry) => entry.prototypeAdapterId !== null).length,
      prototypeWithoutAdapter: entries.filter((entry) => entry.prototypeAdapterId === null).length,
      integrated: 0, selected: 0 },
    connectionEstablished: false, liveCollectionEnabled: false, currentRightsGrant: false,
    canonicalAdmission: false, scopeSelected: false, inventoryPersisted: false,
    credentialConfiguration: 'NOT_INSPECTED' as const, providerAvailability: 'NOT_CHECKED' as const,
    coverage: 'NAMED_PROTOTYPE_REGISTRY_ONLY' as const,
  };
  return structuredClone({ ...payload, digest: localRecordDigest(payload) });
}

