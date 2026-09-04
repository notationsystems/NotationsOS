'use client';

/**
 * An application error is not a refusal and is never rendered as one. It has
 * no status, no invariant, no remediation; it says that the instrument
 * failed and offers to try again.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-6 max-w-[720px] mx-auto flex flex-col gap-3" role="alert">
      <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>The instrument failed to render</h1>
      <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>This is an application error, not a ruling. No case state changed.</p>
      {error.digest && <p className="m-0 text-[12px]"><span className="label-sm">Error digest</span> <span className="hash">{error.digest}</span></p>}
      <p className="m-0"><button type="button" className="btn" onClick={reset}>Try again</button></p>
    </div>
  );
}
