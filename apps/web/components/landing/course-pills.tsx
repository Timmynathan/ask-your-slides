"use client";

// "Your PAU courses are already here". Phones (owner, 27 Nov 2026): one thin row of every course gliding
// left to right on a loop, instead of pills that swap. Laptops and tablets: six fixed pills whose codes
// take turns (lib/landing-pills.ts).
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
    // Phones show the gliding row instead, so the swapping only runs from tablet width up.
    if (queue.length <= VISIBLE_PILLS || !window.matchMedia("(min-width: 640px)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
    <>
    <CourseRow queue={queue} />
    <div ref={band} className="mx-auto mt-5 hidden max-w-sm grid-cols-3 gap-2 sm:mt-7 sm:flex sm:max-w-none sm:flex-wrap sm:justify-center sm:gap-3" data-course-count={queue.length}>
      {st.showing.map((code, i) => (
        <span
          key={i}
          className="pop-in inline-flex items-center justify-center overflow-hidden rounded-full bg-white px-2 py-1.5 text-[13px] font-semibold text-[#0e1664] shadow-md shadow-black/20 sm:min-w-[118px] sm:px-4 sm:py-2 sm:text-[15px] sm:shadow-lg"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          {/* Keyed by code: a new code re-mounts this span and plays the swap animation. */}
          <span key={code} className="pill-swap inline-flex items-center gap-1.5 whitespace-nowrap sm:gap-2">
            <span className={`h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5 ${courseDot(queue.indexOf(code) + 1)}`} aria-hidden />
            {displayCode(code)}
          </span>
        </span>
      ))}
    </div>
    </>
  );
}

/** Phones: the whole list twice in one row, moved by half its width so the loop is seamless. About
 *  2.2 s per course, so it reads as a gentle drift. With reduced motion it's a row you can swipe. */
function CourseRow({ queue }: { queue: string[] }) {
  const pill = (code: string, k: string) => (
    <span key={k} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-[#0e1664] shadow-md shadow-black/20">
      <span className={`h-2 w-2 rounded-full ${courseDot(queue.indexOf(code) + 1)}`} aria-hidden />
      {displayCode(code)}
    </span>
  );
  return (
    <div
      className="course-row -mx-5 mt-5 overflow-hidden py-1 sm:hidden"
      style={{ maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)" }}
      aria-label={`${queue.length} PAU courses`}
    >
      <div className="course-row-track flex w-max gap-2 pr-2" style={{ animationDuration: `${Math.max(20, queue.length * 2.2)}s` }}>
        {queue.map((c) => pill(c, `a-${c}`))}
        <span aria-hidden className="contents">{queue.map((c) => pill(c, `b-${c}`))}</span>
      </div>
    </div>
  );
}
