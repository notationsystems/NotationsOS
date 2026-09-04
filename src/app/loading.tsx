export default function Loading() {
  return (
    <div className="p-6 max-w-[720px] mx-auto" role="status" aria-live="polite">
      <p className="m-0 text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading case data from the current source…</p>
    </div>
  );
}
