// The right half of /sign-up and /sign-in (owner, 20 Nov 2026): a headline, a wide animated scene,
// and who it's for. Hand-drawn cartoon style in one dark navy and white (a displacement filter makes
// the lines wobble like a rough sketch). One long room at a time, in a 16-second loop (globals.css,
// "as3-"):
//   1. A dorm in exam season: a girl on her bed, stressed (hand on her head, a tangled scribble, "?!").
//      The door opens, Zara walks in (real steps: legs and arms swing), stops near her and waves;
//      AI sparkles appear, the stress clears and the girl smiles. The scene fades out.
//   2. The same in a library, with a student at a long table.
// Both rooms run the same keyframes; the library is offset by half a loop (a negative delay).
// Zara is drawn as herself (a woman with an afro, earrings and a dress, a small AI sparkle by her
// head). Original drawing. Reduced motion shows the end of the dorm scene, still.
import type { CSSProperties, ReactNode } from "react";

const INK = "#0e1664";
const HALF = -8; // seconds: the library runs half a loop behind the dorm
const FLOOR = 320;
const DOOR_X = 586; // where Zara appears, in the doorway

const at = (offset: number, extra = 0): CSSProperties => ({ animationDelay: `${offset + extra}s` });

/** A four-pointed AI sparkle. */
function Sparkle({ x, y, s, offset = 0, extra = 0, cls = "as3-spark" }: { x: number; y: number; s: number; offset?: number; extra?: number; cls?: string }) {
  const k = s * 0.2;
  return (
    <path
      className={cls}
      style={cls ? at(offset, extra) : undefined}
      d={`M${x} ${y - s} C${x + k} ${y - k} ${x + k} ${y - k} ${x + s} ${y} C${x + k} ${y + k} ${x + k} ${y + k} ${x} ${y + s} C${x - k} ${y + k} ${x - k} ${y + k} ${x - s} ${y} C${x - k} ${y - k} ${x - k} ${y - k} ${x} ${y - s} Z`}
      fill={INK}
      stroke="none"
    />
  );
}

/** Zara, drawn as herself. Local coordinates: feet at (0, 0), about 108 tall. */
function Zara({ offset }: { offset: number }) {
  return (
    <g className="as3-bob" style={at(offset)}>
      {/* Legs (they swing from the hip) */}
      <g className="as3-leg-l" style={at(offset)}>
        <path d="M-5 -42 L-6 -6" strokeWidth="3.2" />
        <path d="M-11 -3 Q-6 -8 -1 -3 Z" fill={INK} />
      </g>
      <g className="as3-leg-r" style={at(offset)}>
        <path d="M5 -42 L6 -6" strokeWidth="3.2" />
        <path d="M1 -3 Q6 -8 11 -3 Z" fill={INK} />
      </g>
      {/* Left arm (swings) */}
      <g className="as3-arm-l" style={at(offset)}>
        <path d="M-12 -70 L-15 -47" strokeWidth="3" />
        <circle cx="-15" cy="-45" r="2.6" fill="#fff" />
      </g>
      {/* Dress */}
      <path d="M-11 -73 Q0 -78 11 -73 L19 -38 Q0 -33 -19 -38 Z" fill={INK} />
      <path d="M-6 -73 L0 -66 L6 -73" stroke="#fff" strokeWidth="1.6" />
      {/* Right arm (swings, then waves) */}
      <g className="as3-arm-r" style={at(offset)}>
        <path d="M12 -70 L15 -47" strokeWidth="3" />
        <circle cx="15" cy="-45" r="2.6" fill="#fff" />
      </g>
      {/* Neck, afro, face */}
      <path d="M0 -78 V-73" strokeWidth="3" />
      <circle cx="0" cy="-95" r="14" fill={INK} />
      <circle cx="-12" cy="-88" r="8.5" fill={INK} />
      <circle cx="12" cy="-88" r="8.5" fill={INK} />
      <circle cx="0" cy="-86" r="10" fill="#fff" />
      <path d="M-9 -89 Q-2 -96 9 -90" fill={INK} strokeWidth="1.6" />
      <circle cx="-3.6" cy="-85" r="1.4" fill={INK} stroke="none" />
      <circle cx="3.6" cy="-85" r="1.4" fill={INK} stroke="none" />
      <path d="M-5.6 -87.5 l-1.4 -1.2 M5.6 -87.5 l1.4 -1.2" strokeWidth="1.1" />
      <path d="M-3.5 -80.5 Q0 -77.5 3.5 -80.5" strokeWidth="1.5" />
      <circle cx="-10.5" cy="-81" r="2" fill="#fff" strokeWidth="1.3" />
      <circle cx="10.5" cy="-81" r="2" fill="#fff" strokeWidth="1.3" />
      {/* The AI sparkle that marks her as the study partner */}
      <Sparkle x={21} y={-104} s={5} cls="" />
    </g>
  );
}

