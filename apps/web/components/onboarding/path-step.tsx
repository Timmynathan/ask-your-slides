"use client";

// The last onboarding page (owner, 27 Nov 2026), after "Skip for now" on the plan step: the student's
// first course laid out topic by topic, like a path, with the first topic ready to start. "Start" opens
// that topic; "Start studying" goes to the dashboard. Modelled on the owner's reference screenshot.
import Link from "next/link";
import { ChevronDown, Send, Timer } from "lucide-react";
import type { OnboardingData } from "./ready-step";

const dashed = "grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-dashed border-line-strong bg-page";

export function PathStep({ data, onStart }: { data: OnboardingData | null; onStart(): void }) {
  const path = data?.path ?? null;
  const [first, ...rest] = path?.topics ?? [];

  return (
    <div key="path" className="panel-in flex w-full max-w-md flex-col">
      <h1 className="text-center font-heading text-[30px] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[34px]">
        Your courses are mapped out, topic by topic
      </h1>

      <div className="relative mt-10">
        {/* The path's line, behind the nodes. */}
        <span className="absolute bottom-10 left-[39px] top-10 w-px bg-line-strong" aria-hidden />

        <div className="relative flex items-center gap-4 pl-[18px]">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pau-100 text-brand" aria-hidden>
            <Send size={19} absoluteStrokeWidth strokeWidth={1.5} />
          </span>
          <span className="text-[16px] font-semibold text-ink">Start</span>
        </div>

        <div className="relative mt-6 rounded-[28px] bg-card px-3 pb-2 pt-4 ring-1 ring-line" style={{ animationDelay: "120ms" }}>
          {path ? (
            <>
              <div className="flex items-center gap-3 pl-[2px]">
                <ChevronDown size={18} absoluteStrokeWidth strokeWidth={1.5} className="shrink-0 text-muted" aria-hidden />
                <span className={dashed} aria-hidden />
                <span className="min-w-0">
                  {path.course.code && <span className="block text-[12px] text-muted">{path.course.code}</span>}
                  <span className="block truncate text-[16px] font-semibold text-ink">{path.course.title}</span>
                </span>
              </div>

              {first && (
                <div className="pop-in mt-4 flex items-center gap-3 pl-[18px]" style={{ animationDelay: "250ms" }}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pau-100 text-brand" aria-hidden>
                    <Timer size={19} absoluteStrokeWidth strokeWidth={1.5} />
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-card p-2.5 pl-3.5 ring-2 ring-pau-200">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">{first.title}</span>
                      <span className="block text-[12.5px] text-muted">Topic 1</span>
                    </span>
                    <Link href={first.href} className="shrink-0 rounded-full bg-sunken px-4 py-2 text-[14px] font-medium text-ink transition hover:bg-pau-100 active:scale-95">
                      Start
                    </Link>
                  </div>
                </div>
              )}

              {/* The rest fade out, like the path carries on. */}
              <ul className="mt-2" style={{ maskImage: "linear-gradient(180deg, #000 30%, transparent)" }}>
                {rest.map((t, i) => (
                  <li key={t.title} className="flex items-center gap-3 py-3 pl-[22px]">
                    <span className={dashed} aria-hidden />
                    <span className="min-w-0 truncate text-[15px] text-ink/80">{t.title}</span>
                    <span className="sr-only">Topic {i + 2}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="space-y-3 p-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-2xl bg-sunken" />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-4 z-10 mt-10">
        <button onClick={onStart} className="w-full rounded-full bg-brand px-10 py-3.5 text-base font-medium text-brand-ink shadow-lg transition hover:opacity-90 active:scale-[0.98]">
          Start studying
        </button>
      </div>
    </div>
  );
}
