// The right half of /sign-up and /sign-in (owner, 20 Nov 2026): a headline, a small animated scene,
// and who it's for. The scene shows one room at a time, in a 12-second loop (globals.css, "as2-"):
//   1. A dorm in exam season: a girl on her bed, stressed (hand on her head, a tangled scribble, "?!").
//      The door opens, Zara walks in, stops beside her and waves; AI sparkles appear, the stress
//      clears and the girl smiles. The scene fades out.
//   2. The same in a library, with a student at a desk.
// Both rooms run the same keyframes; the library is offset by half a loop (a negative delay).
// Original drawing in the app's navy and blue; only Zara keeps her own colours, with her real avatar
// as her head (components/mascot/mascot.tsx). Reduced motion shows the end of the dorm scene, still.
import type { CSSProperties, ReactNode } from "react";
import { Mascot } from "@/components/mascot/mascot";

const INK = "#0e1664";
const BLUE = "#5ea3ed";
const PALE = "#cfe3fb";
const ZARA = { skin: "#8a5534", top: "#0d9488", trousers: "#1e2a5a" };
const HALF = -6; // seconds: the library runs half a loop behind the dorm

const at = (offset: number, extra = 0): CSSProperties => ({ animationDelay: `${offset + extra}s` });

/** A four-pointed AI sparkle. */
function Sparkle({ x, y, s, offset, extra }: { x: number; y: number; s: number; offset: number; extra: number }) {
  const k = s * 0.18;
  return (
    <path
      className="as2-spark"
      style={at(offset, extra)}
      d={`M${x} ${y - s} C${x + k} ${y - k} ${x + k} ${y - k} ${x + s} ${y} C${x + k} ${y + k} ${x + k} ${y + k} ${x} ${y + s} C${x - k} ${y + k} ${x - k} ${y + k} ${x - s} ${y} C${x - k} ${y - k} ${x - k} ${y - k} ${x} ${y - s} Z`}
      fill={BLUE}
      stroke="none"
    />
  );
}

/** Zara with a body: her real avatar as the head, teal top, navy trousers. Her waving arm is drawn
 *  above everything (and may leave its box) so the hand is always visible. */
function ZaraFull({ offset }: { offset: number }) {
  const c = ZARA;
  return (
    <div className="relative flex w-[64px] flex-col items-center">
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
      </svg>
      <svg width="60" height="56" viewBox="0 0 60 56" className="absolute left-[2px] top-[56px] z-20 overflow-visible" aria-hidden>
        <g className="as2-wave" style={at(offset)}>
          <path d="M44 8 L51 28" stroke={c.skin} strokeWidth="6" strokeLinecap="round" />
          <circle cx="51" cy="29" r="3.8" fill={c.skin} />
        </g>
      </svg>
    </div>
  );
}

/** A face that is worried (or flat) until Zara has waved, then smiles. */
function Faces({ cx, cy, offset, worried }: { cx: number; cy: number; offset: number; worried: boolean }) {
  return (
    <>
      <g className="as2-sad" style={at(offset)}>
        {worried && <path d={`M${cx - 7} ${cy - 3} l4 2 M${cx + 7} ${cy - 3} l-4 2`} strokeWidth="1.5" />}
        <circle cx={cx - 4} cy={cy + 2} r="1.4" fill={INK} stroke="none" />
        <circle cx={cx + 4} cy={cy + 2} r="1.4" fill={INK} stroke="none" />
        <path d={worried ? `M${cx - 5} ${cy + 9} q5 -3.5 10 0` : `M${cx - 4} ${cy + 8} h8`} strokeWidth="1.5" />
      </g>
      <g className="as2-happy" style={at(offset)}>
        <path d={`M${cx - 7} ${cy + 2} q3 -3 6 0 M${cx + 1} ${cy + 2} q3 -3 6 0`} strokeWidth="1.5" />
        <path d={`M${cx - 6} ${cy + 7} q6 5 12 0`} strokeWidth="1.6" />
      </g>
    </>
  );
}

/** One room: its drawing, a door on the right, and Zara walking in through it. */
function Room({ offset, children, zaraStop }: { offset: number; children: ReactNode; zaraStop: number }) {
  return (
    <div className="as2-scene absolute inset-0" style={at(offset)}>
      <svg viewBox="0 0 320 300" className="absolute inset-0 h-full w-full" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="10" width="318" height="282" rx="24" fill="#fff" stroke="#e3e8f2" strokeWidth="1.5" />
        <path d="M16 270 H304" strokeWidth="1.5" opacity="0.4" />
        {/* Doorway, then the door that swings open on its right hinge */}
        <rect x="246" y="118" width="54" height="152" rx="3" fill={PALE} />
        <g className="as2-door" style={at(offset)}>
          <rect x="246" y="118" width="54" height="152" rx="3" fill="#fff" />
          <circle cx="256" cy="198" r="3" fill={INK} stroke="none" />
        </g>
        {children}
      </svg>
      {/* Zara walks in from the doorway to her stop beside the student. */}
      <div className="as2-walk absolute" style={{ ...at(offset), left: 241, top: 158, ["--as2-stop" as string]: `${zaraStop - 241}px` }}>
        <div className="as2-step" style={at(offset)}>
          <ZaraFull offset={offset} />
        </div>
      </div>
    </div>
  );
}