/** A face that is worried (or flat) until Zara has waved, then smiles. */
function Faces({ cx, cy, offset, worried }: { cx: number; cy: number; offset: number; worried: boolean }) {
  return (
    <>
      <g className="as3-sad" style={at(offset)}>
        {worried && <path d={`M${cx - 6.5} ${cy - 4} l3.5 1.8 M${cx + 6.5} ${cy - 4} l-3.5 1.8`} strokeWidth="1.4" />}
        <circle cx={cx - 3.6} cy={cy + 0.5} r="1.3" fill={INK} stroke="none" />
        <circle cx={cx + 3.6} cy={cy + 0.5} r="1.3" fill={INK} stroke="none" />
        <path d={worried ? `M${cx - 4} ${cy + 6.5} q4 -3 8 0` : `M${cx - 3.5} ${cy + 6} h7`} strokeWidth="1.4" />
      </g>
      <g className="as3-happy" style={at(offset)}>
        <path d={`M${cx - 6} ${cy + 0.5} q2.5 -2.5 5 0 M${cx + 1} ${cy + 0.5} q2.5 -2.5 5 0`} strokeWidth="1.4" />
        <path d={`M${cx - 5} ${cy + 4.5} q5 4.5 10 0`} strokeWidth="1.5" />
      </g>
    </>
  );
}

/** One long room: frame, floor, a door on the right, its contents, and Zara walking in. */
function Room({ offset, stopX, children }: { offset: number; stopX: number; children: ReactNode }) {
  return (
    <g className="as3-scene" style={at(offset)}>
      <rect x="4" y="6" width="632" height="348" rx="26" fill="#fff" />
      <path d={`M24 ${FLOOR} H616`} />
      {/* Doorway, and the door swinging open on its right hinge */}
      <rect x="560" y="168" width="52" height={FLOOR - 168} fill="#fff" />
      <g className="as3-door" style={at(offset)}>
        <rect x="560" y="168" width="52" height={FLOOR - 168} fill="#fff" />
        <circle cx="569" cy="246" r="2.8" fill={INK} stroke="none" />
      </g>
      {children}
      <g transform={`translate(${DOOR_X} ${FLOOR})`}>
        <g className="as3-walk" style={{ ...at(offset), ["--as3-stop" as string]: `${stopX - DOOR_X}px` }}>
          <Zara offset={offset} />
        </g>
      </g>
    </g>
  );
}

function Dorm() {
  const o = 0;
  return (
    <Room offset={o} stopX={258}>
      {/* Window with the moon */}
      <rect x="64" y="58" width="74" height="64" rx="6" fill="#fff" />
      <path d="M101 58 V122 M64 90 H138" />
      <path d="M124 66 a9 9 0 1 0 7 15 a7.5 7.5 0 1 1 -7 -15 Z" fill={INK} stroke="none" />
      {/* Calendar with a date circled */}
      <rect x="300" y="70" width="46" height="46" rx="5" fill="#fff" />
      <path d="M300 82 H346" />
      <path d="M311 64 V76 M335 64 V76" />
      <circle cx="323" cy="99" r="10" />
      <path d="M319 95 h7 l-5 9" strokeWidth="1.8" />
      {/* Bed */}
      <path d={`M40 228 V${FLOOR} M52 228 V${FLOOR} M40 228 H52`} />
      <rect x="52" y="270" width="170" height="26" rx="7" fill="#fff" />
      <path d={`M62 296 V${FLOOR} M212 296 V${FLOOR}`} />
      <rect x="58" y="256" width="34" height="15" rx="7" fill="#fff" />
      {/* Pile of books */}
      <rect x="164" y="260" width="34" height="10" rx="2" fill="#fff" />
      <rect x="167" y="250" width="30" height="10" rx="2" fill={INK} />
      <rect x="163" y="240" width="33" height="10" rx="2" fill="#fff" />
      {/* The girl: book on her lap, hand on her head */}
      <path d="M100 272 C100 250 106 236 118 236 C130 236 136 250 136 272" fill="#fff" />
      <path d="M102 262 L118 258 L134 262 L134 270 L118 266 L102 270 Z" fill="#fff" />
      <path d="M118 258 V266" strokeWidth="1.4" />
      <path d="M106 244 L108 260" />
      <g className="as3-strain">
        <path d="M131 244 C141 234 140 218 131 211" />
        <circle cx="118" cy="219" r="12" fill="#fff" />
        <circle cx="110" cy="205" r="6.5" fill={INK} stroke="none" />
        <path d="M106 217 C108 207 118 203 129 211" strokeWidth="2.4" />
        <circle cx="131" cy="211" r="3.6" fill="#fff" />
        <Faces cx={118} cy={220} offset={o} worried />
      </g>
      {/* Stress: clears once Zara has waved */}
      <g className="as3-sad" style={at(o)}>
        <g className="as3-scribble">
          <path d="M106 184 c-6 -8 6 -14 10 -6 c4 8 -10 10 -6 0 c4 -10 18 -6 14 4 c-3 8 -14 2 -8 -6 c6 -8 16 0 10 6" strokeWidth="1.6" />
        </g>
        <text x="138" y="192" fontSize="15" fontWeight="800" fill={INK} stroke="none" fontFamily="system-ui, sans-serif">?!</text>
      </g>
      <Sparkle x={88} y={208} s={8} offset={o} extra={0} />
      <Sparkle x={148} y={196} s={11} offset={o} extra={0.12} />
      <Sparkle x={150} y={228} s={6} offset={o} extra={0.24} />
      <Sparkle x={84} y={240} s={5} offset={o} extra={0.18} />
    </Room>
  );
}

