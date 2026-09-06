import type { Metadata } from 'next';
import { ClearanceInspector } from '@/components/compute/ClearanceInspector';
import { buildClearancePreview } from '@/compute/clearance-demo';

export const metadata: Metadata = { title: 'Clearance measurement design' };

/** Pure synthetic preview: no retained acquisitions, operator histories or provider calls. */
export default function ClearancePage() {
  return <ClearanceInspector {...buildClearancePreview()} />;
}
