import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCaseSource } from '@/adapter/caseSource';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { Section } from '@/components/primitives/Section';
import { fmtTolerance, fmtUtc } from '@/lib/format';
import type { AuthorityClass, InvariantDefinition } from '@/domain/types';

export async function generateMetadata({ params }: { params: Promise<{ profileId: string }> }): Promise<Metadata> {
  const { profileId } = await params;
  return { title: `Profile · ${decodeURIComponent(profileId)}` };
}

const AUTHORITY: Array<{ id: AuthorityClass; title: string; meaning: string }> = [
  { id: 'CORE_DISTRIBUTION', title: 'Core distribution requirements', meaning: 'Apply to every Payload result regardless of domain: identity, knowledge time, claim strength, manifest completeness.' },
  { id: 'DOMAIN_PROFILE', title: 'Domain-profile requirements', meaning: 'Specific to this domain profile and its use codes. These are the rules a real brokerage case would replace.' },
  { id: 'GOVERNANCE_POLICY', title: 'Governance-policy requirements', meaning: 'Disclosure, assurance and attribution policy. They govern how a ruling may be stated and shared.' },
];

const MATURITY_MEANING: Record<InvariantDefinition['implementation'], string> = {
  production: 'Validated in production use',
  beta: 'Implemented; correctness checked internally against fixtures',
  experimental: 'Implemented; not yet validated',
  research: 'Design intent; not validated',
  planned: 'Not implemented',
};

export default async function ProfilePage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const source = getCaseSource();
  const profile = await source.getProfile(decodeURIComponent(profileId));
  if (!profile) notFound();
  return (
    <>
      {profile.fixture_only && <FixtureBanner note="Demonstration profile. Domain rules are fixture data and are commercially provisional." />}
      <div className="p-3 sm:p-5 max-w-[1100px] mx-auto w-full flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap"><span className="label-sm">Admission profile</span><span className="id" style={{ color: 'var(--text-secondary)' }}>{profile.profileId}</span><span className="ver" style={{ color: 'var(--text-muted)' }}>{profile.version}</span></div>
          <h1 className="m-0 text-[20px] font-semibold" style={{ color: 'var(--text-heading)' }}>{profile.title}</h1>
          <p className="m-0 text-[13px] px-3 py-2 rounded-[var(--radius-md)] border" style={{ borderColor: 'var(--border-accent)', color: 'var(--text-primary)' }} data-testid="profile-recognition"><span className="label-sm mr-2" style={{ color: 'var(--accent-strong)' }}>Standing</span>{profile.recognition}</p>
          <dl className="kv">
            <dt>Domain</dt><dd>{profile.domain}</dd>
            <dt>Effective from</dt><dd className="ts">{fmtUtc(profile.effectiveFrom)}</dd>
            <dt>Register digest</dt><dd><Digest value={profile.registerDigest} /></dd>
            <dt>Invariants</dt><dd className="mono">{profile.invariants.length}</dd>
          </dl>
        </header>

        <Section title="Use codes and default tolerances" id="pf-uses">
          <table className="ledger-table text-[12.5px]">
            <thead><tr><th scope="col">Use code</th><th scope="col">Purpose</th><th scope="col">Default tolerance</th></tr></thead>
            <tbody>{profile.useCodes.map((u) => <tr key={u.useCode}><td className="id">{u.useCode}</td><td>{u.purpose}</td><td className="mono">{fmtTolerance(u.defaultTolerance)}{u.defaultTolerance?.appliesToPredicate && <span style={{ color: 'var(--text-muted)' }}> on {u.defaultTolerance.appliesToPredicate}</span>}</td></tr>)}</tbody>
          </table>
        </Section>

        {AUTHORITY.map((a) => {
          const list = profile.invariants.filter((i) => i.authorityClass === a.id);
          return (
            <Section key={a.id} title={`${a.title} (${list.length})`} id={`pf-${a.id.toLowerCase()}`}>
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{a.meaning}</p>
              <div className="surface overflow-x-auto" tabIndex={0}>
                <table className="ledger-table text-[12.5px]" aria-label={a.title}>
                  <thead><tr><th scope="col">Identifier</th><th scope="col">Title and purpose</th><th scope="col">Applicability</th><th scope="col">Input requirements</th><th scope="col">Refusal code</th><th scope="col">Implementation</th></tr></thead>
                  <tbody>
                    {list.map((i) => (
                      <tr key={i.invariantId} id={i.invariantId}>
                        <td><span className="id">{i.invariantId}</span><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{i.deterministic ? 'deterministic' : 'non-deterministic'}</div></td>
                        <td><div style={{ color: 'var(--text-heading)' }}>{i.title}</div><div style={{ color: 'var(--text-secondary)' }}>{i.purpose}</div></td>
                        <td>{i.applicability}</td>
                        <td><ul className="m-0 pl-4">{i.inputRequirements.map((r) => <li key={r}>{r}</li>)}</ul></td>
                        <td className="id">{i.refusalCode}</td>
                        <td><span className="mono">{i.implementation}</span><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{MATURITY_MEANING[i.implementation]}</div><div className="text-[11px] ver" style={{ color: 'var(--text-muted)' }}>{profile.version}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          );
        })}
      </div>
    </>
  );
}
