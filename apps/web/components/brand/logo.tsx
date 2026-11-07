// Ask Your Slides mark: a black AI sparkle (a large four-point star and a small one). One colour, so
// it works as the favicon (app/icon.svg is the same drawing) and at any size.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0 text-black dark:text-[#faf9f5]">
      <path d="M14 4.5Q15.4 15.6 26.5 17Q15.4 18.4 14 29.5Q12.6 18.4 1.5 17Q12.6 15.6 14 4.5Z" fill="currentColor" />
      <path d="M26 1.5Q26.6 5.4 30.5 6Q26.6 6.6 26 10.5Q25.4 6.6 21.5 6Q25.4 5.4 26 1.5Z" fill="currentColor" />
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
