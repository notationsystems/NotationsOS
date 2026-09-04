import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="p-6 max-w-[720px] mx-auto flex flex-col gap-3">
      <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Not found</h1>
      <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>No case, ruling or profile with that identifier exists in the current source. This is an absence, not a refusal: nothing was ruled on.</p>
      <p className="m-0"><Link href="/cases" className="btn">Back to the case queue</Link></p>
    </div>
  );
}
