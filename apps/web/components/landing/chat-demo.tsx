"use client";

// Landing showcase, full screen like a product video: a student types a question, the study partner
// pulls up the exact slide, highlights the sentence that answers it, and replies with that sentence,
// cited. Then the student types "I still don't understand" and the partner re-explains it in plain
// words: the analogy sits in a labelled "not from your slides" box, as in the real app, and points
// back to the slide.
// Sample content in the style of the PAU decks: no real lecturer slide on the public page (PRD §16).
// Starts only when the whole section is on screen or "See how it works" is pressed, then loops:
// zooms in on the question box while each message is typed and back out when it is sent.
// With reduced motion it shows the finished state, no zoom.
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { DEMO_PLAY_EVENT } from "./see-how";

const QUESTION = "What is a B+ tree index?";
const ANSWER = "A B+ tree index keeps keys sorted, so lookups take O(log n) steps instead of scanning every row.";
const FOLLOW_UP = "I still don't understand";

// phase: 0 typing · 1 sent + thinking · 2 slide pops up · 3 highlight sweeps · 4 answer
//        5 typing the follow-up · 6 sent + thinking · 7 plain-words explanation · (hold, restart)
const TIMING = { zoomIn: 900, typePerChar: 70, afterType: 450, thinking: 1100, slide: 900, highlight: 1300, read: 2800, hold: 5600 };

// Type scale: phone, tablet, laptop and up.
const TEXT = "text-[15px] sm:text-[18px] lg:text-[20px]";
const CHIP = "whitespace-nowrap rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-medium text-teal-800 ring-1 ring-teal-200 sm:text-[13px]";

