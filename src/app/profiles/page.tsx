import type { Metadata } from 'next';
import Link from 'next/link';
import { getCaseSource } from '@/adapter/caseSource';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { DOMAINS } from '@/domain/domains';

export const metadata: Metadata = { title: 'Profiles' };

export default async function ProfilesPage() {
  const source = getCaseSource();
  const profiles = await source.listProfiles();
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={source.origin.label} />}
      <div className="p-3 sm:p-4 max-w-[1100px] mx-auto w-full flex flex-col gap-4">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Admission profiles</h1>
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {profiles.map((p) => (
            <li key={p.profileId} className="surface p-3 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap"><Link href={`/profiles/${encodeURIComponent(p.profileId)}`} className="font-medium" style={{ color: 'var(--text-heading)' }}>{p.title}</Link><span className="ver" style={{ color: 'var(--text-muted)' }}>{p.version}</span><span className="label-sm">{p.domain}</span></div>
              <div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{p.recognition}</div>
              <div className="text-[12px]"><Digest label="register" value={p.registerDigest} /></div>
            </li>
          ))}
        </ul>
        <section aria-label="Vertical module slots" className="flex flex-col gap-2">
          <h2 className="label m-0">Vertical module slots</h2>
          <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-3">
            {DOMAINS.map((d) => (
              <li key={d.id} className="surface-inset p-3 text-[12.5px]" style={{ opacity: d.enabled ? 1 : 0.7 }}>
                <div className="font-medium" style={{ color: d.enabled ? 'var(--text-heading)' : 'var(--text-muted)' }}>{d.label} {!d.enabled && <span className="label-sm">slot</span>}</div>
                <div style={{ color: 'var(--text-secondary)' }}>{d.scope}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
