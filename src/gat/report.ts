import { exactFields, encodeLocalRecord, localJson } from '../data-os/local-record';

export const MAX_GAT_REPORT_BYTES = 2 * 1024 * 1024;
export type GatStageStatus = 'PASS' | 'WARN' | 'BLOCKED' | 'NOT_RUN';
export type GatEntityStatus = 'READY' | 'NEEDS_GEOMETRY_DERIVATION' | 'MISSING_SOURCE_DATA' | 'BLOCKED';
export interface GatStage { status: GatStageStatus; error_type: string | null; message: string | null; details: Record<string, unknown> }
export interface GatIssue { code: string; severity: string; message: string; step_id: number | null; ifc_type: string | null }
export interface GatEntity {
  step_id: number; ifc_type: string; canonical_class: string; global_id: string | null; name: string; status: GatEntityStatus;
  required_quantities: string[]; available_quantities: string[]; missing_quantities: string[]; has_geometry_representation: boolean; issues: GatIssue[];
}
export interface GatUnit { step_id: number | null; kind: string; name: string; prefix: string | null; scale_to_metres: number | null; normalization_required: boolean; accepted_by_current_adapter: boolean }
export interface GatAuditReport {
  format: 'gat-ifc-audit-v1'; source: { path: string; sha256: string; size_bytes: number }; parse: GatStage; schema: string | null;
  units: GatUnit[];
  inventory: { instance_count: number; type_counts: Record<string, number>; opaque_type_counts: Record<string, number>; opt_in_product_candidate_counts: Record<string, number>;
    supported_product_count: number; supported_product_status_counts: Record<string, number>; beam_geometry: null | {
      method: string; beam_count: number; status_counts: Record<string, number>; derived_quantity_counts: Record<string, number>; results_digest: string; authorizes_structural_decisions: false;
    } };
  adapter_scope: { supported_ifc_product_types: string[]; opt_in_ifc_product_types: Record<string, string>; required_quantities: Record<string, string[]>; coverage_boundary: 'supported-product-scope-only' };
  entities: GatEntity[]; model_issues: GatIssue[]; issue_counts: Record<string, number>;
  pipeline: { lowering: GatStage; compilation: GatStage; verification: GatStage; world_digest: string | null; pipeline_ready: boolean };
  assurance: { audit_authorizes_decisions: false; requires_explicit_decision_scope: true; partial_ingestion_may_authorize: false };
}

const fail = () => { throw new Error('INVALID_REPORT: the GAT report does not satisfy the pinned audit contract.'); };
const text = (v: unknown, limit = 16_384): v is string => typeof v === 'string' && v.length <= limit;
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 10_000_000;
const hex = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function fields(v: unknown, names: string[]) { try { exactFields(v, names); } catch { fail(); } }
function list(v: unknown, maximum = 10_000): asserts v is unknown[] { if (!Array.isArray(v) || v.length > maximum) fail(); }
function strings(v: unknown) { list(v); if (v.some((item) => !text(item, 512)) || new Set(v).size !== v.length) fail(); }
function counts(v: unknown): asserts v is Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length > 10_000 || Object.entries(v).some(([key, value]) => !text(key, 512) || !count(value))) fail();
}
function issue(v: GatIssue) {
  fields(v, ['code', 'severity', 'message', 'step_id', 'ifc_type']);
  if (!text(v.code, 128) || !['ERROR', 'WARNING'].includes(v.severity) || !text(v.message)
    || (v.step_id !== null && (!count(v.step_id) || v.step_id === 0)) || (v.ifc_type !== null && !text(v.ifc_type, 128))) fail();
}
function stage(v: GatStage) {
  fields(v, ['status', 'error_type', 'message', 'details']);
  if (!['PASS', 'WARN', 'BLOCKED', 'NOT_RUN'].includes(v.status) || (v.error_type !== null && !text(v.error_type, 512))
    || (v.message !== null && !text(v.message)) || !v.details || typeof v.details !== 'object' || Array.isArray(v.details)) fail();
}

