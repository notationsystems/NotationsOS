export function Section({ title, children, aside, id, className = '' }: { title: string; children: React.ReactNode; aside?: React.ReactNode; id?: string; className?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} id={id} className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={id ? `${id}-h` : undefined} className="label m-0">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
