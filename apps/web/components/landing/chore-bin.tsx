// "Leave the busywork behind": the chores a general chatbot needs (download the PDF, screenshot the
// slide, upload it, start a new chat) drop into a bin one after another. Black line art to match
// the hero drawings. Pure CSS animation (globals.css: .bin-item, .bin-lid); still for reduced motion.
//
// Deliberately no third-party logos: the comparison names ChatGPT, Claude and Gemini in text, but
// their trademarks are not used, least of all being thrown away.

const ink = { stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

type Item = { x: number; y: number; delay: number; label: string; draw: React.ReactNode };

// Each item starts at (x, y) and falls into the bin's opening at (150, 128).
const ITEMS: Item[] = [
  {
    x: 30, y: 18, delay: 0, label: "PDF",
    draw: (
      <>
        <path d="M0 0 h26 l12 12 v36 h-38 Z" {...ink} fill="var(--page)" />
        <path d="M26 0 v12 h12" {...ink} />
        <rect x="4" y="22" width="30" height="13" rx="3" fill="currentColor" />
        <text x="19" y="32" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--page)" fontFamily="Inter, sans-serif">PDF</text>
      </>
    ),
  },
  {
    x: 92, y: 2, delay: 2, label: "screenshot",
    draw: (
      <>
        <rect x="0" y="4" width="46" height="34" rx="4" {...ink} fill="var(--page)" />
        <path d="M5 32 l11 -12 8 8 6 -6 11 10" {...ink} />
        <circle cx="34" cy="13" r="3.2" fill="currentColor" />
        <path d="M-5 -2 h7 M-5 -2 v7 M51 44 h-7 M51 44 v-7" {...ink} />
      </>
    ),
  },
  {
    x: 172, y: 4, delay: 4, label: "upload",
    draw: (
      <>
        <path d="M10 36 a11 11 0 0 1 1 -22 a14 14 0 0 1 27 4 a9 9 0 0 1 0 18 Z" {...ink} fill="var(--page)" />
        <path d="M24 32 v-14 M18 23 l6 -6 6 6" {...ink} />
      </>
    ),
  },
  {
    x: 232, y: 22, delay: 6, label: "new chat",
    draw: (
      <>
        <path d="M2 0 h36 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-24 l-9 8 v-8 h-3 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6 Z" {...ink} fill="var(--page)" />
        <path d="M20 9 v14 M13 16 h14" {...ink} />
      </>
    ),
  },
];

export function ChoreBin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 230" className={className} role="img" aria-label="A PDF, a screenshot, an upload and a new chat dropping into a bin">
      {/* bin body with ridges */}
      <path d="M106 128 L118 214 H182 L194 128" {...ink} fill="var(--page)" />
      <path d="M133 142 L136 202 M150 142 V202 M167 142 L164 202" {...ink} />
      <path d="M96 222 H204" {...ink} />
      {/* lid: flips open on its left hinge when something arrives */}
      <g className="bin-lid">
        <path d="M100 122 H200" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <path d="M138 122 v-7 h24 v7" {...ink} />
      </g>
      {ITEMS.map((it) => (
        <g
          key={it.label}
          className="bin-item"
          style={
            {
              "--dx": `${150 - (it.x + 20)}px`,
              "--dy": `${128 - (it.y + 20)}px`,
              animationDelay: `${it.delay}s`,
            } as React.CSSProperties
          }
        >
          <g transform={`translate(${it.x} ${it.y})`}>{it.draw}</g>
        </g>
      ))}
    </svg>
  );
}
