"use client";

// First-visit tour of a course page on tablets and laptops (owner, 21 Nov 2026); phones have their
// own tour (study-tour.tsx). Everything is already on screen here, so it is a guided walk: the page
// dims, one area is lit, and a note beside it explains it, with Next, Skip and "1 of 4".
//
//   lectures  the course panel's list of lectures (and past questions)
//   chatbox   the chat box: ask anything, + to send a photo
//   sources   the slides: when Sources is closed, a pointer "clicks" its icon and Sources opens by
//             itself; Next closes it again (owner, 22 Nov 2026: show it, don't just say it)
// The text is a short title and one plain line each; the old "rail" step was dropped (students know a
// sidebar).
//
// Shown once per account in this browser. A step whose area isn't on screen is skipped.
import { useCallback, useEffect, useState } from "react";
import { MousePointer2 } from "lucide-react";

const STEPS = ["lectures", "chatbox", "sources"] as const;
export type LaptopStep = (typeof STEPS)[number];
const KEY = "ays-laptop-tour-seen";
const keyFor = (account: string) => `${KEY}:${account.toLowerCase()}`;

const TIPS: Record<LaptopStep, { title: string; body: string }> = {
  lectures: { title: "Your PAU lectures", body: "Pick a lecture to focus the chat on it, or stay on Whole course. Past questions from real PAU papers are at the top." },
  chatbox: { title: "Ask anything", body: "Type your question here. Tap + to add a photo." },
  sources: { title: "Your slides", body: "All your lecture slides live here." },
};

const SOURCES_BUTTON = { title: "Your slides", body: "Your lecture slides open from here." };

/** The step's element: the first match that is actually on screen. */
function target(step: LaptopStep): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-laptop-tour="${step}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) return el;
  }
  return null;
}

export function useLaptopTour(account: string, enabled: boolean) {
  const [step, setStep] = useState<LaptopStep | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let seen = true;
    try {
      seen = !!localStorage.getItem(keyFor(account));
    } catch {}
    if (seen) return;
    // Tablets and laptops only (phones have their own tour), once the page has settled.
    const t = setTimeout(() => {
      if (window.matchMedia("(min-width: 48rem)").matches) setStep(STEPS.find((s) => target(s)) ?? null);
    }, 900);
    return () => clearTimeout(t);
  }, [account, enabled]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(keyFor(account), "1");
    } catch {}
    setStep(null);
  }, [account]);
  const next = useCallback(() => {
    setStep((s) => {
      const rest = STEPS.slice(STEPS.indexOf(s!) + 1);
      const n = rest.find((x) => target(x)) ?? null;
      if (!n) {
        try {
          localStorage.setItem(keyFor(account), "1");
        } catch {}
      }
      return n;
    });
  }, [account]);
  return { step, next, finish };
}

