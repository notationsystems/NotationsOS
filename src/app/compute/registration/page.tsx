import type { Metadata } from 'next';
import { RegistrationAccessInspector } from '@/components/compute/RegistrationAccessInspector';
import { buildRegistrationAccessPreview } from '@/compute/registration-access-demo';

export const metadata: Metadata = { title: 'Registration and access' };

/** Pure synthetic preview: no retained acquisitions, operator histories or provider calls. */
export default function RegistrationAccessPage() {
  return <RegistrationAccessInspector {...buildRegistrationAccessPreview()} />;
}
