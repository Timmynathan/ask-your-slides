// Black line drawings for the hero's bottom corners (original artwork; the reference site uses the
// same idea: outline doodles with a few solid fills). Pure SVG so they stay crisp and weigh nothing.

const ink = { stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

/** Bottom-right: a student at a laptop, a mug, a floating slide and a cited-answer bubble. */
export function StudyDeskDoodle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 380 300" className={className} aria-hidden>
      {/* floating slide with a play button, tilted */}
      <g transform="rotate(-7 300 52)">
        <rect x="262" y="24" width="78" height="54" rx="6" {...ink} />
        <circle cx="301" cy="51" r="12" {...ink} />
        <path d="M297 45 L307 51 L297 57 Z" fill="currentColor" />
      </g>
      {/* answer bubble with a citation chip */}
      <g transform="rotate(4 82 76)">
        <path d="M40 52 h84 a8 8 0 0 1 8 8 v30 a8 8 0 0 1 -8 8 h-60 l-12 12 v-12 h-12 a8 8 0 0 1 -8 -8 v-30 a8 8 0 0 1 8 -8 Z" {...ink} />
        <path d="M52 66 h56 M52 76 h38" {...ink} />
        <rect x="94" y="72" width="26" height="9" rx="4.5" fill="currentColor" />
      </g>
      {/* little sparkle */}
      <path d="M226 22 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" fill="currentColor" />

      {/* student */}
      <path d="M196 96 c-14 -6 -8 -30 8 -28 c4 -14 26 -12 26 4 c12 2 12 20 0 24 Z" fill="currentColor" />
      <circle cx="208" cy="118" r="24" {...ink} fill="var(--page)" />
      <path d="M190 104 c8 -10 30 -10 38 2 c-10 -4 -24 -4 -38 -2 Z" fill="currentColor" />
      <circle cx="200" cy="120" r="2.2" fill="currentColor" />
      <circle cx="216" cy="120" r="2.2" fill="currentColor" />
      <path d="M202 130 q6 5 12 0" {...ink} />
      <path d="M150 230 c2 -48 22 -78 58 -78 c34 0 52 26 58 70" {...ink} fill="var(--page)" />
      <path d="M166 196 c18 10 40 16 62 14" {...ink} />

      {/* laptop seen from the side, solid base */}
      <path d="M110 160 L176 168 L184 236 L118 228 Z" {...ink} fill="var(--page)" />
      <path d="M140 196 a6 6 0 1 0 0.1 0" {...ink} />
      <path d="M96 238 L250 238 L262 246 L90 246 Z" fill="currentColor" />

      {/* mug */}
      <path d="M30 196 h40 v34 a10 10 0 0 1 -10 10 h-20 a10 10 0 0 1 -10 -10 Z" {...ink} />
      <path d="M70 204 h6 a8 8 0 0 1 0 16 h-6" {...ink} />
      <path d="M40 186 q4 -8 0 -14 M52 186 q4 -8 0 -14" {...ink} />
      <ellipse cx="50" cy="246" rx="30" ry="5" fill="currentColor" />

      {/* desk line */}
      <path d="M8 262 H372" {...ink} />
    </svg>
  );
}

/** Bottom-left: a stack of books, a pencil and a couple of sparkles. */
export function BooksDoodle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 200" className={className} aria-hidden>
      <path d="M40 150 h150 v24 h-150 Z" {...ink} />
      <path d="M52 150 v24 M178 150 v24" {...ink} />
      <path d="M58 124 h132 v26 h-132 Z" {...ink} transform="rotate(-3 124 137)" />
      <path d="M48 98 h120 v26 h-120 Z" {...ink} transform="rotate(4 108 111)" />
      <path d="M66 100 v24" {...ink} transform="rotate(4 108 111)" />
      <rect x="150" y="96" width="10" height="34" fill="currentColor" transform="rotate(4 108 111)" />
      {/* pencil leaning on the stack */}
      <g transform="rotate(-38 208 120)">
        <rect x="200" y="70" width="14" height="78" rx="2" {...ink} />
        <path d="M200 148 L207 166 L214 148 Z" {...ink} />
        <path d="M205 160 L207 166 L209 160 Z" fill="currentColor" />
        <rect x="200" y="62" width="14" height="10" rx="2" fill="currentColor" />
      </g>
      <path d="M30 72 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" fill="currentColor" />
      <path d="M100 40 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill="currentColor" />
      <path d="M14 186 H246" {...ink} />
    </svg>
  );
}
