import type { Metadata } from 'next';
import Link from 'next/link';
import { getCorpusSource } from '@/adapter/corpusSource';
import { asOfPayload, recordsPayload, releasesPayload, retractionsPayload, rulingManifestPayload } from '@/adapter/feed';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { Section } from '@/components/primitives/Section';
import { CopyButton } from '@/components/primitives/CopyButton';

export const metadata: Metadata = { title: 'API' };

const CORPUS_CONTRACT = `interface CorpusSource {
  origin: { kind: 'FIXTURE' | 'LIVE'; label: string };
  listCorpora(): Promise<Corpus[]>;
  listReleases(corpusId?): Promise<CorpusRelease[]>;
  getRelease(releaseId): Promise<{ corpus; release } | undefined>;
  records(releaseId, viewer): Promise<{ records; withheldByRights; withheldByVisibility }>;
  asOf(releaseId, { subjectId, predicate, validAt, knownAt }): Promise<AsOfAnswer>;
  retractions(since?, viewer): Promise<Retraction[]>;
}`;

const CASE_CONTRACT = `interface CaseSource {            // application layer
  listCases(): Promise<ClaimCaseBundle[]>;
  getCase(caseId): Promise<ClaimCaseBundle | undefined>;
  getRuling(rulingId): Promise<{ bundle; ruling } | undefined>;
  listProfiles(): Promise<AdmissionProfile[]>;
  getProfile(profileId): Promise<AdmissionProfile | undefined>;
  getRemediation(remediationId): Promise<Remediation | undefined>;
}`;

function Example({ title, url, body }: { title: string; url: string; body: unknown }) {
  const text = JSON.stringify(body, null, 2);
  return (
    <details className="surface-inset p-3">
      <summary className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>{title} — <Link href={url} className="id" style={{ color: 'var(--info)' }}>GET {url}</Link></summary>
      <div className="mt-2 flex items-center justify-end"><CopyButton value={text} label="Copy JSON" /></div>
      <pre tabIndex={0} className="m-0 mt-1 surface-inset p-2 overflow-x-auto text-[11.5px] mono" style={{ color: 'var(--text-secondary)', maxHeight: 360 }}>{text}</pre>
    </details>
  );
}

