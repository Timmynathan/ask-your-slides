"use client";

// A small chat input that types a prompt, "sends" it, pauses and repeats. Starts when on screen;
// with reduced motion it simply shows the full prompt.
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
      let t = 300;
      at(0, () => {
        setSent(false);
        setTyped(0);
      });
      for (let i = 1; i <= text.length; i++) at((t += 65), () => setTyped(i));
      at((t += 500), () => setSent(true));
      at((t += 2600), run);
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [inView, text]);

  return (
    /* Fixed height: the bubble appearing must not change the page height (it would shift everything below). */
    <div ref={box} className="flex h-[76px] flex-col justify-end gap-2 overflow-hidden" aria-hidden>
      {sent && (
        <div className="pop-in ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-[#0e1664] px-3 py-1.5 text-[13px] text-white">{text}</div>
      )}
      <div className="flex items-center gap-2 rounded-full bg-card py-1.5 pl-3.5 pr-1.5 ring-1 ring-line">
        <span className="min-h-[20px] flex-1 text-[13px] text-ink">
          {sent ? <span className="text-muted/70">Ask anything…</span> : text.slice(0, typed)}
          {!sent && <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-ink" />}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium text-white ${!sent && typed === text.length ? "bg-[#0e1664]" : "bg-[#0e1664]/40"}`}>
          Send
        </span>
      </div>
    </div>
  );
}
