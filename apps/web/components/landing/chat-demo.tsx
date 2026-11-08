"use client";

// Landing demo, framed as a video player that fills the screen: a student types a question, the study
// partner pulls up the exact slide, highlights the sentence that answers it, and replies with that
// sentence, cited. Then the student types "I still don't understand" and the partner re-explains it in
// plain words: the analogy sits in the "Ada's explanation · beyond your slides" box, as in the real app, and
// points back to the slide.
// Sample content in the style of the PAU decks: no real lecturer slide on the public page (PRD §16).
//
// Playback: never starts by itself. Plays once (no loop) when "See how it works", Watch or Play is pressed;
// pauses when scrolled away; a corner Pause/Play button and a progress line while it runs. Everything on screen is
// derived from one clock (elapsed ms), so pausing is just stopping the clock. With reduced motion,
// Play jumps to the finished conversation, no zoom.
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { BEYOND_BOX, BeyondSlidesLabel } from "@/components/study/beyond-slides";
import { DEMO_PLAY_EVENT } from "./see-how";

const QUESTION = "What is a B+ tree index?";
const ANSWER = "A B+ tree index keeps keys sorted, so lookups take O(log n) steps instead of scanning every row.";
const FOLLOW_UP = "I still don't understand";

// Timeline (ms). Zoom in, type, send, think, slide, highlight, answer, read; zoom in, type the
// follow-up, send, think, explanation, hold.
const PER_CHAR = 70;
const LEAD = 900; // the whole chat, unzoomed, before the camera moves in on the question box
const TYPE_1 = LEAD + 900;
const SEND_1 = TYPE_1 + QUESTION.length * PER_CHAR + 450;
const SLIDE = SEND_1 + 2600; // "Ada is searching your slides…", held in close-up
const HIGHLIGHT = SLIDE + 900;
const ANSWERED = HIGHLIGHT + 1300;
const ZOOM_2 = ANSWERED + 2800;
const TYPE_2 = ZOOM_2 + 900;
const SEND_2 = TYPE_2 + FOLLOW_UP.length * PER_CHAR + 450;
const EXPLAINED = SEND_2 + 1100;
const TOTAL = EXPLAINED + 3000;
// The demo's length as a video player shows it, e.g. "0:21".
const LENGTH = `${Math.floor(Math.round(TOTAL / 1000) / 60)}:${String(Math.round(TOTAL / 1000) % 60).padStart(2, "0")}`;

// phase: 0 typing · 1 sent + thinking · 2 slide · 3 highlight · 4 answer · 5 typing follow-up · 6 thinking · 7 explanation
function phaseAt(e: number): number {
  return [SEND_1, SLIDE, HIGHLIGHT, ANSWERED, ZOOM_2, SEND_2, EXPLAINED].filter((t) => e >= t).length;
}
const typedAt = (e: number, start: number, len: number) => Math.max(0, Math.min(len, Math.floor((e - start) / PER_CHAR)));

// Type scale: phone, tablet, laptop and up.
const TEXT = "text-[15px] sm:text-[18px] lg:text-[20px]";
// Same quiet grey pill as the citation chips in the real chat (components/study/answer.tsx).
const CHIP = "whitespace-nowrap rounded-full bg-[#eef2f8] px-2 py-px align-middle text-[11.5px] text-[#191919]/70 sm:text-[13px]";

