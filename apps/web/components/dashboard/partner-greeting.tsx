"use client";

// The study partner greets the student at the top of the dashboard (owner, 22 Nov 2026): one speech
// bubble. It says hello; for a student who has chatted before, the words then fade out and the second
// message fades in in the same bubble, linking back to the course and straight into the last chat.
// Plain text (no typing effect). With "reduce motion" on, the swap happens without the fade.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { PARTNERS, type PartnerId } from "@/lib/partners";

interface Props {
  partner: PartnerId;
  name: string | null;
  lastStudied: { course: string; courseHref: string; chatHref: string } | null;
}

const READ_MS = 2600; // time to read the hello before it fades
const FADE_MS = 250;

export function PartnerGreeting({ partner, name, lastStudied }: Props) {
  // 0 = hello, 1 = fading out, 2 = the "jump back in" message.
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    if (!lastStudied) return;
    const out = setTimeout(() => setStage(1), READ_MS);
    const swap = setTimeout(() => setStage(2), READ_MS + FADE_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(swap);
    };
  }, [lastStudied]);

  const first = name?.trim().split(/\s+/)[0] ?? "";
  const link = "font-semibold text-ink underline decoration-[1.5px] underline-offset-[3px] hover:text-brand";

  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#ecdcfb] sm:h-11 sm:w-11">
        <Mascot partner={partner} size={34} mood="happy" animated={false} />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl border-[1.5px] border-ink/85 bg-sunken/60 px-4 py-2.5 font-heading text-[14px] leading-relaxed text-ink sm:px-5 sm:py-3 sm:text-[15px]">
        <p
          aria-live="polite"
          className={`transition-opacity ease-out motion-reduce:transition-none motion-reduce:[animation:none] ${stage === 1 ? "opacity-0" : "opacity-100 [animation:fade-in_250ms_ease-out]"}`}
          style={{ transitionDuration: `${FADE_MS}ms` }}
          key={stage === 2 ? "back" : "hello"}
        >
          {stage < 2 || !lastStudied ? (
            <>
              Hey{first ? ", " : ""}
              {first && <strong className="font-semibold">{first}</strong>}. I&apos;m {PARTNERS[partner].name}, your study partner, here to help you understand anything in your slides.
            </>
          ) : (
            <>
              Your last used topic was from{" "}
              <Link href={lastStudied.courseHref} className={link}>
                {lastStudied.course}
              </Link>
              . Shall we jump back in and{" "}
              <Link href={lastStudied.chatHref} className={link}>
                continue learning
              </Link>
              ?
            </>
          )}
        </p>
      </div>
    </div>
  );
}
