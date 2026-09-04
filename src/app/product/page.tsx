import type { Metadata } from 'next';
import Link from 'next/link';
import { ENGINES, PRESENCE_LABEL, PRINCIPAL_CAPITAL, PRODUCTION_SYSTEM, THESIS, VALUE_PROPOSITION, DOMAIN_PRODUCTS } from '@/domain/product';
import { Section } from '@/components/primitives/Section';

export const metadata: Metadata = { title: 'Product model' };

/** What the firm makes, how it distributes it, and what exists here. Text is the founder's; presence flags are facts about this repository. */
export default function ProductPage() {
  return (
    <div className="p-3 sm:p-5 max-w-[1000px] mx-auto w-full flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="label-sm">Notation Systems · operating model</span>
        <h1 className="m-0 text-[20px] font-semibold leading-snug" style={{ color: 'var(--text-heading)' }}>{THESIS.statement}</h1>
        <p className="m-0 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>{THESIS.finishedGood}</p>
      </header>

      <Section title="Layers" id="pm-layers">
        <table className="ledger-table text-[13px]">
          <thead><tr><th scope="col">Layer</th><th scope="col">Role</th></tr></thead>
          <tbody>{THESIS.layers.map((l) => <tr key={l.layer}><td style={{ color: 'var(--text-heading)' }}>{l.layer}</td><td>{l.role}</td></tr>)}</tbody>
        </table>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>{THESIS.concise}</p>
      </Section>

      <Section title="Two operating businesses" id="pm-engines">
        <div className="grid gap-3 md:grid-cols-2">
          {ENGINES.map((e, i) => (
            <article key={e.id} className="surface p-3 flex flex-col gap-2" aria-labelledby={`engine-${e.id}`}>
              <h3 id={`engine-${e.id}`} className="m-0 text-[15px] font-semibold" style={{ color: 'var(--text-heading)' }}>{i + 1}. {e.title}</h3>
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{e.description}</p>
              <div className="text-[12px]"><span className="label-sm">Distribution</span> <span style={{ color: 'var(--text-secondary)' }}>{e.distribution.join(' · ')}</span></div>
              <table className="ledger-table text-[12px]" aria-label={`${e.title}: in this repository`}>
                <thead><tr><th scope="col">In this repository</th><th scope="col">Presence</th></tr></thead>
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

      <Section title="The shared production system" id="pm-production">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The API, feed, report, agent or workbench distributes a certified release. The release is made here. Each release page shows this record as it ran for that build.</p>
        <ol className="m-0 p-0 list-none grid gap-1 sm:grid-cols-2">
          {PRODUCTION_SYSTEM.map((s, i) => (
            <li key={s.stage} className="surface-inset p-2 text-[12.5px]"><span className="mono" style={{ color: 'var(--text-muted)' }}>{String(i + 1).padStart(2, '0')}</span> <span style={{ color: 'var(--text-heading)' }}>{s.label}</span><div style={{ color: 'var(--text-secondary)' }}>{s.meaning}</div></li>
          ))}
        </ol>
      </Section>

      <Section title="The value proposition, kept concrete" id="pm-value">
        <ul className="m-0 pl-4 text-[13px] flex flex-col gap-1">
          {VALUE_PROPOSITION.map((v) => <li key={v}>{v}</li>)}
        </ul>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Where each is demonstrated: <Link href="/stream" style={{ color: 'var(--info)' }}>as-of answers and bounds</Link> · <Link href="/releases" style={{ color: 'var(--info)' }}>certified release manifests</Link> · <Link href="/retractions" style={{ color: 'var(--info)' }}>push retractions</Link> · <Link href="/api" style={{ color: 'var(--info)' }}>provenance and rights on every delivered record, and automating against the feed</Link>.</p>
      </Section>

      <Section title="Domain products" id="pm-domains">
        <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-3">
          {DOMAIN_PRODUCTS.map((d) => (
            <li key={d.id} className="surface-inset p-3 text-[12.5px]" style={{ borderStyle: d.enabled ? 'solid' : 'dashed' }}>
              <div className="font-medium" style={{ color: d.enabled ? 'var(--text-heading)' : 'var(--text-muted)' }}>{d.label} {!d.enabled && <span className="label-sm">slot</span>}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{d.scope}</div>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Payload OS is the shared production and assurance layer, not a fourth public API. A buyer purchases a domain product and a corpus release.</p>
      </Section>

      <Section title={PRINCIPAL_CAPITAL.title} id="pm-principal">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{PRINCIPAL_CAPITAL.framing}</p>
        <ul className="m-0 pl-4 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{PRINCIPAL_CAPITAL.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{PRESENCE_LABEL[PRINCIPAL_CAPITAL.presence]}. {PRINCIPAL_CAPITAL.note} See the rights matrix on any <Link href="/releases" style={{ color: 'var(--info)' }}>release</Link>.</p>
      </Section>
    </div>
  );
}
