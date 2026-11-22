"use client";

// The study partner greets the student at the top of the dashboard (owner, 22 Nov 2026): one speech
// bubble. For a student who has chatted before, it keeps fading between the hello and a second message
// linking back to the course and straight into the last chat.
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

const READ_MS = 4000; // each message stays this long, then fades to the other
const FADE_MS = 300;

export function PartnerGreeting({ partner, name, lastStudied }: Props) {
  // The two messages take turns for as long as the page is open (owner, 22 Nov 2026), fading out
  // and in. It holds still while the pointer or keyboard focus is on the bubble, so a link can be
  // clicked without it changing under the pointer.
  const [msg, setMsg] = useState<"hello" | "back">("hello");
  const [fading, setFading] = useState(false);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!lastStudied || held) return;
    let swap: ReturnType<typeof setTimeout>;
    const out = setTimeout(() => {
      setFading(true);
      swap = setTimeout(() => {
        setMsg((m) => (m === "hello" ? "back" : "hello"));
        setFading(false);
      }, FADE_MS);
    }, READ_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(swap);
      setFading(false);
    };
  }, [lastStudied, held, msg]);

  const first = name?.trim().split(/\s+/)[0] ?? "";
  const link = "font-semibold text-ink underline decoration-[1.5px] underline-offset-[3px] hover:text-brand";

  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#ecdcfb] sm:h-11 sm:w-11">
        <Mascot partner={partner} size={34} mood="happy" animated={false} />
      </span>
      <div
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
        className="min-w-0 flex-1 rounded-2xl border-[1.5px] border-ink/85 bg-sunken/60 px-4 py-2.5 font-heading text-[14px] leading-relaxed text-ink sm:px-5 sm:py-3 sm:text-[15px]">
        <p
          className={`transition-opacity ease-out motion-reduce:transition-none motion-reduce:[animation:none] ${fading ? "opacity-0" : "opacity-100 [animation:fade-in_300ms_ease-out]"}`}
          style={{ transitionDuration: `${FADE_MS}ms` }}
          key={msg}
        >
          {msg === "hello" || !lastStudied ? (
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
