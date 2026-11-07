// Ask Your Slides mark: a single black slide with a speech tail and a small spark. One colour, so
// it works as the favicon (app/icon.svg is the same drawing) and at any size.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0 text-black dark:text-[#faf9f5]">
      <path d="M7 4h18a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5H13l-6 5v-5a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5Z" fill="currentColor" />
      <rect x="7.5" y="11" width="11" height="2.4" rx="1.2" className="fill-white dark:fill-[#191919]" />
      <rect x="7.5" y="16" width="7" height="2.4" rx="1.2" className="fill-white dark:fill-[#191919]" />
      <path d="M23.5 9.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" className="fill-white dark:fill-[#191919]" />
    </svg>
  );
}

/** Brand name: Inter 400, 16/24, black (brand spec). */
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="type-menu">Ask Your Slides</span>
    </span>
  );
}
