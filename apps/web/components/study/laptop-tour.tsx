"use client";

// First-visit tour of a course page on tablets and laptops (owner, 21 Nov 2026); phones have their
// own tour (study-tour.tsx). Everything is already on screen here, so it is a guided walk: the page
// dims, one area is lit, and a note beside it explains it, with Next, Skip and "1 of 4".
//
//   lectures  the course panel's list of lectures (Whole course first)
//   past      the Past questions card (owner, 22 Nov 2026: its own step); skipped in courses without papers
//   chatbox   the chat box: ask anything, + to send a photo
//   sources   the slides: when Sources is closed, the tip asks the student to click its icon and waits
//             (no Next) until they do; then Sources is lit with "Here are your slides", and Done closes
//             it again (owner, 22 Nov 2026: the student clicks, not an animation)
// The text is a short title and one plain line each; the old "rail" step was dropped (students know a
// sidebar).
//
// Shown once per account in this browser. A step whose area isn't on screen is skipped.
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

const STEPS = ["lectures", "past", "chatbox", "sources"] as const;
export type LaptopStep = (typeof STEPS)[number];
const KEY = "ays-laptop-tour-seen";
const keyFor = (account: string) => `${KEY}:${account.toLowerCase()}`;

const TIPS: Record<LaptopStep, { title: string; body: string }> = {
  lectures: { title: "Your PAU lectures", body: "Pick a lecture to focus the chat on it, or stay on Whole course." },
  past: { title: "Past questions", body: "Real questions from past PAU papers, to practise with." },
  chatbox: { title: "Ask anything", body: "Type your question here." },
  sources: { title: "Here are your slides", body: "Every lecture's slides, in one place. Open a lecture to see its files." },
};

const SOURCES_BUTTON = { title: "Open your slides", body: "Click this icon to see your lecture slides." };

/** The step's element: the first match that is actually on screen. For the slides step the open Sources
 *  panel wins over its icon: on tablets the icon stays visible under the slid-in panel (owner, 23 Nov 2026). */
function target(step: LaptopStep): HTMLElement | null {
  const shown = [...document.querySelectorAll<HTMLElement>(`[data-laptop-tour="${step}"]`)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
  });
  return shown.find((el) => el.tagName !== "BUTTON") ?? shown[0] ?? null;
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
  // The slides step, when Sources is closed: wait for the student to click its icon; then the tip moves
  // onto the open Sources, and moving on closes it again.
  const [demo, setDemo] = useState<"idle" | "opened">("idle");

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
  const pad = 8;
  const hole = { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  const W = 360;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // The card goes beside the lit area: to its right, else its left, else above it.
  const clampTop = (t: number) => Math.min(Math.max(16, t), vh - 230);
  const pos =
    hole.left + hole.width + 20 + W < vw
      ? { left: hole.left + hole.width + 20, top: clampTop(hole.top + 8) }
      : hole.left - 20 - W > 0
        ? { left: hole.left - 20 - W, top: clampTop(hole.top + 8) }
        : { left: Math.min(Math.max(16, hole.left + hole.width / 2 - W / 2), vw - W - 16), top: Math.max(16, hole.top - 230) };
  const close = () => (step === "sources" ? leaveSources(onSkip) : onSkip());

  // Styled on StudyFetch's walkthrough (owner, 22 Nov 2026): the page dims, the lit area gets a thick
  // soft-white ring, and a white card beside it has a bold title, an X to end the tour, the step count
  // and a navy Next.
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
          className="fixed z-[71] cursor-pointer rounded-[20px]"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[70] rounded-[20px] shadow-[0_0_0_200vmax_rgb(0_0_0/0.45)] transition-all duration-300 ease-out"
        style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
      >
        <span className="absolute -inset-[5px] rounded-[24px] border-[5px] border-white/75 shadow-[0_0_0_10px_rgb(255_255_255/0.12)]" />
        {press && <span className="tour-ring absolute inset-0 rounded-[20px]" />}
      </div>
      <div
        role="dialog"
        aria-label={tip.title}
        className="pop-in fixed z-[71] rounded-[28px] bg-card p-6 text-ink shadow-2xl"
        style={{ ...pos, width: W }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="pt-0.5 text-[19px] font-semibold leading-snug">{tip.title}</p>
          <button type="button" onClick={close} aria-label="End tour" title="End tour" className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/70 transition hover:bg-sunken hover:text-ink">
            <X size={20} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink/80">{tip.body}</p>
        <div className="mt-6 flex items-center justify-between">
          <p className="text-[15px] text-muted">
            {index + 1} of {STEPS.length}
          </p>
          {/* Waiting for the click on the Sources icon: no Next, the icon is the way on. */}
          {!press && (
            <button
              type="button"
              onClick={() => (step === "sources" ? leaveSources(onNext) : onNext())}
              autoFocus
              className="rounded-full bg-brand px-5 py-2.5 text-[15px] font-medium text-brand-ink outline-none transition hover:opacity-90 active:scale-95"
            >
              {last ? "Done" : "Next"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
