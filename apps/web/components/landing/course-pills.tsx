"use client";

// "Your PAU courses are already here": six fixed pills whose codes take turns (lib/landing-pills.ts).
// They start the moment the visitor scrolls or the band comes into view: one swap at once, then one
// every SWAP_MS. With reduced motion, or six codes or fewer, they simply stay put.
import { useEffect, useMemo, useRef, useState } from "react";
import { nextCode, pillQueue, VISIBLE_PILLS } from "@/lib/landing-pills";
import { courseDot, displayCode } from "@/lib/study/format";

const SWAP_MS = 900;

export function CoursePills({ codes }: { codes: string[] }) {
  const queue = useMemo(() => pillQueue(codes), [codes]);
  const [st, setSt] = useState(() => ({
    showing: queue.slice(0, VISIBLE_PILLS),
    slot: -1, // the pill that changed last
    cursor: Math.min(VISIBLE_PILLS, queue.length) - 1, // the queue position shown last
  }));

  const band = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (queue.length <= VISIBLE_PILLS || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const swap = () =>
      setSt((s) => {
        const slot = (s.slot + 1) % s.showing.length;
        const next = nextCode(queue, s.showing, s.cursor);
        if (!next) return s;
        const showing = [...s.showing];
        showing[slot] = next.code;
        return { showing, slot, cursor: next.cursor };
      });
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id) return;
      swap(); // at once: the visitor sees it move as soon as they scroll
      id = setInterval(swap, SWAP_MS);
      window.removeEventListener("scroll", start);
      observer.disconnect();
    };
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && start(), { threshold: 0.2 });
    if (band.current) observer.observe(band.current);
    window.addEventListener("scroll", start, { passive: true, once: true });
    return () => {
      if (id) clearInterval(id);
      window.removeEventListener("scroll", start);
      observer.disconnect();
    };
  }, [queue]);

  return (
    <div ref={band} className="mt-7 flex flex-wrap justify-center gap-3" data-course-count={queue.length}>
      {st.showing.map((code, i) => (
        <span
          key={i}
          className="pop-in inline-flex min-w-[118px] items-center justify-center overflow-hidden rounded-full bg-white px-4 py-2 text-[15px] font-semibold text-[#0e1664] shadow-lg shadow-black/20"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          {/* Keyed by code: a new code re-mounts this span and plays the swap animation. */}
          <span key={code} className="pill-swap inline-flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${courseDot(queue.indexOf(code) + 1)}`} aria-hidden />
            {displayCode(code)}
          </span>
        </span>
      ))}
    </div>
  );
}
