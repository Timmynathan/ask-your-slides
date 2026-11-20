// The right half of /sign-up and /sign-in (owner, 20 Nov 2026): a headline, a small line-drawn study
// room where the study partners revise at one long desk while feature tags float above them and Tobi
// hops across the floor, a one-line promise, and who it's for. Layout after the owner's reference;
// the drawing, wording and animation are ours. Every claim is true: no grade or rating figures, and
// no university crest (the app is independent of PAU; see the footer).
import { Mascot } from "@/components/mascot/mascot";

const INK = "#0e1664";

function Laptop({ x }: { x: number }) {
  // Seen from behind: the lid, the hinge and a little light from the screen.
  return (
    <g>
      <path d={`M${x - 26} 196 L${x - 22} 168 H${x + 22} L${x + 26} 196 Z`} fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x} cy={182} r="3" fill={INK} />
    </g>
  );
}

export function AuthAside({ signUp }: { signUp: boolean }) {
  const seats = [
    { partner: "ada" as const, x: 170 },
    { partner: "musa" as const, x: 280 },
    { partner: "zara" as const, x: 390 },
  ];
  const tags = [
    { label: "Summary", x: 168, delay: "0s" },
    { label: "Quiz me", x: 282, delay: "0.8s" },
    { label: "Past questions", x: 392, delay: "1.6s" },
  ];
  return (
    <aside className="relative hidden flex-col items-center justify-between overflow-hidden bg-[#f5f8fc] px-10 py-14 lg:flex" aria-hidden>
      <p className="max-w-lg text-center font-heading text-[28px] leading-snug text-ink">
        <span className="rounded-md bg-[#cfe3fb] px-1.5 italic [box-decoration-break:clone]">Every answer</span> comes with the exact slide
        it&apos;s from
      </p>

      {/* The study room: back layer (room), the partners, front layer (desk and laptops). */}
      <div className="relative h-[340px] w-[560px] shrink-0">
        <svg viewBox="0 0 560 340" className="absolute inset-0 h-full w-full" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="280" cy="292" rx="262" ry="36" />
          {/* Bookshelf */}
          <rect x="18" y="40" width="88" height="196" />
          {[88, 136, 184].map((y) => (
            <path key={y} d={`M18 ${y} H106`} />
          ))}
          {[26, 33, 40, 50, 57, 70, 78, 92].map((x, i) => (
            <path key={`a${x}`} d={`M${x} ${84 - (i % 3) * 4} V${52 + (i % 2) * 6}`} />
          ))}
          {[24, 31, 44, 52, 60, 74, 84, 96].map((x, i) => (
            <path key={`b${x}`} d={`M${x} ${132 - (i % 2) * 3} V${100 + (i % 3) * 5}`} />
          ))}
          {[28, 36, 48, 64, 72, 88].map((x, i) => (
            <path key={`c${x}`} d={`M${x} ${180} V${148 + (i % 3) * 6}`} />
          ))}
          {/* Plant */}
          <path d="M124 236 h26 l-4 -22 h-18 Z" />
          <path d="M137 214 c-10 -18 -16 -30 -8 -44 M137 214 c4 -20 12 -30 22 -34 M137 214 c-2 -16 2 -26 0 -40" />
          {/* Windows */}
          {[440, 476, 512].map((x) => (
            <g key={x}>
              <path d={`M${x} 46 L${x + 28} 38 V136 L${x} 144 Z`} />
              <path d={`M${x + 8} 72 l10 -12 M${x + 8} 84 l14 -16`} strokeWidth="1.4" />
            </g>
          ))}
        </svg>

        {seats.map((s) => (
          <div key={s.partner} className="absolute" style={{ left: s.x - 36, top: 112 }}>
            <Mascot partner={s.partner} size={72} />
          </div>
        ))}

        {tags.map((t) => (
          <span
            key={t.label}
            className="auth-tag absolute -translate-x-1/2 rounded-md border border-[#0e1664]/80 bg-[#fff6c2] px-2 py-0.5 text-[11px] font-medium text-ink"
            style={{ left: t.x, top: 70, animationDelay: t.delay }}
          >
            {t.label}
          </span>
        ))}

        <svg viewBox="0 0 560 340" className="pointer-events-none absolute inset-0 h-full w-full" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {seats.map((s) => (
            <Laptop key={s.partner} x={s.x} />
          ))}
          {/* Desk */}
          <path d="M96 196 H470 V206 H96 Z" fill={INK} />
          <path d="M112 206 V284 M454 206 V284 M196 206 V262 M370 206 V262" />
          {/* An open book and a cup */}
          <path d="M108 194 l14 -6 14 6 M122 188 v6" />
          <path d="M440 194 v-12 h12 v12 Z M452 186 h4 v5 h-4" />
        </svg>

        {/* Tobi hops across the floor now and then. */}
        <div className="auth-hop-x absolute" style={{ top: 238 }}>
          <div className="auth-hop-y">
            <Mascot partner="tobi" size={54} />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-10">
        <p className="max-w-sm text-center font-heading text-[22px] leading-snug text-ink">
          {signUp ? (
            <>
              Your PAU slides are already here.
              <br />
              Ask, and we&apos;ll explain them.
            </>
          ) : (
            <>
              Welcome back.
              <br />
              Let&apos;s pick up where you stopped.
            </>
          )}
        </p>
        <div className="text-center">
          <p className="text-sm text-muted">Built for students at</p>
          <p className="mt-2 font-heading text-[24px] tracking-tight text-ink">Pan-Atlantic University</p>
        </div>
      </div>
    </aside>
  );
}
