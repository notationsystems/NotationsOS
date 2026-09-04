/** Every fixture-backed screen says so. This banner is not decorative. */
export function FixtureBanner({ note }: { note?: string }) {
  return (
    <div
      role="note"
      aria-label="Demonstration fixture"
      className="flex items-start gap-2 px-3 py-1.5 text-[12px] border-b"
      style={{ background: 'rgba(var(--accent-rgb), 0.06)', borderColor: 'rgba(var(--accent-rgb), 0.25)', color: 'var(--text-secondary)' }}
    >
      <span className="label-sm shrink-0" style={{ color: 'var(--accent-strong)' }}>fixture_only: true</span>
      <span>{note ?? 'Demonstration data. Synthetic, deterministic and committed. Not a production endpoint.'}</span>
    </div>
  );
}
