import Link from 'next/link';
import { Digest } from './ManifestCommitment';

export function ProfileReference({ profileId, version, registerDigest }: { profileId: string; version: string; registerDigest?: string }) {
  return (
    <dl className="kv" data-testid="profile-reference">
      <dt>Profile</dt>
      <dd>
        <Link href={`/profiles/${encodeURIComponent(profileId)}`} className="id" style={{ color: 'var(--info)' }}>{profileId}</Link>
      </dd>
      <dt>Version</dt>
      <dd><span className="ver">{version}</span></dd>
      <dt>Register digest</dt>
      <dd><Digest value={registerDigest} /></dd>
    </dl>
  );
}