export function ChatDemo() {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  // Reduced motion: Play shows the finished chat at once, so no end screen over it.
  const [instant, setInstant] = useState(false);
  // Zoom targets: the question box, and the "searching your slides" line just above it.
  const [origins, setOrigins] = useState({ input: "0px 100%", search: "0px 85%" });
  const clock = useRef(0);
  const box = useRef<HTMLElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLDivElement>(null);

  const ended = elapsed >= TOTAL;

  // Kept in a ref so the observer and the "See how it works" listener always call the latest version.
  type Control = { play: (restart: boolean) => void; pause: () => void; started: boolean; ended: boolean };
  const control = useRef<Control>({ play: () => {}, pause: () => {}, started: false, ended: false });
  useEffect(() => {
    control.current = {
      started,
      ended,
      pause: () => setPlaying(false),
      play: (restart: boolean) => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          clock.current = TOTAL;
          setElapsed(TOTAL);
          setStarted(true);
          setInstant(true);
          return;
        }
        if (restart || clock.current >= TOTAL) {
          clock.current = 0;
          setElapsed(0);
        }
        setStarted(true);
        setInstant(false);
        setPlaying(true);
      },
    };
  });

  // No autoplay: scrolling to the player leaves it on its Watch poster. Pauses when mostly scrolled away.
  // "See how it works" plays it from the start (or resumes it if it was paused part-way).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // "Seen" = the player has been fully on screen since it was last started from elsewhere. Pausing on
    // scroll-away applies only then, so "See how it works" isn't paused while the page scrolls to it.
    // "See how it works" doesn't play straight away: it asks to play once the player has scrolled fully
    // into view, so the visitor sees the opening (unzoomed chat, then the zoom in) instead of missing it.
    let seen = false;
    let wanted: null | boolean = null; // pending "play" request: restart?
    let full = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        const c = control.current;
        full = entry.intersectionRatio >= 0.95 || entry.intersectionRect.height >= window.innerHeight * 0.9;
        if (full) {
          seen = true;
          if (wanted !== null) {
            c.play(wanted);
            wanted = null;
          }
        }
        if (seen && entry.intersectionRatio < 0.4) c.pause();
      },
      { threshold: [0, 0.4, 0.5, 0.75, 0.9, 0.95, 1] },
    );
    io.observe(el);
    const onPlay = () => {
      const restart = !control.current.started || control.current.ended;
      if (full) control.current.play(restart);
      else {
        seen = false;
        wanted = restart;
      }
    };
    window.addEventListener(DEMO_PLAY_EVENT, onPlay);
    return () => {
      io.disconnect();
      window.removeEventListener(DEMO_PLAY_EVENT, onPlay);
    };
  }, []);

  // The clock: runs only while playing, stops by itself at the end (no loop).
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      clock.current = Math.min(TOTAL, clock.current + (now - last));
      last = now;
      setElapsed(clock.current);
      if (clock.current >= TOTAL) setPlaying(false);
    }, 40);
    return () => clearInterval(id);
  }, [playing]);

  // Zoom targets, wherever the centred column sits at this width: the start of the question box, and
  // the "searching" line (the last row of the chat, just above the input bar). Offsets, not bounding
  // rects, so a measurement taken while zoomed isn't skewed by the scale.
  useEffect(() => {
    const el = layer.current;
    const field = input.current;
    const bar = field?.parentElement?.parentElement;
    if (!el || !field || !bar) return;
    const ro = new ResizeObserver(() => {
      let left = 0;
      for (let n: HTMLElement | null = field; n && n !== el; n = n.offsetParent as HTMLElement | null) left += n.offsetLeft;
      const searchY = el.offsetHeight - bar.offsetHeight - 40; // middle of the last chat row
      setOrigins({ input: `${left}px 100%`, search: `${left}px ${searchY}px` });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const phase = phaseAt(elapsed);
  const typing = phase === 0 || phase === 5;
  const typed = typedAt(elapsed, TYPE_1, QUESTION.length);
  const typed2 = typedAt(elapsed, TYPE_2, FOLLOW_UP.length);
  const draft = phase === 0 ? QUESTION.slice(0, typed) : FOLLOW_UP.slice(0, typed2);
  const ready = phase === 0 ? typed === QUESTION.length : typed2 === FOLLOW_UP.length;
  const searching = phase === 1;
  const zoomed = started && !ended && ((phase === 0 && elapsed >= LEAD) || searching || phase === 5);
  // From the question box the camera glides up to the searching line (transform-origin is animated).
  const origin = searching ? origins.search : origins.input;

  const toggle = () => (playing ? setPlaying(false) : control.current.play(ended));

  return (
    <section
      ref={box}
      id="demo"
      aria-label="Demo video"
      /* overflow-anchor: none, or the browser scrolls the page whenever a message appears inside the demo */
      className="h-[100dvh] min-h-[640px] w-full scroll-mt-0 bg-page px-4 pb-4 pt-[150px] [overflow-anchor:none] sm:px-10 sm:pb-6 sm:pt-[180px] lg:px-16"
    >
      <div className="relative mx-auto h-full max-w-[1240px]">
      <PeekingPartner />
      <SeeHowNote />
      <div className="relative z-10 flex h-full flex-col overflow-hidden rounded-[28px] bg-[#f5f8fc] text-left shadow-xl ring-2 ring-brand">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {/* Zoom layer: close-up on the question box while it is typed, back out once it is sent. */}
          <div
            ref={layer}
            aria-hidden
            className={`demo-zoom flex h-full flex-col ${zoomed ? "is-zoomed" : ""}`}
            style={{ transformOrigin: origin }}
          >
            {/* Newest messages sit at the bottom; older ones scroll off the top, like a real chat. */}
            <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_56px)]">
              <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-4 pb-5 sm:gap-5 sm:px-8">
                {phase >= 1 && <UserBubble text={QUESTION} />}

                {phase === 1 && <Thinking text="Ada is searching your slides" dots />}

                {phase >= 2 && (
                  <div className="pop-in flex shrink-0 items-start gap-3">
                    <Mascot partner="ada" size={40} mood={phase >= 4 ? "happy" : "thinking"} animated={false} />
                    <div className="min-w-0 flex-1 space-y-3">
                      <Slide highlight={phase >= 3} />
                      {phase >= 4 && (
                        <div className={`pop-in rounded-2xl rounded-tl-md bg-white p-4 leading-relaxed text-[#191919] ring-1 ring-black/5 ${TEXT}`}>
                          {ANSWER} <span className={CHIP}>Transactions and Indexing · Slide 21</span>
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
                      <div className={BEYOND_BOX}>
                        <BeyondSlidesLabel name="Ada" className="text-[12px] sm:text-[14px]" />
                        <p>
                          Think of the library. You don&apos;t check every shelf for one book: you read the signs (“A–F this aisle”, then the
                          “C” shelf) and you&apos;re there in a few steps. A B+ tree index is those signs for a table.
                        </p>
                      </div>
                      <p>
                        <b>In short:</b> the index takes the database straight to the row, which is why your slide says lookups take{" "}
                        <b>O(log n) steps</b>. <span className={CHIP}>Transactions and Indexing · Slide 21</span>
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
                  {typing && started ? (
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

          {/* While it plays (or is paused part-way): a quiet pause/play button in the corner and a thin
              progress line along the bottom, as on a video. */}
          {started && !ended && (
            <>
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? "Pause demo" : "Play demo"}
                title={playing ? "Pause" : "Play"}
                className="absolute right-3 top-3 z-10 grid h-10 w-10 sm:right-4 sm:top-4 place-items-center rounded-full bg-[#0e1664]/85 text-white shadow-md backdrop-blur transition hover:bg-[#0e1664] active:scale-90"
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <div className="absolute inset-x-0 bottom-0 h-1 bg-pau-100" aria-hidden>
                <div className="h-full bg-[#0e1664]" style={{ width: `${(elapsed / TOTAL) * 100}%` }} />
              </div>
            </>
          )}

          {/* Poster before it starts; end screen (blurred chat, big replay) once it has played. */}
          {(!started || (ended && !instant)) && (
            <div
              className={`absolute inset-0 grid place-items-center ${started ? "fade-in bg-white/35 backdrop-blur-[1.5px]" : "bg-white/50 backdrop-blur-[2px]"}`}
            >
              {/* One pill, like a video player's: play icon, "Watch", and how long the demo runs. */}
              <button
                type="button"
                onClick={() => control.current.play(true)}
                aria-label={started ? `Watch again, ${LENGTH}` : `Watch the demo, ${LENGTH}`}
                className="inline-flex items-center gap-3 rounded-full bg-[#0e1664] py-3.5 pl-6 pr-7 text-white shadow-[0_10px_30px_rgb(14_22_100/0.35)] ring-[3px] ring-white transition hover:scale-[1.03] hover:bg-[#0a0f47] active:scale-95 sm:py-4 sm:pl-7 sm:pr-8"
              >
                {started ? (
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.8h2.8" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 12 12" aria-hidden>
                    <path d="M2.6 1.2v9.6L10.6 6z" fill="currentColor" />
                  </svg>
                )}
                <span className="text-lg font-medium sm:text-xl">
                  {started ? "Watch again" : "Watch"} <span aria-hidden className="text-white/70">·</span> <span className="tabular-nums">{LENGTH}</span>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
      <PeekingHands />
      </div>
    </section>
  );
}

// Ada (who answers in the demo) peeking over the top-left edge of the player: her head sits behind
// the player, her hands curl over its edge in front of it. Decorative.
const PEEK_LEFT = "left-6 sm:left-14";
function PeekingPartner() {
  return (
    <div aria-hidden className={`pointer-events-none absolute bottom-full ${PEEK_LEFT} z-0 translate-y-[22px] sm:translate-y-[30px]`}>
      <span className="block sm:hidden">
        <Mascot partner="ada" size={72} mood="happy" title="" />
      </span>
      <span className="hidden sm:block">
        <Mascot partner="ada" size={100} mood="happy" title="" />
      </span>
    </div>
  );
}
function PeekingHands() {
  const hand = (
    <svg viewBox="0 0 30 22" className="h-[20px] w-[27px] sm:h-[25px] sm:w-[34px]">
      <path d="M2 9C2 4 6 1.5 15 1.5S28 4 28 9v4c0 4.5-3.5 7.5-8 7.5h-10C5.5 20.5 2 17.5 2 13Z" fill="#9a5f3a" stroke="#22140f" strokeWidth="1.6" />
      <path d="M10.5 12v6M15 12v7M19.5 12v6" stroke="#22140f" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
  return (
    <div aria-hidden className={`pointer-events-none absolute top-0 ${PEEK_LEFT} z-20 flex w-[72px] -translate-x-1.5 -translate-y-[11px] justify-between sm:w-[100px] sm:-translate-x-2 sm:-translate-y-[13px]`}>
      {hand}
      {hand}
    </div>
  );
}

// Handwritten note on the right, with a curly arrow pointing down into the player.
function SeeHowNote() {
  return (
    <div aria-hidden className="pointer-events-none absolute bottom-full right-4 z-20 flex items-end gap-1 pb-1 sm:right-10 sm:gap-2">
      <span className="mb-3 font-heading text-[15px] italic text-ink sm:mb-4 sm:text-xl">See how Ask Your Slides works</span>
      <svg viewBox="0 0 40 56" className="h-[42px] w-[30px] text-ink sm:h-[56px] sm:w-[40px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8C17 3 31 9 33 22c1.5 9-2 18-8 27" />
        <path d="M17 44l8 6 4-9" />
      </svg>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden>
      <path d="M3 1.8v8.4L10 6z" fill="currentColor" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden>
      <path d="M3 2h2.2v8H3zM6.8 2H9v8H6.8z" fill="currentColor" />
    </svg>
  );
}
function UserBubble({ text }: { text: string }) {
  return (
    <div className={`pop-in ml-auto max-w-[80%] shrink-0 rounded-2xl rounded-br-md bg-[#0e1664] px-4 py-2.5 text-white ${TEXT}`}>{text}</div>
  );
}

function Thinking({ text, dots = false }: { text: string; dots?: boolean }) {
  return (
    <div className="pop-in flex shrink-0 items-center gap-3 text-[14px] text-[#5f6673] sm:text-[17px]">
      <Mascot partner="ada" size={40} mood="thinking" />
      <span>
        {text}
        {dots && (
          <span className="loading-dots ml-1 inline-flex gap-[3px] align-middle" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        )}
      </span>
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
          <span className={`demo-highlight ${highlight ? "is-on" : ""}`}>
            A <b>B+ tree index</b> keeps keys <b>sorted</b>, so lookups take O(log n) steps instead of scanning every row.
          </span>
          {highlight && (
            <span className="ai-tag pop-in ml-2 inline-flex translate-y-[-2px] items-center gap-1 rounded-full px-2 py-0.5 align-middle font-sans text-[10px] font-semibold uppercase tracking-wider text-white sm:text-[11px]">
              ✦ Ada found this
            </span>
          )}
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
