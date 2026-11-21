// The pricing page's one table (owner, 21 Nov 2026: one table with everything, not cards plus a
// comparison): the plans with their prices and buttons across the top, then every perk, row by
// row, then the buttons again at the bottom. Phones keep the same table, just tighter.
import type { ReactNode } from "react";
import { comparisonRows, naira, type PlanOffer } from "@/lib/plans/offer";
import { FinalsPrice } from "./finals-price";
import { CheckIcon, LockIcon } from "./plan-cards";

function Cell({ value, plan }: { value: string | boolean; plan: string }) {
  if (value === true) return <CheckIcon label={`Included on ${plan}`} />;
  if (value === false) return <LockIcon label={`Not on ${plan}`} />;
  return <span className="text-[13px] leading-snug text-ink sm:text-[14px]">{value}</span>;
}

export function PlanTable({ offer, current, freeAction, finalsAction }: { offer: PlanOffer; current: "free" | "finals"; freeAction: ReactNode; finalsAction: ReactNode }) {
  const rows = comparisonRows(offer);
  const finalsCol = "bg-pau-50/70 dark:bg-white/[0.03]";
  const pad = "px-3 py-3 sm:px-6 sm:py-3.5";
  return (
    <table className="mx-auto w-full max-w-4xl table-fixed overflow-hidden rounded-[25px] bg-card text-left ring-1 ring-line">
      <caption className="sr-only">Free and Finals: prices and everything included</caption>
      <colgroup>
        <col className="w-[34%] sm:w-[36%]" />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr className="border-b border-line align-top">
          <th scope="col" className={`${pad} pt-6 text-[13px] font-medium text-muted sm:pt-7`}>
            <span className="sr-only">Feature</span>
          </th>
          <th scope="col" className={`${pad} pt-6 font-normal sm:pt-7`}>
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-heading text-xl font-semibold text-ink sm:text-2xl">Free</span>
              {current === "free" && <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[11.5px] font-semibold text-ink">Your plan</span>}
            </span>
            <span className="mt-3 block font-heading text-[26px] font-semibold tracking-tight text-ink sm:text-4xl">{naira(0)}</span>
            <span className="mt-2 block text-sm text-muted">Free forever</span>
          </th>
          <th scope="col" className={`${pad} ${finalsCol} pt-6 font-normal sm:pt-7`}>
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-heading text-xl font-semibold text-ink sm:text-2xl">Finals</span>
              {current === "finals" ? (
                <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11.5px] font-semibold text-brand-ink">Your plan</span>
              ) : (
                <span className="hidden rounded-full bg-pau-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-pau-800 sm:inline dark:text-pau-400">Most students pick this</span>
              )}
            </span>
            <span className="mt-3 block">
              <FinalsPrice offer={offer} size="sm" />
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-line">
            <th scope="row" className={`${pad} text-[13px] font-normal leading-snug text-muted sm:text-[14px]`}>{r.label}</th>
            <td className={pad}><Cell value={r.free} plan="Free" /></td>
            <td className={`${pad} ${finalsCol}`}><Cell value={r.finals} plan="Finals" /></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        {/* Wider screens: each button under its plan. Phones: both full width, Finals first. */}
        <tr className="hidden align-top sm:table-row">
          <td className={pad} />
          <td className={`${pad} pb-6`}>{freeAction}</td>
          <td className={`${pad} ${finalsCol} pb-6`}>{finalsAction}</td>
        </tr>
        <tr className="sm:hidden">
          <td colSpan={3} className="space-y-3 px-4 pb-5 pt-4">
            {finalsAction}
            {freeAction}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