export default async function ApiPage() {
  const source = getCorpusSource();
  const releases = await releasesPayload();
  const current = releases.releases.find((r) => r.status === 'CURRENT')?.releaseId ?? '';
  const records = await recordsPayload(current, 'COUNTERPARTY_SHARED', { subjectId: 'LOT-5B-221' });
  const asOf = await asOfPayload(current, { subjectId: 'LOT-7C-104', predicate: 'condition.moisture', validAt: '2026-08-28T14:00:00Z', knownAt: '2026-09-01T12:00:00Z' });
  const asOfHit = await asOfPayload(current, { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-08-20T00:00:00Z' });
  const retractions = await retractionsPayload('2026-08-26T00:00:00Z', 'COUNTERPARTY_SHARED');
  const manifest = await rulingManifestPayload('RUL-7C104-r2', 'COUNTERPARTY_SHARED');
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={source.origin.label} />}
      <div className="p-3 sm:p-5 max-w-[1000px] mx-auto w-full flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>API</h1>
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>The product is the corpus and its feed: releases, records with uncertainty and validity bounds, as-of answers, and push retractions. A customer applies their own inference to it. The endpoints below serve the committed demonstration corpus; every response says <span className="id">fixture_only: true</span> and names the release it was served from. Shapes are the product&apos;s; the data is synthetic.</p>
        </header>

        <Section title="Endpoints" id="api-endpoints">
          <table className="ledger-table text-[12.5px]">
            <thead><tr><th scope="col">Endpoint</th><th scope="col">Returns</th></tr></thead>
            <tbody>
              <tr><td className="id">GET /api/v1/releases[?corpus=]</td><td>Release history: id, status, knowledge cutoff, build, methodology, digest, supersession.</td></tr>
              <tr><td className="id">GET /api/v1/releases/:id</td><td>Build record with input digests, coverage, sources with their rights schedule, links.</td></tr>
              <tr><td className="id">GET /api/v1/releases/:id/records[?subject=&amp;predicate=&amp;projection=]</td><td>Deliverable records after the rights guard and the visibility projection, with withheld counts.</td></tr>
              <tr><td className="id">GET /api/v1/releases/:id/as-of?subject=&amp;predicate=&amp;validAt=&amp;knownAt=</td><td>One reconstructed answer with status at the knowledge time, the identity link used if any, or a typed refusal with a remedy and the candidates set aside.</td></tr>
              <tr><td className="id">GET /api/v1/retractions[?since=&amp;projection=]</td><td>Push retractions: corrections and withdrawals, oldest first, with affected and replacement records and affected rulings.</td></tr>
              <tr><td className="id">GET /api/v1/rulings/:id[?projection=]</td><td>Application layer: a ruling as the workbench returns it, at the requested projection.</td></tr>
              <tr><td className="id">GET /api/v1/rulings/:id/manifest</td><td>The <span className="id">notations.result-manifest.v1</span> sidecar and its commitment.</td></tr>
            </tbody>
          </table>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Projections served: <span className="id">COUNTERPARTY_SHARED</span> (default) and <span className="id">PUBLIC_RULING</span>. Internal classes are never served. Times are ISO 8601 UTC. Responses are uncached and carry <span className="id">X-Payload-Fixture-Only: true</span>.</p>
        </Section>

        <Section title="Examples from the demonstration corpus" id="api-examples">
          <Example title="Releases" url="/api/v1/releases" body={releases} />
          <Example title="Records for lot 5B-221 in the current release" url={`/api/v1/releases/${current}/records?subject=LOT-5B-221`} body={records} />
          <Example title="As-of: lot 5B-221 quantity as knowable on 2026-08-20 (before the correction)" url={`/api/v1/releases/${current}/as-of?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-08-20T00:00:00Z`} body={asOfHit} />
          <Example title="As-of: lot 7C-104 moisture — a typed refusal (no identity link)" url={`/api/v1/releases/${current}/as-of?subject=LOT-7C-104&predicate=condition.moisture&validAt=2026-08-28T14:00:00Z&knownAt=2026-09-01T12:00:00Z`} body={asOf} />
          <Example title="Retractions issued after 2026-08-26" url="/api/v1/retractions?since=2026-08-26T00:00:00Z" body={retractions} />
          <Example title="Application layer: ruling manifest for RUL-7C104-r2" url="/api/v1/rulings/RUL-7C104-r2/manifest" body={manifest} />
        </Section>

        <Section title="Automating against the feed" id="api-automate">
          <ol className="m-0 pl-4 text-[13px] flex flex-col gap-1" style={{ color: 'var(--text-primary)' }}>
            <li>Hold a release id and its knowledge cutoff. Query records or as-of answers against it; every answer states the release, both clocks and the bounds, so the decision rule runs on stated inputs, not on a black box.</li>
            <li>Poll <span className="id">/api/v1/retractions?since=&lt;cutoff&gt;</span>. A correction names the replacement record; a withdrawal names what to stop relying on and which rulings it touched.</li>
            <li>When a new release appears, re-run the same queries against it and compare. The earlier release still answers as it did.</li>
          </ol>
        </Section>

        <Section title="Adapter contracts" id="api-contract" aside={<CopyButton value={`${CORPUS_CONTRACT}\n\n${CASE_CONTRACT}`} />}>
          <pre tabIndex={0} className="m-0 surface-inset p-3 overflow-x-auto text-[11.5px] mono" style={{ color: 'var(--text-secondary)' }}>{CORPUS_CONTRACT}{'\n\n'}{CASE_CONTRACT}</pre>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>src/adapter/corpusSource.ts and src/adapter/caseSource.ts. The only implementations read committed fixtures. A live corpus source sits on the release store and the retraction log; a live case source maps the workbench&apos;s objects. Neither re-implements a gate; the browser computes no fact and adjudicates nothing.</p>
        </Section>

        <Section title="Substrate vocabulary carried by the feed" id="api-vocab">
          <table className="ledger-table text-[12.5px]">
            <thead><tr><th scope="col">Concept</th><th scope="col">Substrate origin</th><th scope="col">Feed field</th></tr></thead>
            <tbody>
              <tr><td>Evidence class, two axes + interest</td><td className="id">corpus-contract/contract.json 1.0.0</td><td className="id">evidenceClass.claimStrength / productionClass / interest</td></tr>
              <tr><td>Canonical identity</td><td className="id">control-plane/src/identity/canonical-uri.js</td><td className="id">canonicalId, subject.canonicalId, provenance.transformId</td></tr>
              <tr><td>knownAt distinct from valid time</td><td className="id">payload-methodology.js temporalSemantics</td><td className="id">knownAt, validity.validFrom / validTo</td></tr>
              <tr><td>Result manifest</td><td className="id">control-plane/src/governance/result-manifest.js</td><td className="id">/rulings/:id/manifest → notations.result-manifest.v1</td></tr>
              <tr><td>Capability maturity</td><td className="id">control-plane/src/governance/maturity.js</td><td className="id">release.methodology.status</td></tr>
              <tr><td>Source policy: permitted use and redistribution</td><td className="id">payload-methodology.js licensing</td><td className="id">sources[].permittedUses / nonUse / redistribution</td></tr>
              <tr><td>Refusal with remedy</td><td className="id">controlTower.ts {'{'}kind:&apos;refusal&apos;, code, detail, remedy{'}'}</td><td className="id">refusal.code / reason / remedy</td></tr>
            </tbody>
          </table>
        </Section>
      </div>
    </>
  );
}
