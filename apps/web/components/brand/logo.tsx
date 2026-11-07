// Ask Your Slides mark: a stack of slides with a speech tail and the partner "spark".
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect x="5" y="3" width="21" height="16" rx="4" fill="#f5d5ff" />
      <rect x="3" y="8" width="23" height="17" rx="4" fill="#191919" />
      <path d="M8 25 L8 30 L13.5 25 Z" fill="#191919" />
      <rect x="7" y="13" width="10" height="2" rx="1" fill="#faf9f5" />
      <rect x="7" y="17.5" width="14" height="2" rx="1" fill="#faf9f5" opacity="0.6" />
      <path d="M26 2 L27.2 5.3 L30.5 6.5 L27.2 7.7 L26 11 L24.8 7.7 L21.5 6.5 L24.8 5.3 Z" fill="#c05cdf" />
    </svg>
  );
}

export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="font-heading text-[1.05rem] font-semibold tracking-tight text-ink">Ask Your Slides</span>
    </span>
  );
}