/** Parse and validate stored original report bytes without launching GAT. This is not independent verification. */
export function validateGatAuditReport(reportBytes: Uint8Array, source: { contentDigest: string; byteLength: number }): GatAuditReport {
  try {
    if (!(reportBytes instanceof Uint8Array) || !reportBytes.length || reportBytes.length > MAX_GAT_REPORT_BYTES) fail();
    const report = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(reportBytes)) as GatAuditReport;
    encodeLocalRecord(report, MAX_GAT_REPORT_BYTES);
    fields(report, ['format', 'source', 'parse', 'schema', 'units', 'inventory', 'adapter_scope', 'entities', 'model_issues', 'issue_counts', 'pipeline', 'assurance']);
    fields(report.source, ['path', 'sha256', 'size_bytes']);
    if (report.format !== 'gat-ifc-audit-v1' || report.source.path !== 'source.ifc' || !hex(report.source.sha256)
      || `sha256:${report.source.sha256}` !== source.contentDigest || report.source.size_bytes !== source.byteLength || !count(source.byteLength)) fail();
    if (report.schema !== null && !text(report.schema, 128)) fail();
    stage(report.parse); list(report.units, 1024);
    for (const unit of report.units) {
      fields(unit, ['step_id', 'kind', 'name', 'prefix', 'scale_to_metres', 'normalization_required', 'accepted_by_current_adapter']);
      if ((unit.step_id !== null && !count(unit.step_id)) || !text(unit.kind, 128) || !text(unit.name, 128) || (unit.prefix !== null && !text(unit.prefix, 128))
        || (unit.scale_to_metres !== null && (!Number.isFinite(unit.scale_to_metres) || unit.scale_to_metres <= 0))
        || typeof unit.accepted_by_current_adapter !== 'boolean' || unit.normalization_required !== (unit.scale_to_metres !== null && unit.scale_to_metres !== 1)) fail();
    }
    fields(report.inventory, ['instance_count', 'type_counts', 'opaque_type_counts', 'opt_in_product_candidate_counts', 'supported_product_count', 'supported_product_status_counts', 'beam_geometry']);
    for (const value of [report.inventory.type_counts, report.inventory.opaque_type_counts, report.inventory.opt_in_product_candidate_counts, report.inventory.supported_product_status_counts, report.issue_counts]) counts(value);
    if (!count(report.inventory.instance_count) || Object.values(report.inventory.type_counts).reduce((sum, item) => sum + item, 0) !== report.inventory.instance_count) fail();
    for (const [key, value] of Object.entries(report.inventory.opaque_type_counts)) if (report.inventory.type_counts[key] !== value) fail();
    fields(report.adapter_scope, ['supported_ifc_product_types', 'opt_in_ifc_product_types', 'required_quantities', 'coverage_boundary']);
    strings(report.adapter_scope.supported_ifc_product_types);
    if (report.adapter_scope.coverage_boundary !== 'supported-product-scope-only') fail();
    if (!report.adapter_scope.opt_in_ifc_product_types || typeof report.adapter_scope.opt_in_ifc_product_types !== 'object' || Array.isArray(report.adapter_scope.opt_in_ifc_product_types)
      || Object.entries(report.adapter_scope.opt_in_ifc_product_types).some(([key, value]) => !text(key, 128) || !text(value, 128))) fail();
    if (!report.adapter_scope.required_quantities || typeof report.adapter_scope.required_quantities !== 'object' || Array.isArray(report.adapter_scope.required_quantities)) fail();
    Object.values(report.adapter_scope.required_quantities).forEach(strings);
    list(report.entities); list(report.model_issues); report.model_issues.forEach(issue);
    const statusCounts: Record<string, number> = {};
    const issueCounts: Record<string, number> = {};
    for (const finding of report.model_issues) issueCounts[finding.code] = (issueCounts[finding.code] ?? 0) + 1;
    const ids = new Set<number>();
    for (const entity of report.entities) {
      fields(entity, ['step_id', 'ifc_type', 'canonical_class', 'global_id', 'name', 'status', 'required_quantities', 'available_quantities', 'missing_quantities', 'has_geometry_representation', 'issues']);
      if (!count(entity.step_id) || entity.step_id === 0 || ids.has(entity.step_id) || !text(entity.ifc_type, 128) || !text(entity.canonical_class, 128) || !text(entity.name, 4096)
        || (entity.global_id !== null && !text(entity.global_id, 512)) || !['READY', 'NEEDS_GEOMETRY_DERIVATION', 'MISSING_SOURCE_DATA', 'BLOCKED'].includes(entity.status)
        || typeof entity.has_geometry_representation !== 'boolean') fail();
      ids.add(entity.step_id); strings(entity.required_quantities); strings(entity.available_quantities); strings(entity.missing_quantities);
      if (localJson(entity.required_quantities.filter((q) => !entity.available_quantities.includes(q))) !== localJson(entity.missing_quantities)) fail();
      list(entity.issues); entity.issues.forEach(issue);
      statusCounts[entity.status] = (statusCounts[entity.status] ?? 0) + 1;
      for (const finding of entity.issues) issueCounts[finding.code] = (issueCounts[finding.code] ?? 0) + 1;
    }
    if (report.inventory.supported_product_count !== report.entities.length || localJson(statusCounts) !== localJson(report.inventory.supported_product_status_counts) || localJson(issueCounts) !== localJson(report.issue_counts)) fail();
    if (report.inventory.beam_geometry !== null) {
      const beam = report.inventory.beam_geometry;
      fields(beam, ['method', 'beam_count', 'status_counts', 'derived_quantity_counts', 'results_digest', 'authorizes_structural_decisions']);
      if (!text(beam.method, 128) || !count(beam.beam_count) || !hex(beam.results_digest) || beam.authorizes_structural_decisions !== false) fail();
      counts(beam.status_counts); counts(beam.derived_quantity_counts);
      if (Object.values(beam.status_counts).reduce((sum, item) => sum + item, 0) !== beam.beam_count) fail();
    }
    fields(report.pipeline, ['lowering', 'compilation', 'verification', 'world_digest', 'pipeline_ready']);
    const { lowering, compilation, verification } = report.pipeline;
    [lowering, compilation, verification].forEach(stage);
    const ready = report.parse.status === 'PASS' && lowering.status === 'PASS' && compilation.status === 'PASS' && ['PASS', 'WARN'].includes(verification.status);
    if (report.pipeline.pipeline_ready !== ready || (report.pipeline.world_digest !== null && !hex(report.pipeline.world_digest)) || (ready && !report.pipeline.world_digest)) fail();
    if (report.parse.status !== 'PASS' && [lowering, compilation, verification].some((s) => s.status !== 'NOT_RUN')) fail();
    if (lowering.status !== 'PASS' && [compilation, verification].some((s) => s.status !== 'NOT_RUN')) fail();
    if (compilation.status !== 'PASS' && verification.status !== 'NOT_RUN') fail();
    fields(report.assurance, ['audit_authorizes_decisions', 'requires_explicit_decision_scope', 'partial_ingestion_may_authorize']);
    if (report.assurance.audit_authorizes_decisions !== false || report.assurance.requires_explicit_decision_scope !== true || report.assurance.partial_ingestion_may_authorize !== false) fail();
    return report;
  } catch { return fail(); }
}

