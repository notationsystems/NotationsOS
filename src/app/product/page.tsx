import type { Metadata } from 'next';
import Link from 'next/link';
import { CUSTOMER_CATEGORIES, DISTRIBUTION_MECHANISMS, ECONOMIC_ARCHITECTURE, ENGINES, MATERIAL_CLASSES_IN_CORPUS, PRESENCE_LABEL, PRODUCTION_SYSTEM, PRODUCT_ARCHITECTURE, REFERENCE_IMPLEMENTATION, THESIS, VALUE_PROPOSITION } from '@/domain/product';
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

      <Section title="The value proposition, kept concrete" id="pm-value">
        <ul className="m-0 pl-4 text-[13px] flex flex-col gap-1">{VALUE_PROPOSITION.map((v) => <li key={v}>{v}</li>)}</ul>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Where each is demonstrated: <Link href="/stream" style={{ color: 'var(--info)' }}>as-of answers and bounds</Link> · <Link href="/releases" style={{ color: 'var(--info)' }}>certified release manifests</Link> · <Link href="/retractions" style={{ color: 'var(--info)' }}>push retractions</Link> · <Link href="/api" style={{ color: 'var(--info)' }}>provenance and rights on every delivered record, and automating against the feed</Link>.</p>
      </Section>
    </div>
  );
}
