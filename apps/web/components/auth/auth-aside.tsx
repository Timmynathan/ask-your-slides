// The right half of /sign-up and /sign-in (owner, 20 Nov 2026): a headline, a small animated scene,
// and who it's for. The scene, in exam season: a girl in her dorm by day, buried in books and clearly
// stressed (hand on her head, a tangled scribble and "?!" above her), and a student at a library desk.
// A full-body Zara hops from one room to the other; each time she lands she waves, AI
// sparkles burst and the student's face changes (the girl's stress clears while Zara is with her). One 9-second
// loop in CSS (globals.css, "as-"); reduced motion shows the first greeting, still. Original drawing,
// all in the app's navy and blue (only Zara keeps her own colours); Zara's colours match her avatar (components/mascot/mascot.tsx).
import { Mascot } from "@/components/mascot/mascot";

const INK = "#0e1664";
const ZARA = { skin: "#8a5534", hair: "#1f1410", top: "#0d9488", topShade: "#0f766e", trousers: "#1e2a5a" };

/** A four-pointed AI sparkle. */
function Sparkle({ x, y, s, cls, delay }: { x: number; y: number; s: number; cls: string; delay: string }) {
  const k = s * 0.18;
  return (
    <path
      className={cls}
      style={{ animationDelay: delay }}
      d={`M${x} ${y - s} C${x + k} ${y - k} ${x + k} ${y - k} ${x + s} ${y} C${x + k} ${y + k} ${x + k} ${y + k} ${x} ${y + s} C${x - k} ${y + k} ${x - k} ${y + k} ${x - s} ${y} C${x - k} ${y - k} ${x - k} ${y - k} ${x} ${y - s} Z`}
      fill="#5ea3ed"
      stroke="none"
    />
  );
}

/** Zara with a body: her real avatar (the one students see in the app) as the head, on a teal top and
 *  navy trousers, so she reads as the study partner, not as another student. Her right arm waves. */
function ZaraFull() {
  const c = ZARA;
  return (
    <div className="flex w-[64px] flex-col items-center">
      <div className="relative z-10">
        <Mascot partner="zara" size={64} />
      </div>
      <svg width="60" height="56" viewBox="0 0 60 56" className="-mt-2" aria-hidden>
        <path d="M24 34 L22 48 M36 34 L38 48" stroke={c.trousers} strokeWidth="9" strokeLinecap="round" />
        <ellipse cx="20" cy="51" rx="7" ry="4" fill={INK} />
        <ellipse cx="40" cy="51" rx="7" ry="4" fill={INK} />
        <path d="M16 8 L9 28" stroke={c.skin} strokeWidth="6" strokeLinecap="round" />
        <circle cx="9" cy="29" r="3.6" fill={c.skin} />
        <path d="M13 12 C13 5 18 1 24 1 H36 C42 1 47 5 47 12 V37 H13 Z" fill={c.top} />
        <g className="as-wave">
          <path d="M44 8 L51 28" stroke={c.skin} strokeWidth="6" strokeLinecap="round" />
          <circle cx="51" cy="29" r="3.6" fill={c.skin} />
        </g>
      </svg>
    </div>
  );
}

