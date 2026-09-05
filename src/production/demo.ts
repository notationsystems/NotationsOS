import carrier from '../../examples/carrier/source.json';
import type { ProductionCorpusDefinition, ProductionRef, ProductionSourceConfig } from './contracts';

/** Deterministic synthetic inputs. Actual receipts acquire backend timestamps and exact references. */
export const CARAVAN_DEMO_PURPOSE = 'CARAVAN_LOCAL_DEVELOPMENT';
export const CARAVAN_DEMO_DEFINITION: ProductionCorpusDefinition = {
  schema: 'payload.production-corpus-definition.v1', id: 'demo-caravan-carrier-definition', version: '1.0.0',
  domain: 'CARAVAN', recordType: 'Carrier', requiredSubjects: ['Carrier'], requiredFields: ['legalName', 'registrationNumber', 'operatingSite'],
  coverage: { geography: 'SYNTHETIC_LOCAL_SPECIMEN_ONLY', temporal: 'SOURCE_VALID_TIME_PRESERVED' },
  freshness: 'Manual local specimen capture; no live freshness claim', evidenceClasses: ['OPERATOR_DECLARATION'], intendedUses: [CARAVAN_DEMO_PURPOSE],
};
export function caravanDemoSource(corpus: ProductionRef): ProductionSourceConfig {
  return { schema: 'payload.production-source-config.v1', id: 'demo-caravan-carrier-source', version: '1.0.0', corpus,
    provider: 'Notation Systems synthetic Carrier example', method: 'LOCAL_INLINE_BYTES', adapter: { id: 'caravan.carrier-json/v1', version: '1.0.0' },
    supportedCoverage: { ...CARAVAN_DEMO_DEFINITION.coverage }, policy: {
      registrationId: 'demo-caravan-carrier-policy', sourceId: 'notation://source/notation-systems/carrier-demo',
      displayName: 'Synthetic local carrier; not an assertion about a real company', sourceClass: 'OPERATOR_DECLARATION',
      licenseId: 'synthetic-demonstration-not-an-external-license', policyVersion: '1.0.0', effectiveFrom: '2026-09-01T00:00:00.000Z',
      permittedPurposes: [CARAVAN_DEMO_PURPOSE], allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'], retention: { mode: 'INDEFINITE' },
    } };
}
export const caravanDemoContent = () => Buffer.from(JSON.stringify(carrier), 'utf8').toString('base64');
