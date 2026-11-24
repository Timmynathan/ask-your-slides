// Small plan icons (moved out of plan-cards.tsx when the comparison cards were removed, 24 Nov 2026).
export function CheckIcon({ label }: { label?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className="mt-0.5 shrink-0 text-brand dark:text-pau-400" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function LockIcon({ label }: { label?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" className="shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