function Dorm() {
  const o = 0;
  return (
    <Room offset={o} zaraStop={176}>
      {/* Window with the moon */}
      <rect x="24" y="40" width="60" height="54" rx="8" fill={PALE} />
      <path d="M54 40 V94 M24 67 H84" strokeWidth="1.5" />
      <path d="M69 48 a8 8 0 1 0 6 13 a6.5 6.5 0 1 1 -6 -13 Z" fill={INK} stroke="none" />
      {/* Calendar with a date circled */}
      <rect x="150" y="40" width="44" height="44" rx="6" fill="#fff" />
      <rect x="150" y="40" width="44" height="11" rx="5" fill={INK} stroke="none" />
      <circle cx="172" cy="68" r="10" stroke={BLUE} strokeWidth="1.8" />
      <path d="M168 64 h7 l-5 9" strokeWidth="1.8" />
      {/* Bed */}
      <path d="M18 160 V256 M30 160 V256 M18 160 H30" />
      <rect x="30" y="210" width="128" height="28" rx="8" fill="#fff" />
      <path d="M40 238 V256 M148 238 V256" />
      <rect x="36" y="196" width="32" height="15" rx="7" fill="#eef4fd" />
      {/* Pile of books */}
      <rect x="120" y="200" width="30" height="10" rx="2" fill={BLUE} stroke="none" />
      <rect x="123" y="190" width="26" height="10" rx="2" fill={PALE} stroke="none" />
      <rect x="119" y="180" width="29" height="10" rx="2" fill={INK} stroke="none" />
      {/* The girl: book on her lap, hand on her head */}
      <path d="M70 212 C70 186 78 168 90 168 C102 168 110 186 110 212" fill="#fff" />
      <path d="M72 200 L88 196 L104 200 L104 208 L88 204 L72 208 Z" fill="#fff" />
      <path d="M88 196 V204" strokeWidth="1.5" />
      <path d="M76 178 L78 198" />
      <g className="as2-strain">
        <path d="M104 176 C114 166 114 150 104 142" />
        <circle cx="90" cy="150" r="14" fill="#fff" />
        <circle cx="82" cy="134" r="7" fill={INK} stroke="none" />
        <path d="M76 148 C78 136 90 132 102 142" />
        <circle cx="104" cy="142" r="4" fill="#fff" />
        <Faces cx={90} cy={150} offset={o} worried />
      </g>
      {/* Stress: clears once Zara has waved */}
      <g className="as2-sad" style={at(o)}>
        <g className="as2-scribble">
          <path d="M78 114 c-6 -8 6 -14 10 -6 c4 8 -10 10 -6 0 c4 -10 18 -6 14 4 c-3 8 -14 2 -8 -6 c6 -8 16 0 10 6" strokeWidth="1.6" />
        </g>
        <text x="112" y="122" fontSize="15" fontWeight="800" fill={BLUE} stroke="none" fontFamily="system-ui, sans-serif">?!</text>
      </g>
      <Sparkle x={60} y={140} s={8} offset={o} extra={0} />
      <Sparkle x={118} y={128} s={11} offset={o} extra={0.12} />
      <Sparkle x={114} y={160} s={6} offset={o} extra={0.24} />
      <Sparkle x={56} y={178} s={5} offset={o} extra={0.18} />
    </Room>
  );
}

function Library() {
  const o = HALF;
  return (
    <Room offset={o} zaraStop={182}>
      {/* Bookshelf */}
      <rect x="22" y="40" width="64" height="150" rx="4" fill="#fff" />
      <path d="M22 90 H86 M22 140 H86" />
      {[30, 38, 46, 58, 66, 76].map((x, i) => (
        <path key={`a${x}`} d={`M${x} 86 V${52 + (i % 3) * 5}`} strokeWidth="3" stroke={i % 2 ? INK : BLUE} />
      ))}
      {[28, 36, 48, 56, 68, 78].map((x, i) => (
        <path key={`b${x}`} d={`M${x} 136 V${102 + (i % 2) * 6}`} strokeWidth="3" stroke={i % 3 ? INK : BLUE} />
      ))}
      {[32, 42, 52, 70].map((x, i) => (
        <path key={`c${x}`} d={`M${x} 186 V${154 + (i % 3) * 5}`} strokeWidth="3" stroke={i % 2 ? BLUE : INK} />
      ))}
      {/* The student at a desk */}
      <path d="M116 214 C116 192 124 178 136 178 C148 178 156 192 156 214" fill="#fff" />
      <circle cx="136" cy="158" r="14" fill="#fff" />
      <path d="M122 154 C124 142 136 138 150 148" strokeWidth="5" />
      <Faces cx={136} cy={158} offset={o} worried={false} />
      <path d="M110 214 L114 190 H158 L162 214 Z" fill="#fff" />
      <circle cx="136" cy="202" r="2.5" fill={INK} stroke="none" />
      <path d="M96 214 H214" strokeWidth="6" />
      <path d="M104 214 V270 M206 214 V270" />
      <Sparkle x={104} y={148} s={8} offset={o} extra={0} />
      <Sparkle x={168} y={136} s={11} offset={o} extra={0.12} />
      <Sparkle x={172} y={172} s={6} offset={o} extra={0.24} />
      <Sparkle x={98} y={186} s={5} offset={o} extra={0.18} />
    </Room>
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

      <div className="relative h-[300px] w-[320px] shrink-0 scale-[1.18]">
        <Dorm />
        <Library />
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
