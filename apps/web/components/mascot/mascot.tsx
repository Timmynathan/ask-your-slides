// The three study partners as illustrated avatars (original artwork, drawn in SVG so they stay
// crisp at any size and can move: blink, bob, think, smile). Colours are literal hex values
// because they are part of each character, not theme tokens.
import type { PartnerId } from "@/lib/partners";

export type Mood = "idle" | "happy" | "thinking";

interface Props {
  partner: PartnerId;
  size?: number;
  mood?: Mood;
  animated?: boolean;
  className?: string;
  title?: string;
}

const LOOK = {
  tobi: { bg: "#dbeafe", skin: "#7a4a2e", skinShade: "#653c25", hair: "#1c1410", top: "#2563eb", topShade: "#1d4ed8", spark: "#2563eb" },
  ada: { bg: "#f9e7ff", skin: "#9a5f3a", skinShade: "#824e2f", hair: "#22140f", top: "#c05cdf", topShade: "#a845c7", spark: "#8a00b5" },
  musa: { bg: "#fef3c7", skin: "#5e3721", skinShade: "#4d2d1b", hair: "#2a2522", top: "#b45309", topShade: "#92400e", spark: "#b45309" },
} as const;

export function Mascot({ partner, size = 48, mood = "idle", animated = true, className = "", title }: Props) {
  const c = LOOK[partner];
  const look = mood === "thinking" ? "translate(1.2 -1.6)" : "";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={title ?? `${partner === "musa" ? "Dr. Musa" : partner[0].toUpperCase() + partner.slice(1)}, your study partner`}
      className={`shrink-0 ${animated ? "mascot-alive" : ""} ${mood === "thinking" ? "mascot-thinking" : ""} ${className}`}
    >
      <defs>
        <clipPath id={`clip-${partner}`}>
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="60" fill={c.bg} />
      <g clipPath={`url(#clip-${partner})`}>
        <g className="mascot-bob">
          {/* back hair (behind head) */}
          {partner === "ada" && (
            <>
              <path d="M37 50 C33 70 34 92 40 104 L47 104 C43 88 42 70 44 54 Z" fill={c.hair} />
              <path d="M83 50 C87 70 86 92 80 104 L73 104 C77 88 78 70 76 54 Z" fill={c.hair} />
              <circle cx="60" cy="21" r="13" fill={c.hair} />
              <path d="M50 16 q10 -6 20 0 M49 22 q11 -6 22 0 M51 28 q9 -5 18 0" stroke="#3a2419" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            </>
          )}

          {/* body */}
          <path d="M14 122 C18 94 38 84 60 84 C82 84 102 94 106 122 Z" fill={c.top} />
          {partner === "tobi" && (
            <>
              {/* hoodie strings + headphones resting on the neck */}
              <path d="M53 88 l-2 16 M67 88 l2 16" stroke="#e0e7ff" strokeWidth="2" strokeLinecap="round" />
              <path d="M38 86 C38 72 82 72 82 86" stroke="#0f172a" strokeWidth="5" fill="none" strokeLinecap="round" />
              <rect x="31" y="80" width="12" height="15" rx="5" fill="#0f172a" />
              <rect x="77" y="80" width="12" height="15" rx="5" fill="#0f172a" />
              <rect x="33.5" y="83" width="7" height="9" rx="3" fill="#60a5fa" />
              <rect x="79.5" y="83" width="7" height="9" rx="3" fill="#60a5fa" />
            </>
          )}
          {partner === "ada" && <path d="M47 86 C52 96 68 96 73 86" stroke={c.topShade} strokeWidth="3" fill="none" />}
          {partner === "musa" && (
            <>
              <path d="M48 85 L60 104 L72 85 Z" fill="#fffbeb" />
              <path d="M48 85 L55 93 L60 86 M72 85 L65 93 L60 86" fill="#f1e7cf" stroke="#e5d6b3" strokeWidth="0.8" />
              <path d="M44 88 L60 112 M76 88 L60 112" stroke={c.topShade} strokeWidth="3" />
            </>
          )}

          {/* neck */}
          <path d="M51 68 h18 v14 c-4 4 -14 4 -18 0 Z" fill={c.skinShade} />

          {/* ears + head */}
          <ellipse cx="37.5" cy="55" rx="4.5" ry="6.5" fill={c.skinShade} />
          <ellipse cx="82.5" cy="55" rx="4.5" ry="6.5" fill={c.skinShade} />
          <ellipse cx="60" cy="52" rx="22" ry="25" fill={c.skin} />

          {/* hair on top */}
          {partner === "tobi" && (
            <>
              <path d="M38 50 C36 30 50 24 60 24 C72 24 84 30 82 50 C80 40 72 34 60 34 C48 34 40 40 38 50 Z" fill={c.hair} />
              <path d="M44 30 q16 -9 32 0" stroke="#3a2a22" strokeWidth="1.2" fill="none" opacity="0.6" />
            </>
          )}
          {partner === "ada" && <path d="M38 52 C35 32 48 26 60 26 C72 26 85 32 82 52 C79 41 71 35 60 35 C49 35 41 41 38 52 Z" fill={c.hair} />}
          {partner === "musa" && (
            <>
              <path d="M38 48 C37 32 49 27 60 27 C71 27 83 32 82 48 C79 39 71 35 60 35 C49 35 41 39 38 48 Z" fill={c.hair} />
              <path d="M38 48 C38 43 40 40 42 39 L42 50 Z M82 48 C82 43 80 40 78 39 L78 50 Z" fill="#a8a29e" />
              {/* beard + moustache */}
              <path d="M39 58 C40 80 52 82 60 82 C68 82 80 80 81 58 C77 70 69 74 60 74 C51 74 43 70 39 58 Z" fill="#6f6a65" />
              <path d="M52 64.5 C55 62 65 62 68 64.5 C64 66 56 66 52 64.5 Z" fill="#57524d" />
            </>
          )}

          {/* eyes */}
          <g className="mascot-eyes">
            <ellipse cx="51" cy="53" rx="4" ry="4.4" fill="#fff" />
            <ellipse cx="69" cy="53" rx="4" ry="4.4" fill="#fff" />
            <g transform={look}>
              <circle cx="51.5" cy="53.5" r="2.4" fill="#1b1b1b" />
              <circle cx="69.5" cy="53.5" r="2.4" fill="#1b1b1b" />
              <circle cx="52.4" cy="52.6" r="0.8" fill="#fff" />
              <circle cx="70.4" cy="52.6" r="0.8" fill="#fff" />
            </g>
          </g>
          {/* brows */}
          <path
            d={mood === "thinking" ? "M46 45.5 q5 -3 9 -0.5 M65 44.5 q5 -2 9 1" : "M46 46 q5 -2.5 9 0 M65 46 q5 -2.5 9 0"}
            stroke={partner === "musa" ? "#4a4440" : c.hair}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />

          {/* glasses */}
          {partner === "ada" && (
            <g stroke="#3b2a20" strokeWidth="1.6" fill="none">
              <circle cx="51" cy="53" r="6.5" />
              <circle cx="69" cy="53" r="6.5" />
              <path d="M57.5 53 h5 M44.5 52 l-5 -2 M75.5 52 l5 -2" />
            </g>
          )}
          {partner === "musa" && (
            <g stroke="#2a2522" strokeWidth="1.6" fill="none">
              <rect x="44" y="48.5" width="14" height="10" rx="3" />
              <rect x="62" y="48.5" width="14" height="10" rx="3" />
              <path d="M58 53 h4 M44 52 l-5 -1.5 M76 52 l5 -1.5" />
            </g>
          )}

          {/* nose + mouth */}
          <path d="M60 56 q-2.5 5 0 6.5" stroke={c.skinShade} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {mood === "happy" ? (
            <path d="M51.5 66 q8.5 10 17 0 Z" fill="#3b1d12" />
          ) : mood === "thinking" ? (
            <path d="M55.5 68 q4.5 -1.5 9 0.5" stroke="#3b1d12" strokeWidth="2" fill="none" strokeLinecap="round" />
          ) : (
            <path d="M53 66.5 q7 5.5 14 0" stroke="#3b1d12" strokeWidth="2" fill="none" strokeLinecap="round" />
          )}
          {partner === "ada" && (
            <>
              <circle cx="37.5" cy="63" r="2" fill="#f5b301" />
              <circle cx="82.5" cy="63" r="2" fill="#f5b301" />
            </>
          )}
        </g>
      </g>

      {/* the "AI" spark: human partner, AI underneath */}
      <g className="mascot-spark">
        <path d="M97 13 L99.6 20.4 L107 23 L99.6 25.6 L97 33 L94.4 25.6 L87 23 L94.4 20.4 Z" fill={c.spark} />
        <circle cx="107" cy="12" r="2.2" fill={c.spark} opacity="0.7" />
      </g>
    </svg>
  );
}
