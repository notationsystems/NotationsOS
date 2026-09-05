/**
 * Structural doctrine, tested. Three rules that the code layout must keep:
 * browser and application layers take only types from the rails (they can
 * describe a capture, never perform one); the rails depend on nothing above
 * them (they can produce no corpus record); and every projection of the
 * corpus, the feed and the tools included, leaves its source untouched and
 * its referents' identities intact. Node only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { asOfPayload, recordsPayload, releaseManifestPayload, releasePayload, releasesPayload, retractionsPayload, rulingManifestPayload, rulingPayload } from '@/adapter/feed';
import { MCP_TOOLS, runMcpTool } from '@/mcp/tools';
import { FIXTURE_CASES, FIXTURE_CORPORA, FIXTURE_PROFILES } from '@/fixtures/index';
import { CARAVAN_CORPUS, CARAVAN_RELEASES } from '@/fixtures/caravan/release';

const ROOT = resolve(process.cwd());

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(relative(ROOT, path).replace(/\\/g, '/'));
  }
  return out;
}

/** Layers that run in the browser or render pages. Route handlers are server code and are not held to this rule. */
function browserAndPageFiles(): string[] {
  const files = [...walk(join(ROOT, 'src/domain')), ...walk(join(ROOT, 'src/components')), ...walk(join(ROOT, 'src/adapter')), ...walk(join(ROOT, 'src/lib')), ...walk(join(ROOT, 'src/fixtures'))];
  for (const f of walk(join(ROOT, 'src/app'))) if (/\/(page|layout|loading|error|not-found)\.tsx$/.test(f)) files.push(f);
  const nodeOnlyByDesign = new Set(['src/fixtures/production/pipeline.ts']);
  return files.filter((f) => !nodeOnlyByDesign.has(f));
}

const IMPORT = /import\s+(type\s+)?[^;]*?\sfrom\s+'([^']+)'/g;

/**
 * The rail modules a browser or page layer may run: the contracts (types) and
 * the source-use evaluator, a pure decision over a declared registration that
 * the rights matrix computes cell by cell. Capture, parsing, normalization,
 * building and every file operation stay out.
 */
const PURE_RAIL_MODULES = new Set(['@/data-os/contracts', '@/data-os/source-policy']);

describe('layer boundaries', () => {
  it('browser and page layers take only types and the pure policy evaluator from the rails: they can describe a capture, never perform one', () => {
    const offenders: string[] = [];
    for (const file of browserAndPageFiles()) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      for (const m of text.matchAll(IMPORT)) if (m[2].startsWith('@/data-os/') && !m[1] && !PURE_RAIL_MODULES.has(m[2])) offenders.push(`${file} → ${m[2]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the pure policy evaluator and its helpers touch no node builtin, so allowing them in the browser is safe', () => {
    for (const file of ['src/data-os/source-policy.ts', 'src/data-os/validation.ts', 'src/data-os/contracts.ts']) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      for (const m of text.matchAll(IMPORT)) expect(m[2], `${file} imports ${m[2]}`).not.toMatch(/^node:|^fs$|^path$|^crypto$/);
    }
  });

  it('the rails depend on nothing above them, so they can produce no corpus record, case or payload', () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, 'src/data-os'))) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      for (const m of text.matchAll(IMPORT)) if (/^@\/(domain|fixtures|adapter|components|app|mcp|coordination)\//.test(m[2])) offenders.push(`${file} → ${m[2]}`);
    }
    expect(offenders).toEqual([]);
  });
});

const RELEASE = 'REL-CAR-2026.09.01';
const ASOF = { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-09-01T12:00:00Z' };

async function projectEverything() {
  const feed = await Promise.all([
    releasesPayload(), releasePayload(RELEASE), releaseManifestPayload(RELEASE),
    recordsPayload(RELEASE, 'COUNTERPARTY_SHARED'), recordsPayload(RELEASE, 'PUBLIC_RULING'),
    retractionsPayload(undefined, 'COUNTERPARTY_SHARED'), asOfPayload(RELEASE, ASOF),
    rulingPayload('RUL-7C104-r2', 'COUNTERPARTY_SHARED'), rulingManifestPayload('RUL-7C104-r2', 'COUNTERPARTY_SHARED'),
  ]);
  const args: Record<string, unknown> = {
    list_releases: {}, get_release: { releaseId: RELEASE }, get_release_manifest: { releaseId: RELEASE }, list_records: { releaseId: RELEASE },
    query_as_of: { releaseId: RELEASE, subject: ASOF.subjectId, predicate: ASOF.predicate, validAt: ASOF.validAt, knownAt: ASOF.knownAt },
    list_retractions: {}, get_ruling: { rulingId: 'RUL-7C104-r2' }, get_ruling_manifest: { rulingId: 'RUL-7C104-r2' },
  };
  const tools: Record<string, unknown> = {};
  for (const t of MCP_TOOLS) tools[t.name] = await runMcpTool(t.name, args[t.name]);
  return { feed, tools };
}

describe('projection never mutates its source', () => {
  it('the corpus, releases, cases and profiles are identical before and after every feed payload and every MCP tool', async () => {
    const before = JSON.stringify({ CARAVAN_CORPUS, CARAVAN_RELEASES, FIXTURE_CORPORA, FIXTURE_CASES, FIXTURE_PROFILES });
    const first = await projectEverything();
    const after = JSON.stringify({ CARAVAN_CORPUS, CARAVAN_RELEASES, FIXTURE_CORPORA, FIXTURE_CASES, FIXTURE_PROFILES });
    expect(after).toBe(before);
    const second = await projectEverything();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('identity survives representation changes', () => {
  it('a record keeps the same notation:// identity in the records feed, the as-of answer and the MCP results', async () => {
    const feed = (await recordsPayload(RELEASE, 'COUNTERPARTY_SHARED'))!;
    const tool = (await runMcpTool('list_records', { releaseId: RELEASE })) as typeof feed;
    expect(feed.records.length).toBeGreaterThan(5);
    const byId = new Map(feed.records.map((r) => [r.recordId, r.canonicalId]));
    for (const r of tool.records) expect(r.canonicalId, r.recordId).toBe(byId.get(r.recordId));
    for (const r of feed.records) {
      expect(r.canonicalId).toMatch(/^notation:\/\//);
      expect(r.subject.canonicalId).toMatch(/^notation:\/\//);
    }
    const asOf = (await asOfPayload(RELEASE, ASOF))!;
    expect(asOf.answer).not.toBeNull();
    expect(asOf.answer!.canonicalId).toBe(byId.get(asOf.answer!.recordId));
    const viaTool = (await runMcpTool('query_as_of', { releaseId: RELEASE, subject: ASOF.subjectId, predicate: ASOF.predicate, validAt: ASOF.validAt, knownAt: ASOF.knownAt })) as typeof asOf;
    expect(viaTool.answer!.canonicalId).toBe(asOf.answer!.canonicalId);
  });
});
