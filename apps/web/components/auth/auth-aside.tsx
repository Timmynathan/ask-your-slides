"use client";

// The right half of /sign-up and /sign-in (owner, 20 Nov 2026): a headline, one study partner with a
// speech bubble that changes every few seconds, and who it's for. Deliberately simple: one character,
// one soft motion. The headline is the owner's wording.
import { useEffect, useState } from "react";
import { Mascot } from "@/components/mascot/mascot";

const LINES = [
  "Here's the exact slide that covers it.",
  "Let's break that down, step by step.",
  "Want me to quiz you on this topic?",
  "This came up in 2 past papers.",
];

export function AuthAside({ signUp }: { signUp: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LINES.length), 3200);
    return () => clearInterval(t);
  }, []);

  return (
    <aside className="relative hidden flex-col items-center justify-between overflow-hidden bg-[#f5f8fc] px-10 py-14 lg:flex" aria-hidden>
      <p className="max-w-lg text-center font-heading text-[30px] leading-snug text-ink">
        Students get <span className="rounded-md bg-[#cfe3fb] px-1.5 italic [box-decoration-break:clone]">higher grades</span>
        <br />
        with Ask Your Slides!
      </p>

      <div className="flex flex-col items-center">
        <div className="relative mb-5 h-[60px] w-[340px]">
          <div
            key={i}
            className="auth-bubble absolute inset-x-0 bottom-0 mx-auto w-fit max-w-full rounded-[20px] bg-white px-5 py-3 text-center text-[15px] text-ink shadow-[0_8px_30px_rgba(14,22,100,0.10)]"
          >
            {LINES[i]}
            <span className="absolute -bottom-1.5 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 bg-white" />
          </div>
        </div>
        <div className="relative grid place-items-center">
          <span className="absolute h-[250px] w-[250px] rounded-full bg-[#e3eefc]" />
          <span className="auth-ring absolute h-[250px] w-[250px] rounded-full border border-[#0e1664]/15" />
          <div className="relative">
            <Mascot partner="ada" size={200} mood="happy" />
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
