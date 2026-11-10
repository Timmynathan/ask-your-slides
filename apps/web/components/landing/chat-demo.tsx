"use client";

// Landing demo, framed as a video player. The story, with a caption for each beat:
//  ① the student's courses, slides already there (no uploading), and a tap on CSC 420;
//  ② a question about *their* slides: the partner pulls up the exact slide, highlights the sentence
//     that answers it, and replies with it, cited;
//  ③ "I still don't understand": the partner re-explains in plain words (the analogy sits in the
//     "Ada's explanation · beyond your slides" box, as in the real app) and points back to the slide;
//  then an end card: try it free, or watch again.
// Course names and slide counts are the real ones (Nov 2026); the slide itself is a sample.
// Sample content in the style of the PAU decks: no real lecturer slide on the public page (PRD §16).
//
// Playback: never starts by itself. Plays once (no loop) when "See how it works", Watch or Play is pressed;
// pauses when scrolled away; a corner Pause/Play button and a progress line while it runs. Everything on screen is
// derived from one clock (elapsed ms), so pausing is just stopping the clock. With reduced motion,
// Play jumps to the finished conversation, no zoom.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { BEYOND_BOX, BeyondSlidesLabel } from "@/components/study/beyond-slides";
import { DemoAudio, savedMuted } from "./demo-audio";
import { DEMO_PLAY_EVENT } from "./see-how";

const QUESTION = "What do my CSC 420 slides say about B+ tree indexes?";
const ANSWER = "A B+ tree index keeps keys sorted, so lookups take O(log n) steps instead of scanning every row.";
const FOLLOW_UP = "I still don't understand";

// Timeline (ms). Courses, pointer moves in, tap CSC 420; chat: zoom in, type, send, think, slide,
// highlight, answer, read; zoom in, type the follow-up, send, think, explanation, hold.
const PER_CHAR = 58;
const POINT = 700; // the pointer starts moving towards CSC 420
const TAP = 2700;
const OPEN = 3400; // the course opens: the chat
const LEAD = OPEN + 700; // the whole chat, unzoomed, before the camera moves in on the question box
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

