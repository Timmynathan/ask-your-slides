"use client";

// First-visit tour of a course page on tablets and laptops (owner, 21 Nov 2026); phones have their
// own tour (study-tour.tsx). Everything is already on screen here, so it is a guided walk: the page
// dims, one area is lit, and a note beside it explains it, with Next, Skip and "1 of 4".
//
//   lectures  the course panel's list of lectures (and past questions)
//   chatbox   the chat box: ask anything, + to send a photo
//   sources   the slides and notes (the Sources column, or its button when Sources is closed: click it)
//   rail      the slim bar: hover for the names, Dashboard and recent chats
//
// Shown once per account in this browser. A step whose area isn't on screen is skipped.
import { useCallback, useEffect, useState } from "react";

const STEPS = ["lectures", "chatbox", "sources", "rail"] as const;
export type LaptopStep = (typeof STEPS)[number];
const KEY = "ays-laptop-tour-seen";
const keyFor = (account: string) => `${KEY}:${account.toLowerCase()}`;

const TIPS: Record<LaptopStep, { title: string; body: string }> = {
  lectures: { title: "Your lectures", body: "Pick a lecture to focus the chat on it, or stay on Whole course. Past questions from real PAU papers are at the top." },
  chatbox: { title: "Ask anything", body: "Ask in your own words. Tap + to send a photo of a question, a diagram or your notes." },
  sources: { title: "Your slides", body: "This course's slides and notes are here. Every answer links to the exact slide it came from." },
  rail: { title: "Getting around", body: "Hover over this bar to see its names: your dashboard, recent chats, feedback and your account." },
};

const SOURCES_BUTTON = { title: "Your PAU slides", body: "Click this icon to open your lecture slides and notes for this course. Every answer links to the exact slide it came from." };

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

export function LaptopTour({ step, onNext, onSkip }: { step: LaptopStep | null; onNext(): void; onSkip(): void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!step) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(target(step)?.getBoundingClientRect() ?? null));
    };
    measure();
    window.addEventListener("resize", measure);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onSkip();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onKey);
    };
  }, [step, onSkip]);

  if (!step || !rect) return null;
  // Sources closed (Whole course): the icon is lit and is the one thing that works. Clicking it opens
  // the student's slides and moves the tour on (owner, 22 Nov 2026).
  const el = target(step);
  const press = el?.tagName === "BUTTON" ? el : null;
  const tip = step === "sources" && press ? SOURCES_BUTTON : TIPS[step];
  const index = STEPS.indexOf(step);
  const last = !STEPS.slice(index + 1).some((s) => target(s));
  const pad = 6;
  const hole = { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  const W = 300;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // The note goes beside the lit area: to its right, else its left, else above it.
  const clampTop = (t: number) => Math.min(Math.max(16, t), vh - 220);
  const pos =
    hole.left + hole.width + 16 + W < vw
      ? { left: hole.left + hole.width + 16, top: clampTop(hole.top + 12) }
      : hole.left - 16 - W > 0
        ? { left: hole.left - 16 - W, top: clampTop(hole.top + 12) }
        : { left: Math.min(Math.max(16, hole.left + hole.width / 2 - W / 2), vw - W - 16), top: Math.max(16, hole.top - 200) };

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
            onNext();
          }}
          className="fixed z-[71] cursor-pointer rounded-2xl"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
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
            onClick={onNext}
            autoFocus
            className="rounded-full bg-white px-4 py-1.5 text-[13.5px] font-medium text-pau-900 transition hover:opacity-90 active:scale-95"
          >
            {last ? "Done" : "Next"}
          </button>
          {!last && (
            <button type="button" onClick={onSkip} className="px-2 text-[13px] text-white/70 hover:text-white">
              Skip tour
            </button>
          )}
        </div>
      </div>
    </>
  );
}
