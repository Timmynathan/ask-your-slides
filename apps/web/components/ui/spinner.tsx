export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 shrink-0 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Button content: label, or spinner + busy label. Keeps the button's width steady-ish. `arrow` adds a
 *  small → after the label. */
export function BusyLabel({ busy, label, busyLabel, arrow = false }: { busy: boolean; label: string; busyLabel: string; arrow?: boolean }) {
  return busy ? (
    <span className="inline-flex items-center justify-center gap-2">
      <Spinner />
      {busyLabel}
    </span>
  ) : arrow ? (
    <span className="inline-flex items-center justify-center gap-2">
      {label}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  ) : (
    <>{label}</>
  );
}
