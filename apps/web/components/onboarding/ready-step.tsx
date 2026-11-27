"use client";

// "Let's start learning!" (owner, 27 Nov 2026), right before the plan step: a short, animated moment
// between onboarding and the dashboard, so a new student sees what's already waiting for them instead
// of being dropped straight into a full dashboard. Three cards tick off one after another: their
// lecture slides, their topics, and their courses gliding left to right. Numbers come from
// /api/onboarding (the student's own courses). Modelled on the owner's reference screenshot.
import { useEffect, useState } from "react";
/* eslint-disable @next/next/no-img-element -- a small local crest */
import { Check } from "lucide-react";
import { Mascot } from "@/components/mascot/mascot";
import type { PartnerId } from "@/lib/partners";

export interface OnboardingData {
  courses: { title: string; code: string | null }[];
  slides: number;
  topics: number;
  path: { course: { title: string; code: string | null; href: string }; topics: { title: string; href: string }[] } | null;
}


/** Counts up to `to` once `on` turns true. */
function useCount(to: number, on: boolean, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => setN(to), 0);
      return () => clearTimeout(t);
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, on, ms]);
  return n;
}

function Tick({ done }: { done: boolean }) {
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-300 ${done ? "bg-pau-100 text-brand" : "bg-sunken text-muted"}`} aria-hidden>
      {done ? (
        <Check key="done" size={18} absoluteStrokeWidth strokeWidth={2} className="pop-in" />
      ) : (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
    </span>
  );
}

function Row({ title, done, children }: { title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-[24px] bg-card px-5 py-4 ring-1 ring-line">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-[20px] text-ink">{title}</p>
        <Tick done={done} />
      </div>
      {children}
    </div>
  );
}

export function ReadyStep({ partner, data, onContinue }: { partner: PartnerId; data: OnboardingData | null; onContinue(): void }) {
  // The cards tick off one after another (stage 1, 2, 3), each once the data is in.
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!data) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = [1, 2, 3].map((s) => setTimeout(() => setStage(s), reduce ? 0 : 500 + (s - 1) * 900));
    return () => timers.forEach(clearTimeout);
  }, [data]);
  const slides = useCount(data?.slides ?? 0, stage >= 1);
  const topics = useCount(data?.topics ?? 0, stage >= 2);
  const courses = data?.courses ?? [];

  return (
    <div key="ready" className="panel-in flex w-full max-w-md flex-col items-center text-center">
      <Mascot partner={partner} size={76} mood="happy" />
      <h1 className="mt-3 font-heading text-[30px] font-semibold tracking-tight text-ink sm:text-4xl">Let&apos;s start learning!</h1>

      <div className="mt-5 w-full space-y-2.5 text-left">
        <Row title="Learning material" done={stage >= 1}>
          <p className="mt-1 text-[15px] text-muted">
            <span className="font-semibold text-ink">{slides.toLocaleString()}</span> lecture slides processed
          </p>
        </Row>
        <Row title="Topics" done={stage >= 2}>
          <p className="mt-1 text-[15px] text-muted">
            <span className="font-semibold text-ink">{topics.toLocaleString()}</span> topics, in the order they were taught
          </p>
        </Row>
        <Row title="Your courses" done={stage >= 3}>
          {/* The student's courses glide left to right (the same loop as the landing page's course row). */}
          <div className="course-row -mx-5 mt-3 overflow-hidden py-1" style={{ maskImage: "linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)" }}>
            {courses.length > 0 ? (
              <div className="course-row-track flex w-max gap-2.5 pr-2.5" style={{ animationDuration: `${Math.max(14, courses.length * 3.2)}s` }}>
                {[0, 1].map((copy) => (
                  <span key={copy} aria-hidden={copy === 1} className="contents">
                    {courses.map((c) => (
                      <span key={`${copy}-${c.title}`} className="w-[132px] shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-line">
                        {/* The PAU crest on the site's navy, the same on every course (owner, 27 Nov 2026). */}
                        <span className="grid h-[60px] place-items-center bg-navy">
                          <img src="/brand/pau-crest-white.png" alt="" width={29} height={32} className="h-8 w-auto" />
                        </span>
                        <span className="block px-2.5 py-2">
                          {c.code && <span className="block text-[11px] font-medium text-muted">{c.code}</span>}
                          <span className="block truncate text-[13px] font-medium text-ink">{c.title}</span>
                        </span>
                      </span>
                    ))}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex gap-2.5 px-5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-[100px] w-[132px] shrink-0 animate-pulse rounded-2xl bg-sunken" />
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-[15px] text-muted">
            <span className="font-semibold text-ink">{courses.length}</span> courses, all slides already here
          </p>
        </Row>
      </div>

      {/* Pinned to the bottom on phones, so it's always one tap away. */}
      <div className="sticky bottom-4 z-10 mt-6 w-full">
        <button onClick={onContinue} className="w-full rounded-full bg-brand px-10 py-3.5 text-base font-medium text-brand-ink shadow-lg transition hover:opacity-90 active:scale-[0.98]">
          Continue
        </button>
      </div>
    </div>
  );
}
