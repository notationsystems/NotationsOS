import type { Metadata } from 'next';
import Link from 'next/link';
import { CUSTOMER_CATEGORIES, DISTRIBUTION_MECHANISMS, ECONOMIC_ARCHITECTURE, ENGINES, MATERIAL_CLASSES_IN_CORPUS, PRESENCE_LABEL, PRODUCTION_SYSTEM, PRODUCT_ARCHITECTURE, REFERENCE_IMPLEMENTATION, THESIS, VALUE_PROPOSITION } from '@/domain/product';
import { DOCTRINE, EXTRACTION_INTERFACE, FABRICS, IDENTITY_CHAIN, INFORMATION_STATES, OPERATIONAL_RULE, PROJECTION_ENGINES_IN_REPOSITORY, VERIFICATION_TIERS, WORKBENCH_RUNTIME } from '@/domain/doctrine';
import { Section } from '@/components/primitives/Section';

export const metadata: Metadata = { title: 'Product model' };

/** What the firm is, what it makes, how it distributes it, whom it serves, and what exists here. The text is the founder's; the presence flags are facts about this repository. */
export default function ProductPage() {
  return (
    <div className="p-3 sm:p-5 max-w-[1000px] mx-auto w-full flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="label-sm">Notation Systems · operating model</span>
        <h1 className="m-0 text-[20px] font-semibold leading-snug" style={{ color: 'var(--text-heading)' }}>{THESIS.firm}</h1>
        <p className="m-0 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>{THESIS.production}</p>
        <p className="m-0 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>{THESIS.inventory}</p>
      </header>

      <Section title="Source material" id="pm-material">
        <ul className="m-0 p-0 list-none flex flex-wrap gap-2" aria-label="Classes of authorized source material">
          {MATERIAL_CLASSES_IN_CORPUS.map((m) => (
            <li key={m.materialClass} className="surface-inset px-3 py-2 text-[12.5px]" data-material={m.materialClass} data-present={m.presentInDemo}>
              <span style={{ color: 'var(--text-heading)' }}>{m.label}</span>
              <div className="text-[11.5px]" style={{ color: m.presentInDemo ? 'var(--status-conditional)' : 'var(--text-muted)' }}>{m.presentInDemo ? 'In the demonstration corpus' : 'Not represented in the demonstration corpus'}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="The production system" id="pm-production">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Twelve stages. Each release page shows this record as it ran for that build, and says which stages did not run.</p>
        <ol className="m-0 p-0 list-none grid gap-1 sm:grid-cols-2">
          {PRODUCTION_SYSTEM.map((s, i) => (
            <li key={s.stage} className="surface-inset p-2 text-[12.5px]" data-stage={s.stage}><span className="mono" style={{ color: 'var(--text-muted)' }}>{String(i + 1).padStart(2, '0')}</span> <span style={{ color: 'var(--text-heading)' }}>{s.label}</span><div style={{ color: 'var(--text-secondary)' }}>{s.meaning}</div></li>
          ))}
        </ol>
      </Section>

      <Section title="The five fabrics" id="pm-fabrics">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The production system, arranged as the architecture the firm carries forward: five fabrics, each a transformation, feedback returning to the first. The presence flag is a fact about this repository.</p>
        <ol className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Fabrics">
          {FABRICS.map((f) => (
            <li key={f.id} className="surface-inset p-2 text-[12.5px] grid gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)_auto]" data-fabric={f.id} data-presence={f.presence}>
              <span className="mono" style={{ color: 'var(--text-muted)' }}>{f.order}</span>
              <span><span style={{ color: 'var(--text-heading)' }}>{f.title}</span> <span className="mono text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{f.transforms}</span><div style={{ color: 'var(--text-secondary)' }}>{f.inThisRepository}</div></span>
              <span className="text-[11.5px] whitespace-nowrap" style={{ color: f.presence === 'ABSENT' ? 'var(--status-refused)' : f.presence === 'FIXTURE' ? 'var(--status-conditional)' : 'var(--check-passed)' }}>{f.where ? <Link href={f.where} style={{ color: 'inherit' }}>{PRESENCE_LABEL[f.presence]}</Link> : PRESENCE_LABEL[f.presence]}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Inventory and distribution" id="pm-distribution">
        <table className="ledger-table text-[13px]">
          <thead><tr><th scope="col">Layer</th><th scope="col">Role</th></tr></thead>
          <tbody>{THESIS.layers.map((l) => <tr key={l.layer}><td style={{ color: 'var(--text-heading)' }}>{l.layer}</td><td>{l.role}</td></tr>)}</tbody>
        </table>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Distribution mechanisms: {DISTRIBUTION_MECHANISMS.join(' · ')}. In this repository: the <Link href="/api" style={{ color: 'var(--info)' }}>feed API</Link>, the <Link href="/stream" style={{ color: 'var(--info)' }}>stream</Link>, <Link href="/api#api-mcp" style={{ color: 'var(--info)' }}>MCP tools</Link> and the <Link href="/cases" style={{ color: 'var(--info)' }}>Caravan workbench</Link>; reports are absent.</p>
      </Section>

      <Section title="Customer categories" id="pm-customers">
        <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-3" aria-label="Customer categories">
          {CUSTOMER_CATEGORIES.map((c) => (
            <li key={c.id} className="surface p-3 text-[12.5px]" data-customer={c.id}>
              <div className="font-medium" style={{ color: 'var(--text-heading)' }}>{c.title}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{c.need}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Economic architecture" id="pm-economics">
        <ol className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Economic architecture">
          {ECONOMIC_ARCHITECTURE.map((e) => (
            <li key={e.step} className="surface p-3 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 text-[13px]" data-step={e.step}>
              <span className="mono shrink-0" style={{ color: 'var(--text-muted)' }}>{e.step}</span>
              <span className="sm:w-[340px] shrink-0" style={{ color: 'var(--text-heading)' }}>{e.statement}</span>
              <span className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{e.inThisRepository}</span>
            </li>
          ))}
        </ol>
        <p className="m-0 text-[13px]" style={{ color: 'var(--text-primary)' }}>{THESIS.separation}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Separation is recorded as governance on the corpus and as prohibited uses in every rights schedule; see the rights matrix on any <Link href="/releases" style={{ color: 'var(--info)' }}>release</Link>.</p>
      </Section>

      <Section title="Product architecture" id="pm-architecture">
        <pre className="m-0 surface-inset p-3 text-[12.5px] mono overflow-x-auto" aria-label="Product architecture tree" tabIndex={0}>{`${PRODUCT_ARCHITECTURE.company}
└─ ${PRODUCT_ARCHITECTURE.platform} — ${PRODUCT_ARCHITECTURE.platformRole.toLowerCase()}
${PRODUCT_ARCHITECTURE.domains.map((d, i, a) => `   ${i === a.length - 1 ? '└─' : '├─'} ${d.label} — ${d.scope.toLowerCase()}`).join('\n')}`}</pre>
        <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-3">
          {PRODUCT_ARCHITECTURE.domains.map((d) => (
            <li key={d.id} className="surface-inset p-3 text-[12.5px]" style={{ borderStyle: d.enabled ? 'solid' : 'dashed' }}>
              <div className="font-medium" style={{ color: d.enabled ? 'var(--text-heading)' : 'var(--text-muted)' }}>{d.label} {!d.enabled && <span className="label-sm">slot</span>}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{d.scope}</div>
              {d.note && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{d.note}</div>}
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{THESIS.platform}</p>
      </Section>

      <Section title="Three states of information" id="pm-states">
        <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-3" aria-label="States of information">
          {INFORMATION_STATES.map((st) => (
            <li key={st.id} className="surface p-3 text-[12.5px] flex flex-col gap-1" data-information-state={st.id}>
              <div className="flex items-baseline gap-2"><span className="mono" style={{ color: 'var(--status-conditional)' }}>{st.symbol}</span><span className="font-medium" style={{ color: 'var(--text-heading)' }}>{st.title}</span></div>
              <div style={{ color: 'var(--text-secondary)' }}>{st.meaning}</div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{st.invariants.join(' · ')}</div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>Here: {st.inThisRepository} <Link href={st.where} style={{ color: 'var(--info)' }}>{st.where}</Link></div>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Distinct identities, with the morphisms between them preserved rather than collapsed: {IDENTITY_CHAIN.join(' ≠ ')}.</p>
      </Section>

      <Section title="Doctrine" id="pm-doctrine">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Seven rules strong enough to be doctrine, each with where this repository enforces it and which tests prove it. <span className="mono">src/domain/doctrine.test.ts</span> fails if a named test disappears.</p>
        <ol className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Doctrine">
          {DOCTRINE.map((r) => (
            <li key={r.n} className="surface-inset p-2 text-[12.5px] flex flex-col gap-0.5" data-doctrine-rule={r.n}>
              <div><span className="mono" style={{ color: 'var(--text-muted)' }}>{r.n}</span> <span style={{ color: 'var(--text-heading)' }}>{r.rule}</span> <span style={{ color: 'var(--text-secondary)' }}>{r.meaning}</span></div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>Here: {r.enforcedHere}{r.where ? <> <Link href={r.where} style={{ color: 'var(--info)' }}>{r.where}</Link></> : null}</div>
              <div className="text-[11px] mono" style={{ color: 'var(--text-muted)' }}>{r.tests.join(' · ')}</div>
            </li>
          ))}
        </ol>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-heading)' }} data-testid="operational-rule">{OPERATIONAL_RULE}</p>
      </Section>

      <Section title="What exists in this repository" id="pm-presence">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-heading)' }}>{REFERENCE_IMPLEMENTATION.name}</span> — {REFERENCE_IMPLEMENTATION.role} {REFERENCE_IMPLEMENTATION.inThisRepository}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {ENGINES.map((e) => (
            <article key={e.id} className="surface p-3 flex flex-col gap-2" aria-labelledby={`engine-${e.id}`}>
              <h3 id={`engine-${e.id}`} className="m-0 text-[14px] font-semibold" style={{ color: 'var(--text-heading)' }}>{e.title}</h3>
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{e.description}</p>
              <table className="ledger-table text-[12px]" aria-label={`${e.title}: presence`}>
                <thead><tr><th scope="col">Item</th><th scope="col">Presence</th></tr></thead>
                <tbody>
                  {e.inThisRepository.map((x) => (
                    <tr key={x.item} data-presence={x.presence}>
                      <td>{x.where ? <Link href={x.where} style={{ color: 'var(--text-primary)' }}>{x.item}</Link> : x.item}</td>
                      <td style={{ color: x.presence === 'ABSENT' ? 'var(--status-refused)' : x.presence === 'FIXTURE' ? 'var(--status-conditional)' : 'var(--text-secondary)' }}>{PRESENCE_LABEL[x.presence]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Shared OS coordination" id="pm-coordination">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The <Link href="/agents" style={{ color: 'var(--info)' }}>agent and apparatus stable</Link> records definitions, capabilities, and compatible input/output contracts. The <Link href="/board" style={{ color: 'var(--info)' }}>message board</Link> records requests, handoffs, blockers, results, and acknowledgements with corpus release context.</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Present as a local coordination prototype with a demonstration registry, participant inboxes, and JavaScript/Python clients. A manually started local worker reviews declared contracts and records results and receipts. The board does not launch workers, authenticate customers, or execute models.</p>
      </Section>

      <Section title="Projection fabric" id="pm-projection">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Three instruments for three questions over one corpus, and the records view. A projection changes representation, never identity; it derives no relation from where things land; it has no path back into its source. The closed spec, the source-pinned compiler and the read-only preview endpoints are in <span className="mono">src/projection</span>; the routing table is in <span className="mono">src/domain/projection.ts</span>; the engines are routed to, not installed.</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Projection engines">
            <thead><tr><th scope="col">Engine</th><th scope="col">Question</th><th scope="col">Role</th><th scope="col">Runtime</th><th scope="col">Here</th></tr></thead>
            <tbody>
              {PROJECTION_ENGINES_IN_REPOSITORY.map((e) => (
                <tr key={e.engine} data-engine={e.engine} data-presence={e.presence}>
                  <td className="id">{e.engine}</td><td style={{ color: 'var(--text-heading)' }}>{e.question}</td><td>{e.role}</td><td className="mono">{e.runtime}</td>
                  <td style={{ color: e.presence === 'ABSENT' ? 'var(--status-refused)' : 'var(--check-passed)' }}>{PRESENCE_LABEL[e.presence]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{WORKBENCH_RUNTIME.statement} Here: {WORKBENCH_RUNTIME.inThisRepository}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{EXTRACTION_INTERFACE.statement} Here: {EXTRACTION_INTERFACE.inThisRepository}</p>
      </Section>

      <Section title="Verification tiers" id="pm-verification">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Verification is selective. An application chooses the tier it needs; this repository reaches the first two and claims no more.</p>
        <ol className="m-0 p-0 list-none grid gap-1 sm:grid-cols-2" aria-label="Verification tiers">
          {VERIFICATION_TIERS.map((t) => (
            <li key={t.tier} className="surface-inset p-2 text-[12.5px]" data-tier={t.tier} data-reached={t.reachedHere}>
              <span className="mono" style={{ color: t.reachedHere ? 'var(--check-passed)' : 'var(--text-muted)' }}>{t.tier}</span> <span style={{ color: 'var(--text-heading)' }}>{t.name}</span> <span className="text-[11.5px]" style={{ color: t.reachedHere ? 'var(--check-passed)' : 'var(--status-refused)' }}>{t.reachedHere ? 'reached' : 'not reached'}</span>
              <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>{t.how}</div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="The value proposition, kept concrete" id="pm-value">
        <ul className="m-0 pl-4 text-[13px] flex flex-col gap-1">{VALUE_PROPOSITION.map((v) => <li key={v}>{v}</li>)}</ul>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Where each is demonstrated: <Link href="/stream" style={{ color: 'var(--info)' }}>as-of answers and bounds</Link> · <Link href="/releases" style={{ color: 'var(--info)' }}>certified release manifests</Link> · <Link href="/retractions" style={{ color: 'var(--info)' }}>push retractions</Link> · <Link href="/api" style={{ color: 'var(--info)' }}>provenance and rights on every delivered record, and automating against the feed</Link>.</p>
      </Section>
    </div>
  );
}
