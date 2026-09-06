import type { Metadata } from 'next';
import { FIXTURE_DISPATCH_STREAM } from '@/fixtures/caravan/dispatchLiability';
import { DispatchLiabilityWorkbench } from '@/components/dispatch/DispatchLiabilityWorkbench';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';

export const metadata: Metadata = {
  title: 'Algorithmic Dispatch Liability & Streaming Attestation',
  description: 'Bitemporal evidentiary archive answering what the automated dispatch system knew at Tk under broker liability doctrine.',
};

export default function DispatchLiabilityPage() {
  return (
    <>
      <FixtureBanner note="Algorithmic Dispatch Liability Wedge · Streaming Event Notary · Miller v. C.H. Robinson Safe Harbor" />
      <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-4">
        <div>
          <h1 className="m-0 text-[20px] font-semibold tracking-tight" style={{ color: 'var(--text-heading)' }}>
            Algorithmic Dispatch Liability & Streamed Notary Archive
          </h1>
          <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            The evidentiary notary for 3PLs, automated freight brokerages, and casualty underwriters.
            Answers the core product liability discovery query: <em>&ldquo;What did the automated dispatch system know at knowledge cutoff Tk?&rdquo;</em>
            Continuous SHA-256 event chaining proves pre-existence and defeats retroactive negligence claims.
          </p>
        </div>

        <DispatchLiabilityWorkbench stream={FIXTURE_DISPATCH_STREAM} />
      </div>
    </>
  );
}