// Captions, one per beat.
const CAPTIONS = [
  "No uploads. Your slides are already here.",
  "Every answer shows the exact slide.",
  "Still confused? It explains it your way.",
] as const;
function captionAt(e: number): number {
  return e < SEND_1 ? 0 : e < ZOOM_2 ? 1 : 2;
}

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

  // Sound (music + small effects). Created on the first click; muting is remembered.
  const audio = useRef<DemoAudio | null>(null);
  const sound = () => (audio.current ??= new DemoAudio());
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(savedMuted()); // eslint-disable-line react-hooks/set-state-in-effect -- read browser storage after hydration
    return () => audio.current?.close();
  }, []);

  // Kept in a ref so the observer and the "See how it works" listener always call the latest version.
  type Control = { play: (restart: boolean) => void; pause: () => void; started: boolean; ended: boolean };
  const control = useRef<Control>({ play: () => {}, pause: () => {}, started: false, ended: false });
  useEffect(() => {
    control.current = {
      started,
      ended,
      pause: () => {
        setPlaying(false);
        audio.current?.pause();
      },
      play: (restart: boolean) => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          clock.current = TOTAL;
          setElapsed(TOTAL);
          setStarted(true);
          setInstant(true);
          return;
        }
        if (restart || clock.current >= TOTAL || !started) {
          clock.current = 0;
          setElapsed(0);
          sound().start();
        } else sound().resume();
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
      // Still inside the "See how it works" click: unlock audio now, so it can start once scrolled into view.
      (audio.current ??= new DemoAudio()).unlock();
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
      if (clock.current >= TOTAL) {
        setPlaying(false);
        audio.current?.finish();
      }
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
  const inCourses = !started || (!instant && elapsed < OPEN);
  const caption = captionAt(elapsed);
  // From the question box the camera glides up to the searching line (transform-origin is animated).
  const origin = searching ? origins.search : origins.input;

  const toggle = () => (playing ? control.current.pause() : control.current.play(ended));

  // Sound effects, in step with the picture: a key per typed letter, then send / tap / pops.
  const tappedNow = started && elapsed >= TAP;
  const prev = useRef({ typed: 0, typed2: 0, phase: 0, tapped: false });
  useEffect(() => {
    const p = prev.current;
    const a = audio.current;
    if (a && playing) {
      if ((phase === 0 && typed > p.typed && elapsed >= TYPE_1) || (phase === 5 && typed2 > p.typed2)) a.key();
      if (tappedNow && !p.tapped) a.tap();
      if (phase !== p.phase) {
        if (phase === 1 || phase === 6) a.send();
        if (phase === 2 || phase === 4 || phase === 7) a.pop();
      }
    }
    prev.current = { typed, typed2, phase, tapped: tappedNow };
  }, [typed, typed2, phase, tappedNow, playing, elapsed]);

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
            className={`demo-zoom flex h-full flex-col ${zoomed ? "is-zoomed" : ""} ${phase === 0 ? "is-long" : ""}`}
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

          {/* Scene 1: the student's courses, already full of slides. Also the poster's backdrop. */}
          {inCourses && <Courses pointing={started && elapsed >= POINT} tapped={started && elapsed >= TAP} />}

          {/* Caption for the current beat. */}
          {started && !ended && !instant && (
            <div className="pointer-events-none absolute inset-x-0 top-[62px] z-10 flex justify-center px-3 sm:top-5 sm:px-32">
              <p
                key={caption}
                role="status"
                className="pop-in inline-flex items-center gap-2.5 rounded-full bg-[#0e1664] py-2 pl-2 pr-4 text-[13px] font-medium text-white shadow-lg sm:py-2.5 sm:pl-2.5 sm:pr-5 sm:text-[17px]"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[12px] font-bold text-[#0e1664] sm:h-7 sm:w-7 sm:text-[14px]">
                  {caption + 1}
                </span>
                {CAPTIONS[caption]}
              </p>
            </div>
          )}

          {/* While it plays (or is paused part-way): a quiet pause/play button in the corner and a thin
              progress line along the bottom, as on a video. */}
          {started && !ended && (
            <>
              <button
                type="button"
                onClick={() => {
                  sound().setMuted(!muted);
                  setMuted(!muted);
                }}
                aria-label={muted ? "Turn sound on" : "Mute"}
                aria-pressed={muted}
                title={muted ? "Sound on" : "Mute"}
                className="absolute right-[60px] top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-[#0e1664]/85 text-white shadow-md backdrop-blur transition hover:bg-[#0e1664] active:scale-90 sm:right-[68px] sm:top-4"
              >
                <SpeakerIcon muted={muted} />
              </button>
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

          {/* Poster before it starts: the Watch pill over the (blurred) courses. */}
          {!started && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-white/50 backdrop-blur-[2px]">
              <WatchPill label={`Watch the demo, ${LENGTH}`} onClick={() => control.current.play(true)}>
                Watch
              </WatchPill>
            </div>
          )}

          {/* End card: the next step (sign up), and watch again. */}
          {ended && started && !instant && (
            <div className="fade-in absolute inset-0 z-10 grid place-items-center bg-white/60 px-4 backdrop-blur-[3px]">
              <div className="pop-in flex max-w-md flex-col items-center rounded-3xl bg-white px-6 py-7 text-center shadow-xl ring-1 ring-black/5 sm:px-10 sm:py-9">
                <Mascot partner="ada" size={56} mood="happy" title="" />
                <p className="mt-4 font-heading text-[22px] font-semibold leading-tight text-[#191919] sm:text-[28px]">Your course slides are already here.</p>
                <p className="mt-2 text-[14px] text-[#5f6673] sm:text-[16px]">Free for PAU students. Sign up with your PAU email in seconds.</p>
                <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
                  <Link
                    href="/sign-up"
                    className="rounded-full bg-[#0e1664] px-7 py-3 text-[15px] font-semibold text-white shadow-[0_10px_30px_rgb(14_22_100/0.3)] transition hover:bg-[#0a0f47] active:scale-95 sm:text-base"
                  >
                    Try it free
                  </Link>
                  <button
                    type="button"
                    onClick={() => control.current.play(true)}
                    aria-label={`Watch again, ${LENGTH}`}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-[15px] font-medium text-[#0e1664] transition hover:bg-[#eef2f8] active:scale-95"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.8h2.8" />
                    </svg>
                    Watch again · <span className="tabular-nums">{LENGTH}</span>
                  </button>
                </div>
              </div>
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
      <svg viewBox="0 0 40 56" className="h-[42px] w-[30px] overflow-visible text-ink sm:h-[56px] sm:w-[40px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8C17 3 31 9 33 22c1.5 9-2 18-8 27" />
        {/* Arrowhead: two equal wings either side of where the line ends, so it reads as a full arrow. */}
        <path d="M20.3 36.9 25 49l9.8-8.5" />
      </svg>
    </div>
  );
}

// One pill, like a video player's: play icon, "Watch", and how long the demo runs.
function WatchPill({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-3 rounded-full bg-[#0e1664] py-3.5 pl-6 pr-7 text-white shadow-[0_10px_30px_rgb(14_22_100/0.35)] ring-[3px] ring-white transition hover:scale-[1.03] hover:bg-[#0a0f47] active:scale-95 sm:py-4 sm:pl-7 sm:pr-8"
    >
      <svg width="22" height="22" viewBox="0 0 12 12" aria-hidden>
        <path d="M2.6 1.2v9.6L10.6 6z" fill="currentColor" />
      </svg>
      <span className="text-lg font-medium sm:text-xl">
        {children} <span aria-hidden className="text-white/70">·</span> <span className="tabular-nums">{LENGTH}</span>
      </span>
    </button>
  );
}

// Scene 1: "My courses", as on the dashboard, every course already holding its slides (real counts).
const COURSES = [
  { code: "CSC 420", title: "Data Management II", decks: 4, slides: 147 },
  { code: "CSC 402", title: "Ethics and Legal Issues", decks: 16, slides: 338 },
  { code: "CSC 418", title: "IoT and Edge Computing", decks: 8, slides: 194 },
  { code: "INS 401", title: "Project Management", decks: 10, slides: 277 },
];
function Courses({ pointing, tapped }: { pointing: boolean; tapped: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f5f8fc] px-4 sm:px-10">
      <div className="w-full max-w-[860px]">
        <div className="mb-4 flex flex-col gap-0.5 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <p className="font-heading text-[22px] font-semibold text-[#191919] sm:text-[32px]">My courses</p>
          <p className="pb-1 text-[12px] text-[#5f6673] sm:text-[15px]">7 courses · 1,500+ slides · 0 uploads</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          {COURSES.map((c, i) => (
            <div
              key={c.code}
              className={`relative rounded-2xl bg-white p-4 shadow-sm ring-1 transition duration-300 sm:p-6 ${
                i === 0 && tapped ? "scale-[0.97] ring-2 ring-[#0e1664]" : "ring-black/5"
              }`}
            >
              <span className="inline-block rounded-full bg-[#0e1664] px-2.5 py-0.5 text-[11px] font-semibold text-white sm:text-[13px]">{c.code}</span>
              <p className="mt-2 text-[14px] font-semibold leading-snug text-[#191919] sm:mt-3 sm:text-[19px]">{c.title}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[#5f6673] sm:text-[14px]">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 8.5 6.5 12 13 4.5" />
                </svg>
                {c.decks} decks · {c.slides} slides
              </p>
              {i === 0 && (
                <>
                  {tapped && <span className="demo-tap absolute right-8 top-1/2 h-10 w-10 rounded-full bg-[#0e1664]/25" />}
                  <svg
                    viewBox="0 0 24 24"
                    className="absolute right-6 top-1/2 h-7 w-7 drop-shadow-md transition-transform duration-[1600ms] ease-[cubic-bezier(0.3,0.7,0.2,1)] sm:h-8 sm:w-8"
                    style={{ transform: pointing ? "translate(0,0)" : "translate(min(46vw,420px),180px)" }}
                    aria-hidden
                  >
                    <path d="M5 3l14 7.5-6.2 1.6L10 18.5z" fill="#191919" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor" />
      {muted ? <path d="M13.5 7.5l4 5M17.5 7.5l-4 5" /> : <path d="M13.5 7a4 4 0 0 1 0 6M15.8 4.8a7 7 0 0 1 0 10.4" />}
    </svg>
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
            <span className="ai-tag ml-2 inline-flex translate-y-[-2px] items-center gap-1 rounded-full border border-[#0e1664]/20 bg-white px-2 py-px align-middle font-sans text-[10.5px] font-medium text-[#0e1664]/80 sm:text-[12px]">
              <span className="text-[9px] text-[#5ea3ed] sm:text-[10px]" aria-hidden>✦</span>
              Ada found this
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
