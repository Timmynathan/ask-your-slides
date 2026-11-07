"use client";

// Landing showcase: a student types a question, the study partner pulls up the exact slide,
// highlights the sentence that answers it, and replies with that sentence, cited.
// Sample content in the style of the PAU decks: no real lecturer slide on the public page (PRD §16).
// Then the student types "I still don't understand" and the partner re-explains it in plain words:
// the analogy sits in a labelled "not from your slides" box, as in the real app, and points back to the slide.
// Starts when scrolled into view, then loops: zooms in on the question box while each message is typed
// and back out when it is sent. With reduced motion it shows the finished state, no zoom.
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot/mascot";

const QUESTION = "What is a B+ tree index?";
const ANSWER = "A B+ tree index keeps keys sorted, so lookups take O(log n) steps instead of scanning every row.";
const FOLLOW_UP = "I still don't understand";

// phase: 0 typing · 1 sent + thinking · 2 slide pops up · 3 highlight sweeps · 4 answer
//        5 typing the follow-up · 6 sent + thinking · 7 plain-words explanation · (hold, restart)
const TIMING = { zoomIn: 900, typePerChar: 70, afterType: 450, thinking: 1100, slide: 900, highlight: 1300, read: 2600, hold: 5200 };

export function ChatDemo() {
  const [typed, setTyped] = useState(0);
  const [typed2, setTyped2] = useState(0);
  const [phase, setPhase] = useState(0);
  const [inView, setInView] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Start only when the demo is on screen, so visitors see it from the first keystroke instead of
  // arriving mid-loop.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setInView(true), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setTimeout(() => {
        setTyped(QUESTION.length);
        setTyped2(FOLLOW_UP.length);
        setPhase(7);
      }, 0);
      return () => clearTimeout(id);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const run = () => {
      let t = TIMING.zoomIn; // let the zoom-in land before the first keystroke
      at(0, () => {
        setPhase(0);
        setTyped(0);
        setTyped2(0);
      });
      for (let i = 1; i <= QUESTION.length; i++) at((t += TIMING.typePerChar), () => setTyped(i));
      at((t += TIMING.afterType), () => setPhase(1));
      at((t += TIMING.thinking), () => setPhase(2));
      at((t += TIMING.slide), () => setPhase(3));
      at((t += TIMING.highlight), () => setPhase(4));
      at((t += TIMING.read), () => setPhase(5));
      t += TIMING.zoomIn;
      for (let i = 1; i <= FOLLOW_UP.length; i++) at((t += TIMING.typePerChar), () => setTyped2(i));
      at((t += TIMING.afterType), () => setPhase(6));
      at((t += TIMING.thinking), () => setPhase(7));
      at((t += TIMING.hold), run);
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  const typing = phase === 0 || phase === 5;
  const draft = phase === 0 ? QUESTION.slice(0, typed) : FOLLOW_UP.slice(0, typed2);
  const ready = phase === 0 ? typed === QUESTION.length : typed2 === FOLLOW_UP.length;
  const zoomed = inView && typing;
  return (
    <div ref={box} className="mx-auto w-full max-w-[540px] overflow-hidden rounded-[22px] bg-white text-left shadow-xl ring-1 ring-black/10" aria-hidden>
      {/* Zoom layer: close-up on the question box while it is typed, back out once it is sent. */}
      <div className={`demo-zoom ${zoomed ? "is-zoomed" : ""}`}>
      {/* window bar */}
      <div className="flex items-center gap-2 border-b border-black/5 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-black/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-black/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-black/15" />
        <span className="ml-2 text-xs font-medium text-[#191919]">CSC 420 · Transactions and indexing</span>
      </div>

      {/* Newest messages sit at the bottom; older ones scroll off the top, like a real chat. */}
      <div className="flex h-[420px] flex-col justify-end gap-3 overflow-hidden bg-[#f5f8fc] p-4">
        {phase >= 1 && (
          <div className="pop-in ml-auto max-w-[80%] shrink-0 rounded-2xl rounded-br-md bg-[#0e1664] px-3.5 py-2 text-[14px] text-white">{QUESTION}</div>
        )}

        {phase === 1 && (
          <div className="pop-in flex shrink-0 items-center gap-2 text-[13px] text-[#5f6673]">
            <Mascot partner="ada" size={28} mood="thinking" />
            Ada is finding the slide…
          </div>
        )}

        {phase >= 2 && (
          <div className="pop-in flex shrink-0 items-start gap-2">
            <Mascot partner="ada" size={28} mood={phase >= 4 ? "happy" : "thinking"} animated={false} />
            <div className="min-w-0 flex-1 space-y-2.5">
              <Slide highlight={phase >= 3} />
              {phase >= 4 && (
                <div className="pop-in rounded-2xl rounded-tl-md bg-white p-3 text-[13.5px] leading-relaxed text-[#191919] ring-1 ring-black/5">
                  <span className="mr-1 text-[#5f6673]">From your slide:</span>“{ANSWER}”{" "}
                  <span className="whitespace-nowrap rounded-full bg-teal-50 px-2 py-0.5 text-[10.5px] font-medium text-teal-800 ring-1 ring-teal-200">
                    Indexing · Slide 21
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {phase >= 6 && (
          <div className="pop-in ml-auto max-w-[80%] shrink-0 rounded-2xl rounded-br-md bg-[#0e1664] px-3.5 py-2 text-[14px] text-white">{FOLLOW_UP}</div>
        )}

        {phase === 6 && (
          <div className="pop-in flex shrink-0 items-center gap-2 text-[13px] text-[#5f6673]">
            <Mascot partner="ada" size={28} mood="thinking" />
            Ada is putting it another way…
          </div>
        )}

        {phase >= 7 && (
          <div className="pop-in flex shrink-0 items-start gap-2">
            <Mascot partner="ada" size={28} mood="happy" animated={false} />
            <div className="min-w-0 flex-1 space-y-2 rounded-2xl rounded-tl-md bg-white p-3 text-[13.5px] leading-relaxed text-[#191919] ring-1 ring-black/5">
              <p>No wahala, let&apos;s try it another way.</p>
              <div className="rounded-xl bg-amber-50 p-2.5 ring-1 ring-amber-200">
                <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-amber-800">My explanation · not from your slides</p>
                <p>
                  Think of the library. You don&apos;t check every shelf for one book: you read the signs (“A–F this aisle”, then the
                  “C” shelf) and you&apos;re there in a few steps. A B+ tree index is those signs for a table.
                </p>
              </div>
              <p>
                That&apos;s why your slide says lookups take <b>O(log n) steps</b> instead of scanning every row.{" "}
                <span className="whitespace-nowrap rounded-full bg-teal-50 px-2 py-0.5 text-[10.5px] font-medium text-teal-800 ring-1 ring-teal-200">
                  Indexing · Slide 21
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* input */}
      <div className="flex items-center gap-2 border-t border-black/5 bg-white px-3 py-2.5">
        <div className="min-h-[22px] flex-1 rounded-full bg-[#f5f8fc] px-3.5 py-2 text-[14px] text-[#191919]">
          {typing ? (
            <>
              {draft}
              <span className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-[#191919]" />
            </>
          ) : (
            <span className="text-[#5f6673]/70">Ask about Transactions and indexing…</span>
          )}
        </div>
        <span className={`rounded-full px-3.5 py-2 text-xs font-medium text-white transition-colors ${typing && ready ? "bg-[#0e1664]" : "bg-[#0e1664]/40"}`}>
          Send
        </span>
      </div>
      </div>
    </div>
  );
}

/** A slide in the style of the PAU decks (navy title band, bullets, small diagram). */
function Slide({ highlight }: { highlight: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-black/10">
      <div className="bg-[#0b1b4d] px-4 py-2.5 text-center font-[Calibri,Carlito,'Segoe_UI',sans-serif] text-[15px] font-bold text-white">
        Indexing: Why Are Indexes So Popular?
      </div>
      <div className="space-y-1.5 px-4 py-3 font-[Calibri,Carlito,'Segoe_UI',sans-serif] text-[12.5px] leading-snug text-[#0b1b4d]">
        <p>▪ Without an index, the DBMS must scan every row of the table.</p>
        <p>
          ▪{" "}
          <span className={`demo-highlight rounded-sm ${highlight ? "is-on" : ""}`}>
            A <b>B+ tree index</b> keeps keys <b>sorted</b>, so lookups take O(log n) steps instead of scanning every row.
          </span>
        </p>
        <p>▪ Leaves are linked, so range queries walk them in order.</p>
        <svg viewBox="0 0 220 60" className="mx-auto w-44" fill="none" stroke="#0b1b4d" strokeWidth="1.6">
          <rect x="92" y="2" width="36" height="14" rx="3" />
          <path d="M100 16 L46 34 M110 16 L110 34 M120 16 L174 34" />
          <rect x="24" y="34" width="44" height="14" rx="3" />
          <rect x="88" y="34" width="44" height="14" rx="3" />
          <rect x="152" y="34" width="44" height="14" rx="3" />
          <path d="M68 41 h20 M132 41 h20" strokeDasharray="3 3" />
        </svg>
        <p className="text-right text-[10px] text-[#0b1b4d]/60">Data Management II · Slide 21</p>
      </div>
    </div>
  );
}