const token = (value: string) => /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/.test(value) ? value : '[REDACTED]';
const tokenCounts = (values: Record<string, number>) => Object.entries(values).map(([name, count]) => ({ name: token(name), count }));
const safeIssue = (value: GatIssue) => ({ code: token(value.code), severity: value.severity, step_id: value.step_id, ifc_type: value.ifc_type === null ? null : token(value.ifc_type) });

/** Separate frontend projection. Original free-form diagnostics stay in the immutable, non-public artifact. */
export function projectGatAudit(report: GatAuditReport) {
  return {
    schema: 'payload.gat-audit-projection.v1' as const, format: report.format, ifc_schema: report.schema === null ? null : token(report.schema),
    source: { sha256: report.source.sha256, size_bytes: report.source.size_bytes },
    parse: { status: report.parse.status },
    units: report.units.map((u) => ({ ...u, kind: token(u.kind), name: token(u.name), prefix: u.prefix === null ? null : token(u.prefix) })),
    inventory: { instance_count: report.inventory.instance_count, type_counts: tokenCounts(report.inventory.type_counts), opaque_type_counts: tokenCounts(report.inventory.opaque_type_counts),
      opt_in_product_candidate_counts: tokenCounts(report.inventory.opt_in_product_candidate_counts), supported_product_count: report.inventory.supported_product_count,
      supported_product_status_counts: report.inventory.supported_product_status_counts,
      beam_geometry: report.inventory.beam_geometry === null ? null : { ...report.inventory.beam_geometry, method: token(report.inventory.beam_geometry.method),
        status_counts: tokenCounts(report.inventory.beam_geometry.status_counts), derived_quantity_counts: tokenCounts(report.inventory.beam_geometry.derived_quantity_counts) } },
    adapter_scope: { supported_ifc_product_types: report.adapter_scope.supported_ifc_product_types.map(token),
      opt_in_ifc_product_types: Object.entries(report.adapter_scope.opt_in_ifc_product_types).map(([ifc_type, marker]) => ({ ifc_type: token(ifc_type), marker: token(marker) })),
      required_quantities: Object.entries(report.adapter_scope.required_quantities).map(([ifc_type, quantities]) => ({ ifc_type: token(ifc_type), quantities: quantities.map(token) })),
      coverage_boundary: report.adapter_scope.coverage_boundary },
    entities: report.entities.map((e) => ({ step_id: e.step_id, ifc_type: token(e.ifc_type), canonical_class: token(e.canonical_class), status: e.status,
      required_quantities: e.required_quantities.map(token), available_quantities: e.available_quantities.map(token), missing_quantities: e.missing_quantities.map(token),
      has_geometry_representation: e.has_geometry_representation, issues: e.issues.map(safeIssue) })),
    model_issues: report.model_issues.map(safeIssue), issue_counts: tokenCounts(report.issue_counts),
    pipeline: { lowering: { status: report.pipeline.lowering.status }, compilation: { status: report.pipeline.compilation.status }, verification: { status: report.pipeline.verification.status },
      world_digest: report.pipeline.world_digest, pipeline_ready: report.pipeline.pipeline_ready },
    assurance: report.assurance, diagnosticsOmitted: true as const, sourceNamesOmitted: true as const, canonicalAdmission: false as const,
    sourceTruthClaimed: false as const, independentlyVerified: false as const, physicalActionAuthorized: false as const,
  };
}
export type GatAuditProjection = ReturnType<typeof projectGatAudit>;
