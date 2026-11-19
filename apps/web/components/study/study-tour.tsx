"use client";

// First-visit tour of a course page on phones and iPads in portrait (owner, 19 Nov 2026), where the
// chat fills the screen and the topics and slides are hidden behind two icons. Four steps:
//
//   menu     the page dims; only the ☰ button works, with a pointing tip. Tapping it opens Topics.
//   drawer   a tip inside the Topics drawer. Closing it (tap outside, or pick a topic) moves on.
//   sources  the page dims again; only the Sources icon works.
//   files    a tip inside Sources: tap a file to open its slides. Closing it ends the tour.
//
// Shown once per account on this browser (as the study partner hint). From lg (laptops, iPads in
// landscape) Topics and Sources are already on screen, so there's no tour.
import { useCallback, useEffect, useState } from "react";

export type TourStep = "menu" | "drawer" | "sources" | "files";
const NEXT: Record<TourStep, TourStep | null> = { menu: "drawer", drawer: "sources", sources: "files", files: null };
const KEY = "ays-study-tour-seen";
const keyFor = (account: string) => `${KEY}:${account.toLowerCase()}`;

function seen(account: string) {
  try {
    return !!localStorage.getItem(keyFor(account));
  } catch {
    return true; // storage blocked: no tour rather than one on every visit
  }
}
function markSeen(account: string) {
  try {
    localStorage.setItem(keyFor(account), "1");
  } catch {}
}

/** The tour's step, and `advance(from)`: moves on only if the tour is at that step. */
export function useStudyTour(account: string, enabled: boolean) {
  const [step, setStep] = useState<TourStep | null>(null);
  useEffect(() => {
    if (!enabled) return;
    // After the page settles; phones and iPads in portrait only (below lg, where ☰ is shown).
    const t = setTimeout(() => {
      if (!seen(account) && window.matchMedia("(max-width: 63.98rem)").matches) setStep("menu");
    }, 500);
    return () => clearTimeout(t);
  }, [account, enabled]);

  const advance = useCallback(
    (from: TourStep) =>
      setStep((s) => {
        if (s !== from) return s;
        const next = NEXT[from];
        if (!next) markSeen(account);
        return next;
      }),
    [account],
  );
  const skip = useCallback(() => {
    markSeen(account);
    setStep(null);
  }, [account]);
  return { step, advance, skip };
}

const TIPS: Record<TourStep, { title: string; body: string }> = {
  menu: { title: "Start here", body: "Tap here to see this course's topics and past questions." },
  drawer: { title: "Your topics", body: "Pick a topic to focus the chat on it, or tap outside to carry on with the whole course." },
  sources: { title: "Your slides", body: "Tap here to see the slides and notes for this course." },
  files: { title: "Open any file", body: "Tap a file to open its slides. Every answer also links to the slide it came from." },
};

export function StudyTour({ step, onSkip, onGotIt }: { step: TourStep | null; onSkip(): void; onGotIt(step: TourStep): void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const spot = step === "menu" || step === "sources";

  // Where the button to tap is, kept up to date on resize (and once the drawer has slid shut).
  useEffect(() => {
    if (!spot) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-tour="${step}"]`);
        const r = el?.getBoundingClientRect();
        setRect(r && r.width > 0 ? r : null);
      });
    };
    measure();
    const t = setTimeout(measure, 260);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [step, spot]);

  if (!step) return null;
  const tip = TIPS[step];

  if (!spot) {
    // Inside the open drawer (left) or Sources (right): a tip at the bottom of that panel.
    const left = step === "drawer";
    return (
      <div
        role="dialog"
        aria-label={tip.title}
        className={`pop-in fixed bottom-4 z-50 w-[min(264px,calc(100vw-2rem))] rounded-2xl bg-pau-900 p-4 text-white shadow-xl ${left ? "left-3" : "right-3"}`}
      >
        <Tip tip={tip} />
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => onGotIt(step)} className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-medium text-pau-900 transition hover:opacity-90 active:scale-95">
            Got it
          </button>
          <button type="button" onClick={onSkip} className="px-2 text-[12.5px] text-white/70 hover:text-white">
            Skip tour
          </button>
        </div>
      </div>
    );
  }

  if (!rect) return null;
  const pad = 4;
  const hole = { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  const cx = rect.left + rect.width / 2;
  const onRight = cx > window.innerWidth / 2;
  const bubbleTop = hole.top + hole.height + 44;
  const block = "fixed z-50"; // clear: the dim itself is the ring's shadow, so the hole is round

  return (
    <>
      {/* Four clear panes around the button take every tap except the button's. */}
      <div aria-hidden className={`${block} inset-x-0 top-0`} style={{ height: Math.max(0, hole.top) }} />
      <div aria-hidden className={`${block} inset-x-0 bottom-0`} style={{ top: hole.top + hole.height }} />
      <div aria-hidden className={`${block} left-0`} style={{ top: hole.top, height: hole.height, width: Math.max(0, hole.left) }} />
      <div aria-hidden className={`${block} right-0`} style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }} />
      {/* A round hole in the dim, ringed, and an arrow pointing up at it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-50 rounded-full shadow-[0_0_0_200vmax_rgb(0_0_0/0.45)]"
        style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
      >
        <span className="tour-ring absolute inset-0 rounded-full ring-2 ring-pau-400" />
      </div>
      <svg
        aria-hidden
        className="tour-arrow pointer-events-none fixed z-50 text-white"
        style={{ top: hole.top + hole.height + 6, left: cx - 14 }}
        width="28"
        height="34"
        viewBox="0 0 28 34"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 32V4M5 13l9-9 9 9" />
      </svg>
      <div
        role="dialog"
        aria-label={tip.title}
        className="pop-in fixed z-50 w-[min(260px,calc(100vw-2rem))] rounded-2xl bg-pau-900 p-4 text-white shadow-xl"
        style={onRight ? { top: bubbleTop, right: Math.max(16, window.innerWidth - rect.right - 8) } : { top: bubbleTop, left: Math.max(16, rect.left - 8) }}
      >
        <Tip tip={tip} />
        <button type="button" onClick={onSkip} className="mt-2 px-0 text-[12.5px] text-white/70 hover:text-white">
          Skip tour
        </button>
      </div>
    </>
  );
}

function Tip({ tip }: { tip: { title: string; body: string } }) {
  return (
    <>
      <p className="text-[14px] font-semibold">{tip.title}</p>
      <p className="mt-1 text-[13.5px] leading-snug text-white/85">{tip.body}</p>
    </>
  );
}
