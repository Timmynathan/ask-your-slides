// Free and Finals side by side (stacked on phones, Finals first). Used by the landing page's Plans
// section and the in-app pricing page; the buttons are passed in because they differ (sign up
// vs. pay). Every figure comes from the plan offer (lib/plans/offer.ts).
import type { ReactNode } from "react";
import { naira, type PlanOffer } from "@/lib/plans/offer";
import { FinalsPrice } from "./finals-price";

export function PlanCards({
  offer,
  freeAction,
  finalsAction,
  current,
}: {
  offer: PlanOffer;
  freeAction: ReactNode;
  finalsAction: ReactNode;
  /** Marks the student's current plan (pricing page). */
  current?: "free" | "finals";
}) {
  const freeList = [
    `${offer.free.firstDay} messages on your first day, then ${offer.free.daily} a day`,
    "All your courses",
    `Premium courses: ${offer.free.premiumDaily} questions a day`,
    `${offer.free.summaries} summary`,
  ];
  const finalsList = [
    `${offer.finals.daily} messages a day`,
    "All your courses, no limits",
    "Unlimited summaries and quiz mode",
    "Valid until your last paper",
  ];

  return (
    <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
      {/* Finals: first on phones, right on wider screens. */}
      <article
        aria-labelledby="plan-finals"
        className="relative order-first flex flex-col rounded-[25px] bg-card p-7 ring-2 ring-brand shadow-[0_18px_50px_-24px_var(--brand)] md:order-last"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 id="plan-finals" className="font-heading text-2xl font-semibold text-ink">Finals</h3>
          {current === "finals" ? (
            <span className="rounded-full bg-brand px-3 py-1 text-[12px] font-semibold text-brand-ink">Your plan</span>
          ) : (
            <span className="rounded-full bg-pau-100 px-3 py-1 text-[12px] font-semibold text-pau-800 dark:text-pau-400">Best for exams</span>
          )}
        </div>
        <div className="mt-5">
          <FinalsPrice offer={offer} />
        </div>
        <Features items={finalsList} />
        <div className="mt-auto pt-7">{finalsAction}</div>
      </article>

      <article aria-labelledby="plan-free" className="flex flex-col rounded-[25px] bg-card p-7 ring-1 ring-line">
        <div className="flex items-center justify-between gap-3">
          <h3 id="plan-free" className="font-heading text-2xl font-semibold text-ink">Free</h3>
          {current === "free" && <span className="rounded-full bg-sunken px-3 py-1 text-[12px] font-semibold text-ink">Your plan</span>}
        </div>
        <div className="mt-5">
          <p className="font-heading text-5xl font-semibold tracking-tight text-ink">{naira(0)}</p>
          <p className="mt-2 text-sm text-muted">Free forever</p>
        </div>
        <Features items={freeList} />
        <div className="mt-auto pt-7">{freeAction}</div>
      </article>
    </div>
  );
}

function Features({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3 text-[15px] text-ink">
      {items.map((t) => (
        <li key={t} className="flex gap-3">
          <CheckIcon />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function CheckIcon({ label }: { label?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className="mt-0.5 shrink-0 text-brand dark:text-pau-400" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function LockIcon({ label }: { label?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" className="shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
