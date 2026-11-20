// The right half of /sign-up and /sign-in (owner, 20 Nov 2026): a headline, a small animated scene,
// and who it's for. The scene: two rooms side by side, a girl reading in her dorm and a student at a
// library desk. Zara hops from the end of the bed to the library floor and back; each time she lands she says "Hi!", the room lights
// up and AI sparkles burst around the student. One 9-second loop in CSS (globals.css, "as-");
// reduced motion shows the first greeting, still. Original drawing in the app's navy line style.
import { Mascot } from "@/components/mascot/mascot";

const INK = "#0e1664";

/** A four-pointed AI sparkle. */
function Sparkle({ x, y, s, cls, delay }: { x: number; y: number; s: number; cls: string; delay: string }) {
  return (
    <path
      className={cls}
      style={{ animationDelay: delay }}
      d={`M${x} ${y - s} C${x + s * 0.18} ${y - s * 0.18} ${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} C${x + s * 0.18} ${y + s * 0.18} ${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} C${x - s * 0.18} ${y + s * 0.18} ${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} C${x - s * 0.18} ${y - s * 0.18} ${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z`}
      fill="#8b5cf6"
      stroke="none"
    />
  );
}

function Scene() {
  return (
    <div className="relative h-[300px] w-[600px] shrink-0">
      <svg viewBox="0 0 600 300" className="absolute inset-0 h-full w-full" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* ── Dorm room ── */}
        <rect x="0" y="20" width="280" height="260" rx="24" fill="#fff" stroke="none" />
        <rect className="as-glow-a" x="0" y="20" width="280" height="260" rx="24" fill="#ffe9a8" stroke="none" />
        {/* Window with the moon */}
        <rect x="28" y="48" width="64" height="58" rx="8" fill="#eef4fd" />
        <path d="M60 48 V106 M28 77 H92" strokeWidth="1.5" />
        <path d="M80 58 a8 8 0 1 0 6 13 a6.5 6.5 0 1 1 -6 -13 Z" fill={INK} stroke="none" />
        {/* Bed */}
        <path d="M20 150 V246 M34 150 V246 M20 150 H34" />
        <rect x="34" y="200" width="156" height="30" rx="8" fill="#fff" />
        <path d="M44 230 V246 M180 230 V246" />
        <rect x="40" y="186" width="36" height="16" rx="8" fill="#eef4fd" />
        {/* Bedside table and lamp */}
        <path d="M208 214 H262 M214 214 V246 M256 214 V246" />
        <path d="M222 186 H248 L242 166 H228 Z" fill="#fff" />
        <path d="M235 186 V214" />
        {/* The girl, reading */}
        <path d="M96 202 C96 176 104 158 116 158 C128 158 136 176 136 202" fill="#fff" />
        <path d="M128 200 C144 182 158 182 170 200" />
        <circle cx="116" cy="140" r="14" fill="#fff" />
        <circle cx="108" cy="124" r="7" fill={INK} stroke="none" />
        <path d="M102 138 C104 126 116 122 128 132" />
        <path d="M100 170 L112 166 L124 170 L124 186 L112 182 L100 186 Z" fill="#fff" />
        <path d="M112 166 V182" strokeWidth="1.5" />
        <path d="M100 160 L100 172 M132 160 L124 172" />
        {/* Sparkles around her */}
        <Sparkle x={84} y={132} s={9} cls="as-spark-a" delay="0s" />
        <Sparkle x={150} y={118} s={12} cls="as-spark-a" delay="0.12s" />
        <Sparkle x={144} y={160} s={7} cls="as-spark-a" delay="0.24s" />
        <Sparkle x={72} y={176} s={6} cls="as-spark-a" delay="0.18s" />

        {/* ── Library ── */}
        <rect x="320" y="20" width="280" height="260" rx="24" fill="#fff" stroke="none" />
        <rect className="as-glow-b" x="320" y="20" width="280" height="260" rx="24" fill="#ffe9a8" stroke="none" />
        {/* Bookshelf */}
        <rect x="340" y="48" width="78" height="150" rx="4" fill="#fff" />
        <path d="M340 98 H418 M340 148 H418" />
        {[350, 358, 366, 378, 386, 398, 406].map((x, i) => (
          <path key={`s1${x}`} d={`M${x} 94 V${60 + (i % 3) * 5}`} strokeWidth="3" stroke={i % 2 ? INK : "#5ea3ed"} />
        ))}
        {[348, 356, 368, 376, 390, 398, 410].map((x, i) => (
          <path key={`s2${x}`} d={`M${x} 144 V${110 + (i % 2) * 6}`} strokeWidth="3" stroke={i % 3 ? INK : "#5ea3ed"} />
        ))}
        {[352, 362, 372, 394, 404].map((x, i) => (
          <path key={`s3${x}`} d={`M${x} 194 V${162 + (i % 3) * 5}`} strokeWidth="3" stroke={i % 2 ? "#5ea3ed" : INK} />
        ))}
        {/* The student, at the desk */}
        <path d="M486 206 C486 184 494 170 506 170 C518 170 526 184 526 206" fill="#fff" />
        <circle cx="506" cy="150" r="14" fill="#fff" />
        <path d="M492 146 C494 134 506 130 520 140" strokeWidth="5" />
        <path d="M480 206 L484 182 H528 L532 206 Z" fill="#fff" />
        <circle cx="506" cy="194" r="2.5" fill={INK} stroke="none" />
        <path d="M440 206 H584" strokeWidth="6" />
        <path d="M450 206 V262 M574 206 V262" />
        {/* Mug */}
        <path d="M552 192 V204 H564 V192 Z M564 196 h4 v5 h-4" fill="#fff" />
        <Sparkle x={474} y={140} s={9} cls="as-spark-b" delay="0s" />
        <Sparkle x={540} y={128} s={12} cls="as-spark-b" delay="0.12s" />
        <Sparkle x={548} y={170} s={7} cls="as-spark-b" delay="0.24s" />
        <Sparkle x={466} y={182} s={6} cls="as-spark-b" delay="0.18s" />

        {/* Floors */}
        <path d="M14 262 H266 M334 262 H586" strokeWidth="1.5" opacity="0.4" />
      </svg>

      {/* "Hi!" in each room */}
      <span className="as-hi-a absolute rounded-full bg-white px-3 py-1 text-[14px] font-medium text-ink shadow-[0_6px_20px_rgba(14,22,100,0.15)]" style={{ left: 196, top: 100 }}>
        Hi!
      </span>
      <span className="as-hi-b absolute rounded-full bg-white px-3 py-1 text-[14px] font-medium text-ink shadow-[0_6px_20px_rgba(14,22,100,0.15)]" style={{ left: 428, top: 160 }}>
        Hi!
      </span>

      {/* Zara: moves between the rooms (x), jumps (y) and squashes a little on landing. */}
      <div className="as-move absolute" style={{ left: 146, top: 138 }}>
        <div className="as-jump">
          <div className="as-squash">
            <Mascot partner="zara" size={62} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthAside({ signUp }: { signUp: boolean }) {
  return (
    <aside className="relative hidden flex-col items-center justify-between overflow-hidden bg-[#f5f8fc] px-10 py-14 lg:flex" aria-hidden>
      <p className="max-w-lg text-center font-heading text-[30px] leading-snug text-ink">
        Students get <span className="rounded-md bg-[#cfe3fb] px-1.5 italic [box-decoration-break:clone]">higher grades</span>
        <br />
        with Ask Your Slides!
      </p>

      <Scene />

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