export function ChatDemo() {
  const [typed, setTyped] = useState(0);
  const [typed2, setTyped2] = useState(0);
  const [phase, setPhase] = useState(0);
  const [inView, setInView] = useState(false);
  const [origin, setOrigin] = useState("0px 100%");
  const box = useRef<HTMLElement>(null);
  const input = useRef<HTMLDivElement>(null);

  // Start only when the whole demo is on screen (or "See how it works" is pressed), so visitors see it
  // from the first keystroke instead of arriving mid-loop.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const start = () => setInView(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        const fills = entry.intersectionRect.height >= window.innerHeight * 0.9;
        if (entry.intersectionRatio >= 0.95 || fills) start();
      },
      { threshold: [0.5, 0.75, 0.9, 0.95, 1] },
    );
    io.observe(el);
    window.addEventListener(DEMO_PLAY_EVENT, start);
    return () => {
      io.disconnect();
      window.removeEventListener(DEMO_PLAY_EVENT, start);
    };
  }, []);

  // Zoom towards the start of the question box, wherever the centred column sits at this width.
  useEffect(() => {
    const el = box.current;
    const field = input.current;
    if (!el || !field) return;
    const ro = new ResizeObserver(() => {
      const a = el.getBoundingClientRect();
      const b = field.getBoundingClientRect();
      setOrigin(`${Math.round(b.left - a.left)}px 100%`);
    });
    ro.observe(el);
    return () => ro.disconnect();
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
    <section
      ref={box}
      id="demo"
      aria-label="Demo: a student asks what a B+ tree index is; Ada shows the slide, highlights the answer, then explains it again in plain words."
      /* overflow-anchor: none, or the browser scrolls the page whenever a message appears inside the demo */
      className="relative h-[100dvh] min-h-[560px] w-full overflow-hidden bg-[#f5f8fc] text-left [overflow-anchor:none]"
    >
      {/* Zoom layer: close-up on the question box while it is typed, back out once it is sent. */}
      <div aria-hidden className={`demo-zoom flex h-full flex-col ${zoomed ? "is-zoomed" : ""}`} style={{ transformOrigin: origin }}>
        {/* room for the floating menu bar, then the chat's course */}
        <div className="flex shrink-0 justify-center pt-24 sm:pt-28">
          <span className="rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-[#191919] ring-1 ring-black/10 sm:text-sm">
            CSC 420 · Transactions and indexing
          </span>
        </div>

        {/* Newest messages sit at the bottom; older ones scroll off the top, like a real chat. */}
        <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_64px)]">
          <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-4 pb-5 sm:gap-5 sm:px-8">
            {phase >= 1 && <UserBubble text={QUESTION} />}

            {phase === 1 && <Thinking text="Ada is finding the slide…" />}

            {phase >= 2 && (
              <div className="pop-in flex shrink-0 items-start gap-3">
                <Mascot partner="ada" size={40} mood={phase >= 4 ? "happy" : "thinking"} animated={false} />
                <div className="min-w-0 flex-1 space-y-3">
                  <Slide highlight={phase >= 3} />
                  {phase >= 4 && (
                    <div className={`pop-in rounded-2xl rounded-tl-md bg-white p-4 leading-relaxed text-[#191919] ring-1 ring-black/5 ${TEXT}`}>
                      <span className="mr-1 text-[#5f6673]">From your slide:</span>“{ANSWER}” <span className={CHIP}>Indexing · Slide 21</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {phase >= 6 && <UserBubble text={FOLLOW_UP} />}

            {phase === 6 && <Thinking text="Ada is putting it another way…" />}

            {phase >= 7 && (
              <div className="pop-in flex shrink-0 items-start gap-3">
                <Mascot partner="ada" size={40} mood="happy" animated={false} />
                <div className={`min-w-0 flex-1 space-y-3 rounded-2xl rounded-tl-md bg-white p-4 leading-relaxed text-[#191919] ring-1 ring-black/5 ${TEXT}`}>
                  <p>Let&apos;s take it one step at a time, with a picture you know.</p>
                  <div className="rounded-xl bg-amber-50 p-3.5 ring-1 ring-amber-200">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 sm:text-[12px]">
                      My explanation · not from your slides
                    </p>
                    <p>
                      Think of the library. You don&apos;t check every shelf for one book: you read the signs (“A–F this aisle”, then the
                      “C” shelf) and you&apos;re there in a few steps. A B+ tree index is those signs for a table.
                    </p>
                  </div>
                  <p>
                    <b>In short:</b> the index takes the database straight to the row, which is why your slide says lookups take{" "}
                    <b>O(log n) steps</b>. <span className={CHIP}>Indexing · Slide 21</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* input */}
        <div className="shrink-0 border-t border-black/5 bg-white">
          <div className="mx-auto flex w-full max-w-[920px] items-center gap-3 px-4 py-4 sm:px-8 sm:py-5">
            <div ref={input} className={`min-h-[24px] flex-1 rounded-full bg-[#f5f8fc] px-5 py-3 text-[#191919] ${TEXT}`}>
              {typing ? (
                <>
                  {draft}
                  <span className="ml-px inline-block h-[1.1em] w-px translate-y-[0.15em] animate-pulse bg-[#191919]" />
                </>
              ) : (
                <span className="text-[#5f6673]/70">Ask about Transactions and indexing…</span>
              )}
            </div>
            <span
              className={`rounded-full px-5 py-3 text-sm font-medium text-white transition-colors sm:text-base ${typing && ready ? "bg-[#0e1664]" : "bg-[#0e1664]/40"}`}
            >
              Send
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className={`pop-in ml-auto max-w-[80%] shrink-0 rounded-2xl rounded-br-md bg-[#0e1664] px-4 py-2.5 text-white ${TEXT}`}>{text}</div>
  );
}

function Thinking({ text }: { text: string }) {
  return (
    <div className="pop-in flex shrink-0 items-center gap-3 text-[14px] text-[#5f6673] sm:text-[17px]">
      <Mascot partner="ada" size={40} mood="thinking" />
      {text}
    </div>
  );
}

/** A slide in the style of the PAU decks (navy title band, bullets, small diagram). */
function Slide({ highlight }: { highlight: boolean }) {
  return (
    <div className="max-w-[680px] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10">
      <div className="bg-[#0b1b4d] px-5 py-3 text-center font-[Calibri,Carlito,'Segoe_UI',sans-serif] text-[16px] font-bold text-white sm:text-[24px]">
        Indexing: Why Are Indexes So Popular?
      </div>
      <div className="space-y-2 px-5 py-4 font-[Calibri,Carlito,'Segoe_UI',sans-serif] text-[13.5px] leading-snug text-[#0b1b4d] sm:text-[18px]">
        <p>▪ Without an index, the DBMS must scan every row of the table.</p>
        <p>
          ▪{" "}
          <span className={`demo-highlight rounded-sm ${highlight ? "is-on" : ""}`}>
            A <b>B+ tree index</b> keeps keys <b>sorted</b>, so lookups take O(log n) steps instead of scanning every row.
          </span>
        </p>
        <p>▪ Leaves are linked, so range queries walk them in order.</p>
        <svg viewBox="0 0 220 60" className="mx-auto w-44 sm:w-60" fill="none" stroke="#0b1b4d" strokeWidth="1.6">
          <rect x="92" y="2" width="36" height="14" rx="3" />
          <path d="M100 16 L46 34 M110 16 L110 34 M120 16 L174 34" />
          <rect x="24" y="34" width="44" height="14" rx="3" />
          <rect x="88" y="34" width="44" height="14" rx="3" />
          <rect x="152" y="34" width="44" height="14" rx="3" />
          <path d="M68 41 h20 M132 41 h20" strokeDasharray="3 3" />
        </svg>
        <p className="text-right text-[10px] text-[#0b1b4d]/60 sm:text-[13px]">Data Management II · Slide 21</p>
      </div>
    </div>
  );
}
