"use client";

// One clean question box that types a prompt, "sends" it (the arrow lights up and presses), pauses
// and repeats. Starts when on screen; with reduced motion it simply shows the full prompt.
import { useEffect, useRef, useState } from "react";

export function TypingBox({ text }: { text: string }) {
  const [typed, setTyped] = useState(0);
  const [sent, setSent] = useState(false);
  const [inView, setInView] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setInView(true), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      at(0, () => setTyped(text.length));
      return () => timers.forEach(clearTimeout);
    }
    const run = () => {
      let t = 400;
      at(0, () => {
        setSent(false);
        setTyped(0);
      });
      for (let i = 1; i <= text.length; i++) at((t += 75), () => setTyped(i));
      at((t += 600), () => setSent(true));
      at((t += 2200), run);
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [inView, text]);

  const done = typed === text.length;
  return (
    // Fixed height: nothing on the page shifts while it animates.
    <div ref={box} className="flex h-[76px] items-center" aria-hidden>
      <div className="flex w-full items-center gap-2 rounded-full bg-card py-1.5 pl-4 pr-1.5 shadow-[0_1px_3px_rgb(0_0_0/0.08)]">
        <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
          {text.slice(0, typed)}
          {!sent && <span className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-ink" />}
        </span>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white transition-all duration-200 ${
            sent ? "scale-90 bg-brand" : done ? "bg-brand" : "bg-black/10"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </span>
      </div>
    </div>
  );
}
