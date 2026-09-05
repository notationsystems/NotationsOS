/**
 * MCP tools: one of the firm's distribution mechanisms. Each tool is a thin
 * wrapper over the same feed payloads the HTTP endpoints serve (one logic
 * path, nothing to drift). A refusal is a successful return carrying a
 * refusal object with a remedy, never a tool error; tool errors are for
 * malformed arguments only.
 */
import { z } from 'zod';
import { asOfPayload, recordsPayload, releaseManifestPayload, releasePayload, releasesPayload, retractionsPayload, rulingManifestPayload, rulingPayload, viewerFromParam } from '@/adapter/feed';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/;
const iso = (what: string) => z.string().regex(ISO, `${what} must be an ISO 8601 UTC instant, e.g. 2026-08-28T14:00:00Z`);
const projection = z.enum(['COUNTERPARTY_SHARED', 'PUBLIC_RULING']).optional().describe('Projection to serve. Internal classes are never served.');

export interface McpToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  shape: S;
  run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

const notFound = (what: string, id: string, remedy: string) => ({ fixture_only: true, error: `${what}_not_found`, detail: `No ${what} ${id} in the current source.`, remedy });

function def<S extends z.ZodRawShape>(d: McpToolDef<S>): McpToolDef<S> {
  return d;
}

export const MCP_TOOLS = [
  def({
    name: 'list_releases',
    description: 'Release history of every corpus: id, status, knowledge cutoff, build, methodology, certification, digest, supersession.',
    shape: { corpus: z.string().optional().describe('Corpus id to filter by, e.g. caravan.specialty-cargo') },
    run: async ({ corpus }) => releasesPayload(corpus),
  }),
  def({
    name: 'get_release',
    description: 'One release: build record with stages and input digests, coverage, sources with their intelligence-rights schedule, certification, governance, links.',
    shape: { releaseId: z.string().describe('Release id, e.g. REL-CAR-2026.09.01') },
    run: async ({ releaseId }) => (await releasePayload(releaseId)) ?? notFound('release', releaseId, 'Call list_releases.'),
  }),
  def({
    name: 'get_release_manifest',
    description: 'The certified release manifest and its sha256 commitment.',
    shape: { releaseId: z.string() },
    run: async ({ releaseId }) => (await releaseManifestPayload(releaseId)) ?? notFound('release', releaseId, 'Call list_releases.'),
  }),
  def({
    name: 'list_records',
    description: 'Deliverable records of a release after the rights guard and the projection, each with value, unit, basis, uncertainty bounds, validity bounds, both clocks, provenance, evidence class, rights and attribution. Withheld counts are counts only.',
    shape: { releaseId: z.string(), subject: z.string().optional().describe('Subject id, e.g. LOT-5B-221'), predicate: z.string().optional().describe('Predicate, e.g. quantity.gross'), projection },
    run: async ({ releaseId, subject, predicate, projection: p }) => (await recordsPayload(releaseId, viewerFromParam(p), { subjectId: subject, predicate })) ?? notFound('release', releaseId, 'Call list_releases.'),
  }),
  def({
    name: 'query_as_of',
    description: 'What the release could answer about a subject and predicate at a world time, given what was knowable at a knowledge time. Returns the answering record with its status, the identity link used if any, or a typed refusal with a remedy and the candidates set aside.',
    shape: { releaseId: z.string(), subject: z.string(), predicate: z.string(), validAt: iso('validAt').describe('World time the answer must describe'), knownAt: iso('knownAt').describe('Knowledge cutoff; clamped to the release cutoff') },
    run: async ({ releaseId, subject, predicate, validAt, knownAt }) => (await asOfPayload(releaseId, { subjectId: subject, predicate, validAt, knownAt })) ?? notFound('release', releaseId, 'Call list_releases.'),
  }),
  def({
    name: 'list_retractions',
    description: 'Push retractions (corrections and recalls) issued after a cursor, oldest first, with affected and replacement records and the rulings they touched.',
    shape: { since: iso('since').optional().describe('Return retractions issued after this instant; typically the knownAt of the release you hold'), projection },
    run: async ({ since, projection: p }) => retractionsPayload(since, viewerFromParam(p)),
  }),
  def({
    name: 'get_ruling',
    description: 'Application layer: a ruling as the Caravan workbench returns it, at the requested projection.',
    shape: { rulingId: z.string(), projection },
    run: async ({ rulingId, projection: p }) => (await rulingPayload(rulingId, viewerFromParam(p))) ?? notFound('ruling', rulingId, 'Rulings are listed at /rulings.'),
  }),
  def({
    name: 'get_ruling_manifest',
    description: 'Application layer: the notations.result-manifest.v1 sidecar of a ruling and its commitment.',
    shape: { rulingId: z.string(), projection },
    run: async ({ rulingId, projection: p }) => (await rulingManifestPayload(rulingId, viewerFromParam(p))) ?? notFound('ruling', rulingId, 'Rulings are listed at /rulings.'),
  }),
] as const;

export type McpToolName = (typeof MCP_TOOLS)[number]['name'];

/** Validate arguments against the tool's schema and run it. Throws on malformed arguments only. */
export async function runMcpTool(name: string, args: unknown): Promise<unknown> {
  const tool = MCP_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool ${name}. Tools: ${MCP_TOOLS.map((t) => t.name).join(', ')}`);
  const parsed = z.object(tool.shape).parse(args ?? {});
  return (tool.run as (a: unknown) => Promise<unknown>)(parsed);
}
