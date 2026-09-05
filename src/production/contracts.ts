import type { SourceRegistration } from '../data-os/contracts';
import { encodeLocalRecord, exactFields } from '../data-os/local-record';
import { parseLocalIntakeManifest } from '../data-os/local-intake';
import { requireText } from '../data-os/validation';
import { ProductionError } from './errors';

export const MAX_PRODUCTION_INPUT_BYTES = 1024 * 1024;
export const PRODUCTION_OBJECT_KINDS = ['CORPUS', 'SOURCE', 'CONTENT', 'ACQUISITION', 'NORMALIZATION', 'CANDIDATE_BUILD', 'RUN'] as const;
export type ProductionObjectKind = typeof PRODUCTION_OBJECT_KINDS[number];
export interface ProductionRef { id: string; digest: string }
export interface ProductionOutputRef extends ProductionRef { kind: ProductionObjectKind }
export interface ProductionCoverage { geography: string; temporal: string }
export interface ProductionCorpusDefinition {
  schema: 'payload.production-corpus-definition.v1'; id: string; version: string;
  domain: 'CARAVAN' | 'LANDSHARK'; recordType: 'Carrier' | 'IFCArtifact';
  requiredSubjects: string[]; requiredFields: string[]; coverage: ProductionCoverage;
  freshness: string; evidenceClasses: string[]; intendedUses: string[];
}
export interface ProductionSourceConfig {
  schema: 'payload.production-source-config.v1'; id: string; version: string;
  corpus: ProductionRef; provider: string; method: 'LOCAL_INLINE_BYTES';
  adapter: { id: 'caravan.carrier-json/v1' | 'payload.ifc-artifact/v1'; version: '1.0.0' };
  supportedCoverage: ProductionCoverage; policy: SourceRegistration;
}
export type ProductionCommand = { schema: 'payload.production-command.v1'; requestId: string } & (
  | { kind: 'REGISTER_CORPUS'; definition: ProductionCorpusDefinition }
  | { kind: 'REGISTER_SOURCE'; source: ProductionSourceConfig }
  | { kind: 'ACQUIRE'; source: ProductionRef; purpose: string; contentBase64: string }
  | { kind: 'NORMALIZE'; source: ProductionRef; acquisition: ProductionRef; purpose: string }
  | { kind: 'BUILD_CANDIDATES'; corpus: ProductionRef; members: ProductionRef[]; purpose: string }
);
export type ProductionStageName = 'REGISTRATION' | 'CAPTURE' | 'EVIDENCE_INSPECTION' | 'EXTRACTION' | 'NORMALIZATION' | 'CANDIDATE_ASSEMBLY' | 'BUILD_INSPECTION';
export interface ProductionStage {
  stage: ProductionStageName; state: 'COMPLETED' | 'FAILED' | 'QUARANTINED' | 'NOT_RUN';
  code: string; outputs: ProductionOutputRef[];
}
export interface ProductionRun {
  schema: 'payload.production-run.v1'; id: string; mode: 'LOCAL_DEVELOPMENT';
  request: Record<string, unknown>; requestDigest: string; startedAt: string; completedAt: string;
  state: 'COMPLETED' | 'FAILED' | 'QUARANTINED'; stages: ProductionStage[]; outputs: ProductionOutputRef[];
  failure: null | { code: string; artifactRetained: boolean | 'UNCONFIRMED'; receiptRetained: boolean | 'UNCONFIRMED'; runReceiptRetained: true;
    additionalOutputRetention?: 'UNCONFIRMED';
    retry: { sameRequest: true; newRequestRequired: true }; remediation: string[] };
  policyAuthority: 'OPERATOR_DECLARATION'; canonicalAdmission: false; releaseActivated: false;
  sourceTruthClaimed: false; completenessClaimed: false; digest: string;
  coverageVerified: false; freshnessVerified: false; definitionRequirementsVerified: false;
}
export interface ProductionResult { status: 'CREATED' | 'EXISTING'; historicalRetry: boolean; run: ProductionRun }