function Library() {
  const o = HALF;
  const books = (x0: number, yTop: number, xs: number[]) =>
    xs.map((dx, i) => <rect key={`${x0}-${yTop}-${dx}`} x={x0 + dx} y={yTop + (i % 3) * 4} width="5" height={34 - (i % 3) * 4} fill={i % 2 ? INK : "#fff"} strokeWidth="1.4" />);
  return (
    <Room offset={o} stopX={470}>
      {/* Two bookshelves */}
      {[40, 128].map((x) => (
        <g key={x}>
          <rect x={x} y="80" width="76" height={FLOOR - 80} fill="#fff" />
          <path d={`M${x} 130 H${x + 76} M${x} 180 H${x + 76} M${x} 230 H${x + 76} M${x} 280 H${x + 76}`} />
          {books(x, 92, [6, 14, 22, 34, 42, 54, 62])}
          {books(x, 142, [8, 16, 28, 36, 48, 60])}
          {books(x, 192, [6, 18, 26, 38, 46, 58, 66])}
          {books(x, 242, [10, 18, 30, 42, 50, 62])}
        </g>
      ))}
      {/* The student at a long table */}
      <path d="M320 268 C320 250 326 238 338 238 C350 238 356 250 356 268" fill="#fff" />
      <circle cx="338" cy="221" r="12" fill="#fff" />
      <path d="M326 218 C328 206 340 203 351 211" strokeWidth="4" />
      <Faces cx={338} cy={222} offset={o} worried={false} />
      <path d="M318 268 L322 246 H354 L358 268 Z" fill="#fff" />
      <circle cx="338" cy="258" r="2.2" fill={INK} stroke="none" />
      <path d="M250 268 H440" strokeWidth="4" />
      <path d={`M260 268 V${FLOOR} M430 268 V${FLOOR}`} />
      {/* A lamp on the table */}
      <path d="M408 268 V246 M398 246 H418 L412 234 H404 Z" fill="#fff" />
      <Sparkle x={308} y={208} s={8} offset={o} extra={0} />
      <Sparkle x={368} y={196} s={11} offset={o} extra={0.12} />
      <Sparkle x={372} y={232} s={6} offset={o} extra={0.24} />
      <Sparkle x={304} y={242} s={5} offset={o} extra={0.18} />
    </Room>
  );
}

export function AuthAside({ signUp }: { signUp: boolean }) {
  return (
    <aside className="relative hidden flex-col items-center justify-between gap-6 overflow-hidden border-l border-line bg-[#fbfcfe] px-8 py-12 lg:flex" aria-hidden>
      <p className="max-w-lg text-center font-heading text-[30px] leading-snug text-ink">
        Students get <span className="rounded-md bg-[#cfe3fb] px-1.5 italic [box-decoration-break:clone]">higher grades</span>
        <br />
        with Ask Your Slides!
      </p>

      <svg viewBox="0 0 640 360" className="w-full max-w-[680px]" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <defs>
          {/* Rough, hand-drawn lines */}
          <filter id="as3-sketch" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="3.2" />
          </filter>
        </defs>
        <g filter="url(#as3-sketch)">
          <Dorm />
          <Library />
        </g>
      </svg>

      <div className="flex flex-col items-center gap-8">
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
