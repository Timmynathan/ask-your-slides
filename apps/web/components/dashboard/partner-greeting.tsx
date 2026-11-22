"use client";

// The study partner greets the student at the top of the dashboard (owner, 22 Nov 2026): one speech
// bubble. For a student who has chatted before, it keeps fading between the hello and a second message
// linking back to the course and straight into the last chat.
// Plain text (no typing effect). With "reduce motion" on, the swap happens without the fade.
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { PARTNERS, type PartnerId } from "@/lib/partners";

interface Props {
  partner: PartnerId;
  name: string | null;
  lastStudied: { course: string; courseHref: string; chatHref: string } | null;
}

const READ_MS = 4000; // each message stays this long, then fades to the other
const FADE_MS = 300;
const WIDTH_MS = 300; // the bubble's glide to the next message's width

export function PartnerGreeting({ partner, name, lastStudied }: Props) {
  // The two messages take turns for as long as the page is open (owner, 22 Nov 2026), fading out
  // and in. It holds still while the pointer or keyboard focus is on the bubble, so a link can be
  // clicked without it changing under the pointer.
  const [msg, setMsg] = useState<"hello" | "back">("hello");
  const [fading, setFading] = useState(false);
  const [held, setHeld] = useState(false);
  // Each turn: the words fade out, the message changes while hidden, the bubble glides to its new
  // width, and only then do the new words fade in, so they never wrap mid-glide (owner, 22 Nov 2026).
  useEffect(() => {
    if (!lastStudied || held) return;
    let timer: ReturnType<typeof setTimeout>;
    const after = (ms: number, then: () => void) => {
      timer = setTimeout(then, ms);
    };
    const turn = () =>
      after(READ_MS, () => {
        setFading(true);
        after(FADE_MS, () => {
          setMsg((m) => (m === "hello" ? "back" : "hello"));
          after(WIDTH_MS + 40, () => {
            setFading(false);
            turn();
          });
        });
      });
    turn();
    return () => {
      clearTimeout(timer);
      setFading(false);
    };
  }, [lastStudied, held]);

  // The width of the message on show, measured from the invisible copy (null until measured).
  const measure = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const sync = () => setWidth(Math.ceil(el.getBoundingClientRect().width));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [msg]);
  const bubble = "rounded-2xl border-[1.5px] border-ink/85 bg-sunken/60 px-4 py-2.5 font-heading text-[16px] leading-relaxed text-ink sm:px-5 sm:py-3";

  const first = name?.trim().split(/\s+/)[0] ?? "";
  const link = "font-semibold text-ink underline decoration-[1.5px] underline-offset-[3px] hover:text-brand";

  const text = (which: "hello" | "back") =>
    which === "hello" || !lastStudied ? (
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
    );

  return (
    <div className="mb-6 flex items-center gap-3">
      {/* The partner on their own, no ring around them (owner, 22 Nov 2026). */}
      <Mascot partner={partner} size={44} mood="happy" animated={false} className="shrink-0" />
      <div className="relative min-w-0 flex-1">
        {/* The bubble is as wide as its message (owner, 22 Nov 2026), and glides to the next one's
            width while the words are faded out. An invisible copy measures that width. */}
        <div ref={measure} aria-hidden className={`${bubble} invisible absolute left-0 top-0 w-max max-w-full`}>
          {text(msg)}
        </div>
        <div
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          className={`${bubble} max-w-full ${width === null ? "w-max" : ""} transition-[width] ease-out motion-reduce:transition-none`}
          style={width === null ? undefined : { width, transitionDuration: `${WIDTH_MS}ms` }}
        >
          <p
            className={`transition-opacity ease-out motion-reduce:transition-none motion-reduce:[animation:none] ${fading ? "opacity-0" : "opacity-100 [animation:fade-in_300ms_ease-out]"}`}
            style={{ transitionDuration: `${FADE_MS}ms` }}
            key={msg}
          >
            {text(msg)}
          </p>
        </div>
      </div>
    </div>
  );
}