export function LaptopTour({ step, onNext, onSkip, onCloseSources }: {
  step: LaptopStep | null;
  onNext(): void;
  onSkip(): void;
  /** Close the Sources the demo opened, when the student moves on. */
  onCloseSources(): void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  // The slides step, when Sources is closed: a pointer glides to the icon and clicks it (owner, 22 Nov
  // 2026), Sources opens, the tip moves onto it; moving on closes it again.
  const [demo, setDemo] = useState<"idle" | "pointing" | "clicking" | "opened">("idle");

  useEffect(() => {
    if (!step) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(target(step)?.getBoundingClientRect() ?? null));
    };
    measure();
    const again = setTimeout(measure, 360); // after Sources has slid open
    window.addEventListener("resize", measure);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onSkip();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(again);
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onKey);
    };
  }, [step, onSkip, demo]);

  // Run the pointer demo once, when the slides step starts on the closed icon.
  useEffect(() => {
    if (step !== "sources") return;
    const el = target("sources");
    if (el?.tagName !== "BUTTON") return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    const timers = [
      setTimeout(() => setDemo("pointing"), 0),
      setTimeout(() => setDemo("clicking"), reduce ? 0 : 1100),
      setTimeout(() => {
        target("sources")?.click();
        setDemo("opened");
      }, reduce ? 50 : 1450),
    ];
    return () => timers.forEach(clearTimeout);
  }, [step]);

  const leaveSources = (then: () => void) => {
    if (demo === "opened") onCloseSources();
    setDemo("idle");
    then();
  };

  if (!step || !rect) return null;
  const el = target(step);
  const press = step === "sources" && demo !== "opened" && el?.tagName === "BUTTON" ? el : null;
  const tip = step === "sources" && press ? SOURCES_BUTTON : TIPS[step];
  const index = STEPS.indexOf(step);
  const last = !STEPS.slice(index + 1).some((s) => target(s));
  const pad = 6;
  const hole = { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  const W = 280;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // The note goes beside the lit area: to its right, else its left, else above it.
  const clampTop = (t: number) => Math.min(Math.max(16, t), vh - 200);
  const pos =
    hole.left + hole.width + 16 + W < vw
      ? { left: hole.left + hole.width + 16, top: clampTop(hole.top + 12) }
      : hole.left - 16 - W > 0
        ? { left: hole.left - 16 - W, top: clampTop(hole.top + 12) }
        : { left: Math.min(Math.max(16, hole.left + hole.width / 2 - W / 2), vw - W - 16), top: Math.max(16, hole.top - 180) };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  return (
    <>
      {/* Takes every click while the tour is on: the page is for looking at, Next moves on. */}
      <div aria-hidden className="fixed inset-0 z-[70]" />
      {press && (
        <button
          type="button"
          aria-label={press.getAttribute("aria-label") ?? tip.title}
          onClick={() => {
            press.click();
            setDemo("opened");
          }}
          className="fixed z-[71] cursor-pointer rounded-2xl"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      )}
      {press && (demo === "pointing" || demo === "clicking") && (
        // The pointer glides in from below-left, then presses (a ripple) and the icon opens Sources.
        <span aria-hidden className="pointer-events-none fixed z-[72]" style={{ left: cx, top: cy }}>
          <span className={`tour-pointer absolute ${demo === "clicking" ? "tour-pointer-press" : ""}`}>
            <MousePointer2 size={26} absoluteStrokeWidth strokeWidth={1.6} className="fill-white text-pau-900 drop-shadow" />
          </span>
          {demo === "clicking" && <span className="tour-ripple absolute -left-5 -top-5 h-10 w-10 rounded-full border-2 border-white" />}
        </span>
      )}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[70] rounded-2xl shadow-[0_0_0_200vmax_rgb(0_0_0/0.45)] transition-all duration-300 ease-out"
        style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
      >
        <span className="tour-ring absolute inset-0 rounded-2xl ring-2 ring-pau-400" />
      </div>
      <div
        role="dialog"
        aria-label={tip.title}
        className="pop-in fixed z-[71] rounded-2xl bg-pau-900 p-4 text-white shadow-xl"
        style={{ ...pos, width: W }}
      >
        <p className="text-[12px] text-white/60">
          {index + 1} of {STEPS.length}
        </p>
        <p className="mt-1 text-[15px] font-semibold">{tip.title}</p>
        <p className="mt-1 text-[14px] leading-snug text-white/85">{tip.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => (step === "sources" ? leaveSources(onNext) : onNext())}
            autoFocus
            className="rounded-full bg-white px-4 py-1.5 text-[13.5px] font-medium text-pau-900 transition hover:opacity-90 active:scale-95"
          >
            {last ? "Done" : "Next"}
          </button>
          {!last && (
            <button type="button" onClick={() => (step === "sources" ? leaveSources(onSkip) : onSkip())} className="px-2 text-[13px] text-white/70 hover:text-white">
              Skip tour
            </button>
          )}
        </div>
      </div>
    </>
  );
}
