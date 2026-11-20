// The right half of /sign-up and /sign-in (owner, 20 Nov 2026): a headline, the four study partners
// floating gently (each blinks and bobs on its own, see components/mascot/mascot.tsx; they rise in one
// after another, then drift), and who it's for. Kept deliberately simple and clean.
import { Mascot } from "@/components/mascot/mascot";
import type { PartnerId } from "@/lib/partners";

// Placement around the centre (px from the centre of a 460 × 360 stage), size, and a drift delay.
const CAST: { partner: PartnerId; x: number; y: number; size: number; delay: number }[] = [
  { partner: "ada", x: 0, y: -10, size: 168, delay: 0 },
  { partner: "tobi", x: -150, y: -96, size: 104, delay: 0.15 },
  { partner: "musa", x: 156, y: -70, size: 112, delay: 0.3 },
  { partner: "zara", x: 128, y: 112, size: 100, delay: 0.45 },
];

export function AuthAside({ signUp }: { signUp: boolean }) {
  return (
    <aside className="relative hidden flex-col items-center justify-between overflow-hidden border-l border-line bg-[#f4f6fa] px-10 py-14 lg:flex" aria-hidden>
      <p className="max-w-lg text-center font-heading text-[30px] leading-snug text-ink">
        Students get <span className="rounded-md bg-[#cfe3fb] px-1.5 italic [box-decoration-break:clone]">higher grades</span>
        <br />
        with Ask Your Slides!
      </p>

      <div className="relative h-[360px] w-[460px] shrink-0">
        <span className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        {CAST.map((m) => (
          <div
            key={m.partner}
            className="cast-in absolute"
            style={{ left: 230 + m.x - m.size / 2, top: 180 + m.y - m.size / 2, animationDelay: `${m.delay}s` }}
          >
            <div className="float-y" style={{ animationDelay: `${m.delay * 4}s` }}>
              <Mascot partner={m.partner} size={m.size} mood={m.partner === "ada" ? "happy" : "idle"} />
            </div>
          </div>
        ))}
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