export function productionId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_.-]{0,119}$/.test(value)) throw new ProductionError('INVALID_REQUEST', 'Use bounded explicit identifiers.');
}
export function parseProductionRef(value: unknown): ProductionRef {
  try {
    exactFields(value, ['id', 'digest']); productionId(value.id);
    if (typeof value.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.digest)) throw new Error();
    return { id: value.id, digest: value.digest };
  } catch { throw new ProductionError('INVALID_REQUEST', 'An exact identifier and full SHA-256 digest are required.'); }
}
function texts(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16 || new Set(value).size !== value.length) throw new Error();
  for (const text of value) requireText(text, 'declaration', 180);
}
function coverage(value: unknown) {
  exactFields(value, ['geography', 'temporal']);
  requireText(value.geography, 'geography', 180); requireText(value.temporal, 'temporal', 180);
}
export function validateProductionDefinition(value: unknown): asserts value is ProductionCorpusDefinition {
  exactFields(value, ['schema', 'id', 'version', 'domain', 'recordType', 'requiredSubjects', 'requiredFields', 'coverage', 'freshness', 'evidenceClasses', 'intendedUses']);
  if (value.schema !== 'payload.production-corpus-definition.v1' ||
      !((value.domain === 'CARAVAN' && value.recordType === 'Carrier') || (value.domain === 'LANDSHARK' && value.recordType === 'IFCArtifact'))) throw new Error();
  productionId(value.id); productionId(value.version); coverage(value.coverage); requireText(value.freshness, 'freshness', 300);
  for (const key of ['requiredSubjects', 'requiredFields', 'evidenceClasses', 'intendedUses']) texts(value[key]);
}
export function validateProductionSource(value: unknown): asserts value is ProductionSourceConfig {
  exactFields(value, ['schema', 'id', 'version', 'corpus', 'provider', 'method', 'adapter', 'supportedCoverage', 'policy']);
  if (value.schema !== 'payload.production-source-config.v1' || value.method !== 'LOCAL_INLINE_BYTES') throw new Error();
  productionId(value.id); productionId(value.version); parseProductionRef(value.corpus); requireText(value.provider, 'provider', 180);
  coverage(value.supportedCoverage); exactFields(value.adapter, ['id', 'version']);
  if (!['caravan.carrier-json/v1', 'payload.ifc-artifact/v1'].includes(String(value.adapter.id)) || value.adapter.version !== '1.0.0') throw new Error();
  // Reuse the complete existing declared-policy shape validator, without granting a use.
  parseLocalIntakeManifest({ schema: 'payload.local-intake-request.v1', acquisitionId: 'validation', evidenceId: 'validation',
    sourceRegistration: value.policy, purpose: 'CONFIGURATION_ONLY', mediaType: 'application/octet-stream', capturedAt: '2026-01-01T00:00:00.000Z' });
}
export function decodeProductionContent(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length < 4 || value.length > Math.ceil(MAX_PRODUCTION_INPUT_BYTES / 3) * 4 ||
      value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) throw new ProductionError('INVALID_CONTENT', 'Provide canonical base64 for 1 byte to 1 MiB of local content.');
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > MAX_PRODUCTION_INPUT_BYTES || bytes.toString('base64') !== value) throw new ProductionError('INVALID_CONTENT', 'Provide canonical base64 for 1 byte to 1 MiB of local content.');
  return bytes;
}
export function parseProductionCommand(input: unknown): ProductionCommand {
  try {
    const value = JSON.parse(encodeLocalRecord(input, 2 * 1024 * 1024).toString('utf8'));
    const fields: Record<string, string[]> = { REGISTER_CORPUS: ['definition'], REGISTER_SOURCE: ['source'],
      ACQUIRE: ['source', 'purpose', 'contentBase64'], NORMALIZE: ['source', 'acquisition', 'purpose'], BUILD_CANDIDATES: ['corpus', 'members', 'purpose'] };
    if (!value || value.schema !== 'payload.production-command.v1' || !Object.hasOwn(fields, value.kind)) throw new Error();
    exactFields(value, ['schema', 'requestId', 'kind', ...fields[value.kind]]); productionId(value.requestId);
    if (value.kind === 'REGISTER_CORPUS') validateProductionDefinition(value.definition);
    else if (value.kind === 'REGISTER_SOURCE') validateProductionSource(value.source);
    else {
      requireText(value.purpose, 'purpose', 180);
      if (value.kind === 'BUILD_CANDIDATES') {
        value.corpus = parseProductionRef(value.corpus);
        if (!Array.isArray(value.members) || value.members.length < 1 || value.members.length > 64) throw new Error();
        const members = value.members.map(parseProductionRef).sort((a: ProductionRef, b: ProductionRef) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        if (new Set(members.map((member: ProductionRef) => member.id)).size !== members.length) throw new Error();
        value.members = members;
      } else {
        value.source = parseProductionRef(value.source);
        if (value.kind === 'NORMALIZE') value.acquisition = parseProductionRef(value.acquisition);
        else decodeProductionContent(value.contentBase64);
      }
    }
    return value as unknown as ProductionCommand;
  } catch (error) {
    if (error instanceof ProductionError) throw error;
    throw new ProductionError('INVALID_REQUEST', 'Send an exact bounded production command; paths, caller clocks and replacement state are not accepted.');
  }
}