function Scene() {
  return (
    <div className="relative h-[300px] w-[600px] shrink-0">
      <svg viewBox="0 0 600 300" className="absolute inset-0 h-full w-full" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* ── Dorm room, daytime, exam season ── */}
        <rect x="0" y="20" width="280" height="260" rx="24" fill="#fff" stroke="#e3e8f2" strokeWidth="1.5" />
        {/* Window with the moon */}
        <rect x="28" y="44" width="64" height="58" rx="8" fill="#dbeafe" />
        <path d="M74 54 a9 9 0 1 0 7 15 a7.5 7.5 0 1 1 -7 -15 Z" fill="#0e1664" stroke="none" />
        <path d="M60 44 V102 M28 73 H92" strokeWidth="1.5" />
        {/* Calendar: exams this week */}
        <rect x="200" y="44" width="56" height="56" rx="6" fill="#fff" />
        <path d="M200 58 H256" />
        <rect x="200" y="44" width="56" height="14" rx="6" fill={INK} stroke="none" />
        <text x="228" y="54.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" stroke="none" fontFamily="system-ui, sans-serif">EXAMS</text>
        <text x="228" y="86" textAnchor="middle" fontSize="20" fontWeight="700" fill={INK} stroke="none" fontFamily="system-ui, sans-serif">5</text>
        <circle cx="228" cy="80" r="13" stroke="#5ea3ed" strokeWidth="1.8" />
        {/* Bed */}
        <path d="M20 150 V246 M34 150 V246 M20 150 H34" />
        <rect x="34" y="200" width="156" height="30" rx="8" fill="#fff" />
        <path d="M44 230 V246 M180 230 V246" />
        <rect x="40" y="186" width="36" height="16" rx="8" fill="#eef4fd" />
        {/* A pile of books beside her */}
        <rect x="150" y="190" width="34" height="10" rx="2" fill="#5ea3ed" stroke="none" />
        <rect x="153" y="180" width="30" height="10" rx="2" fill="#cfe3fb" stroke="none" />
        <rect x="149" y="170" width="33" height="10" rx="2" fill={INK} stroke="none" />
        <rect x="155" y="162" width="26" height="8" rx="2" fill="#9cc3f0" stroke="none" />
        {/* The girl: book on her lap, one hand on her head */}
        <path d="M96 202 C96 176 104 158 116 158 C128 158 136 176 136 202" fill="#fff" />
        <path d="M98 190 L114 186 L130 190 L130 198 L114 194 L98 198 Z" fill="#fff" />
        <path d="M114 186 V194" strokeWidth="1.5" />
        <path d="M102 168 L104 188" />
        <g className="as-strain">
          <path d="M130 166 C140 156 140 140 130 132" />
          <circle cx="116" cy="140" r="14" fill="#fff" />
          <circle cx="108" cy="124" r="7" fill={INK} stroke="none" />
          <path d="M102 138 C104 126 116 122 128 132" />
          <circle cx="130" cy="132" r="4" fill="#fff" />
          {/* Worried, then smiling while Zara is with her */}
          <g className="as-face-a-sad">
            <path d="M109 137 l4 2 M123 137 l-4 2" strokeWidth="1.5" />
            <circle cx="112" cy="142" r="1.4" fill={INK} stroke="none" />
            <circle cx="120" cy="142" r="1.4" fill={INK} stroke="none" />
            <path d="M111 149 q5 -3.5 10 0" strokeWidth="1.5" />
          </g>
          <g className="as-face-a-happy">
            <path d="M109 142 q3 -3 6 0 M117 142 q3 -3 6 0" strokeWidth="1.5" />
            <path d="M110 147 q6 5 12 0" strokeWidth="1.6" />
            <circle cx="108" cy="146" r="2" fill="#9cc3f0" stroke="none" opacity="0.8" />
            <circle cx="124" cy="146" r="2" fill="#9cc3f0" stroke="none" opacity="0.8" />
          </g>
        </g>
        {/* Stress: a tangled scribble, "?!" and a sweat drop. Clears while Zara is with her. */}
        <g className="as-stress">
          <g className="as-scribble">
            <path d="M104 104 c-6 -8 6 -14 10 -6 c4 8 -10 10 -6 0 c4 -10 18 -6 14 4 c-3 8 -14 2 -8 -6 c6 -8 16 0 10 6" strokeWidth="1.6" />
          </g>
          <text x="140" y="112" fontSize="16" fontWeight="800" fill="#5ea3ed" stroke="none" fontFamily="system-ui, sans-serif">?!</text>
          <path d="M96 128 c-3 4 -3 7 0 8 c3 -1 3 -4 0 -8 Z" fill="#cfe3fb" stroke="#5ea3ed" strokeWidth="1" />
        </g>
        <Sparkle x={84} y={132} s={9} cls="as-spark-a" delay="0s" />
        <Sparkle x={148} y={120} s={12} cls="as-spark-a" delay="0.12s" />
        <Sparkle x={140} y={150} s={7} cls="as-spark-a" delay="0.24s" />
        <Sparkle x={76} y={170} s={6} cls="as-spark-a" delay="0.18s" />

        {/* ── Library ── */}
        <rect x="320" y="20" width="280" height="260" rx="24" fill="#fff" stroke="#e3e8f2" strokeWidth="1.5" />
        <rect x="340" y="48" width="70" height="150" rx="4" fill="#fff" />
        <path d="M340 98 H410 M340 148 H410" />
        {[350, 358, 366, 378, 386, 398].map((x, i) => (
          <path key={`s1${x}`} d={`M${x} 94 V${60 + (i % 3) * 5}`} strokeWidth="3" stroke={i % 2 ? INK : "#5ea3ed"} />
        ))}
        {[348, 356, 368, 376, 390, 400].map((x, i) => (
          <path key={`s2${x}`} d={`M${x} 144 V${110 + (i % 2) * 6}`} strokeWidth="3" stroke={i % 3 ? INK : "#5ea3ed"} />
        ))}
        {[352, 362, 372, 394, 402].map((x, i) => (
          <path key={`s3${x}`} d={`M${x} 194 V${162 + (i % 3) * 5}`} strokeWidth="3" stroke={i % 2 ? "#5ea3ed" : INK} />
        ))}
        <path d="M486 206 C486 184 494 170 506 170 C518 170 526 184 526 206" fill="#fff" />
        <circle cx="506" cy="150" r="14" fill="#fff" />
        <path d="M492 146 C494 134 506 130 520 140" strokeWidth="5" />
        <g className="as-face-b-flat">
          <circle cx="501" cy="152" r="1.4" fill={INK} stroke="none" />
          <circle cx="511" cy="152" r="1.4" fill={INK} stroke="none" />
          <path d="M502 158 h8" strokeWidth="1.5" />
        </g>
        <g className="as-face-b-happy">
          <path d="M498 152 q3 -3 6 0 M508 152 q3 -3 6 0" strokeWidth="1.5" />
          <path d="M500 157 q6 5 12 0" strokeWidth="1.6" />
        </g>
        <path d="M480 206 L484 182 H528 L532 206 Z" fill="#fff" />
        <circle cx="506" cy="194" r="2.5" fill={INK} stroke="none" />
        <path d="M466 206 H584" strokeWidth="6" />
        <path d="M474 206 V262 M576 206 V262" />
        <path d="M552 192 V204 H564 V192 Z M564 196 h4 v5 h-4" fill="#fff" />
        <Sparkle x={474} y={140} s={9} cls="as-spark-b" delay="0s" />
        <Sparkle x={540} y={128} s={12} cls="as-spark-b" delay="0.12s" />
        <Sparkle x={548} y={170} s={7} cls="as-spark-b" delay="0.24s" />
        <Sparkle x={470} y={182} s={6} cls="as-spark-b" delay="0.18s" />

        <path d="M14 262 H266 M334 262 H586" strokeWidth="1.5" opacity="0.4" />
      </svg>

      {/* Zara: moves between the rooms (x), jumps (y) and squashes a little on landing. */}
      <div className="as-move absolute" style={{ left: 198, top: 150 }}>
        <div className="as-jump">
          <div className="as-squash">
            <ZaraFull />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthAside({ signUp }: { signUp: boolean }) {
  return (
    <aside className="relative hidden flex-col items-center justify-between overflow-hidden border-l border-line bg-[#fbfcfe] px-10 py-14 lg:flex" aria-hidden>
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
