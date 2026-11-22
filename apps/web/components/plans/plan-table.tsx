// The pricing page's one table (owner, 21 Nov 2026: one table with everything, not cards plus a
// comparison). Restyled 22 Nov 2026 ("bland, no feel"): a "Features" column with an icon per row,
// and Finals as the stand-out column (navy header with the price, a tinted column, filled ticks),
// then the buttons at the bottom. Phones keep the same table, just tighter.
import type { ReactNode } from "react";
import {
  BookOpen,
  CalendarRange,
  Camera,
  Crown,
  FileText,
  GraduationCap,
  Lightbulb,
  MessageSquare,
  NotebookPen,
  Quote,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { comparisonRows, naira, type PlanOffer } from "@/lib/plans/offer";
import { FinalsPrice } from "./finals-price";
import { LockIcon } from "./plan-cards";

const ROW_ICONS: Record<string, LucideIcon> = {
  "Daily messages": MessageSquare,
  "All your courses": BookOpen,
  "Premium courses": Crown,
  "Answers cite your actual slides": Quote,
  Summaries: FileText,
  "Quiz mode": Lightbulb,
  "Upload photos of your tests and notes": Camera,
  "Past questions": GraduationCap,
  "Model answers and marked practice": NotebookPen,
  "How long it lasts": CalendarRange,
  Payment: Wallet,
};

function Tick({ label, strong }: { label: string; strong: boolean }) {
  return (
    <span role="img" aria-label={label} className={`grid h-6 w-6 place-items-center rounded-full ${strong ? "bg-brand text-brand-ink" : "bg-sunken text-ink"}`}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function Cell({ value, plan }: { value: string | boolean; plan: "Free" | "Finals" }) {
  if (value === true) return <Tick label={`Included on ${plan}`} strong={plan === "Finals"} />;
  if (value === false) return <LockIcon label={`Not on ${plan}`} />;
  return <span className={`text-[13px] leading-snug sm:text-[14px] ${plan === "Finals" ? "font-medium text-ink" : "text-ink/80"}`}>{value}</span>;
}

export function PlanTable({ offer, current, freeAction, finalsAction }: { offer: PlanOffer; current: "free" | "finals"; freeAction: ReactNode; finalsAction: ReactNode }) {
  const rows = comparisonRows(offer);
  const finalsCol = "bg-pau-50 dark:bg-white/[0.04]";
  const pad = "px-3 py-3.5 sm:px-6 sm:py-4";
  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-[28px] bg-card shadow-[0_24px_60px_-30px_rgb(15_23_80/0.35)] ring-1 ring-line">
      <table className="w-full table-fixed text-left">
        <caption className="sr-only">Free and Finals: prices and everything included</caption>
        <colgroup>
          <col className="w-[34%] sm:w-[38%]" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr className="align-top">
            <th scope="col" className={`${pad} pt-7 align-bottom sm:pt-8`}>
              <span className="font-heading text-[18px] font-medium text-ink sm:text-[22px]">Features</span>
              <span className="mt-1 hidden text-[13px] font-normal text-muted sm:block">What each plan gives you</span>
            </th>
            <th scope="col" className={`${pad} border-b border-line pt-7 font-normal sm:pt-8`}>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-xl font-semibold text-ink sm:text-2xl">Free</span>
                {current === "free" && <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[11.5px] font-semibold text-ink">Your plan</span>}
              </span>
              <span className="mt-3 block font-heading text-[26px] font-semibold tracking-tight text-ink sm:text-4xl">{naira(0)}</span>
              <span className="mt-2 block text-sm text-muted">Free forever</span>
            </th>
            {/* Finals stands out: navy, with the price in white. */}
            <th scope="col" className={`${pad} relative bg-navy pt-7 font-normal text-white sm:pt-8`}>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-xl font-semibold sm:text-2xl">Finals</span>
                {current === "finals" ? (
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[11.5px] font-semibold text-brand">Your plan</span>
                ) : (
                  <span className="hidden rounded-full bg-[#BBEEF0] px-2.5 py-0.5 text-[11.5px] font-semibold text-brand sm:inline">Most students pick this</span>
                )}
              </span>
              <span className="mt-3 block">
                <FinalsPrice offer={offer} size="sm" onDark />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const Icon = ROW_ICONS[r.label];
            return (
              <tr key={r.label} className="border-b border-line/70">
                <th scope="row" className={`${pad} font-normal`}>
                  <span className="flex items-start gap-2.5 text-[13px] leading-snug text-ink sm:text-[14.5px]">
                    {Icon && <Icon size={18} absoluteStrokeWidth strokeWidth={1.5} className="mt-px hidden shrink-0 text-brand sm:block" aria-hidden />}
                    {r.label}
                  </span>
                </th>
                <td className={pad}>
                  <Cell value={r.free} plan="Free" />
                </td>
                <td className={`${pad} ${finalsCol}`}>
                  <Cell value={r.finals} plan="Finals" />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {/* Wider screens: each button under its plan. Phones: both full width, Finals first. */}
          <tr className="hidden align-top sm:table-row">
            <td className={pad} />
            <td className={`${pad} pb-7 pt-5`}>{freeAction}</td>
            <td className={`${pad} ${finalsCol} pb-7 pt-5`}>{finalsAction}</td>
          </tr>
          <tr className="sm:hidden">
            <td colSpan={3} className="space-y-3 px-4 pb-5 pt-4">
              {finalsAction}
              {freeAction}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
