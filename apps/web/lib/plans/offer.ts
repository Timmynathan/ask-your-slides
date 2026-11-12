// What the pricing page, the landing page and the pricing sheet show (PRD F12). Built only from
// lib/plans/config.ts, the file the server enforces, so the screens can't drift from the rules.
// Plain data: safe to pass from a server component to a client one.
import {
  FINALS_DAILY,
  FINALS_PRICE,
  FINALS_PRICE_EARLY,
  FREE_DAILY,
  FREE_FIRST_DAY,
  FREE_SUMMARIES,
  PLAN_END_DATE,
  PREMIUM_FREE_DAILY,
  PREMIUM_FREE_FIRST_DAY,
  PRICE_CHANGE_DATE,
  TIME_ZONE,
} from "./config";
import { earlyPriceActive, finalsPrice } from "./limits";

export interface PlanOffer {
  /** The Finals price now, in naira (what checkout will charge). */
  price: number;
  earlyPrice: number;
  fullPrice: number;
  /** True while the early price applies. */
  early: boolean;
  /** ISO instant when the price goes up. */
  priceChangeAt: string;
  /** "22 Nov" (Lagos). */
  priceChangeLabel: string;
  planEndAt: string;
  free: { firstDay: number; daily: number; premiumFirstDay: number; premiumDaily: number; summaries: number };
  finals: { daily: number };
  /** Set by the server (lib/plans/paystack.ts paymentsOpen): false until a Paystack key is set. */
  paymentsOpen?: boolean;
}

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: TIME_ZONE });

export function planOffer(now: Date = new Date()): PlanOffer {
  return {
    price: finalsPrice(now),
    earlyPrice: FINALS_PRICE_EARLY,
    fullPrice: FINALS_PRICE,
    early: earlyPriceActive(now),
    priceChangeAt: PRICE_CHANGE_DATE.toISOString(),
    priceChangeLabel: dayMonth.format(PRICE_CHANGE_DATE),
    planEndAt: PLAN_END_DATE.toISOString(),
    free: {
      firstDay: FREE_FIRST_DAY,
      daily: FREE_DAILY,
      premiumFirstDay: PREMIUM_FREE_FIRST_DAY,
      premiumDaily: PREMIUM_FREE_DAILY,
      summaries: FREE_SUMMARIES,
    },
    finals: { daily: FINALS_DAILY },
  };
}

export const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/** "2d 4h", "5h 12m", "3m"; null once the moment has passed. */
export function timeLeft(until: string, now: number): string | null {
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${Math.max(1, m)}m`;
}

/** One row per feature, Free vs Finals (landing comparison, pricing page). Only features that exist. */
export function comparisonRows(o: PlanOffer): { label: string; free: string | boolean; finals: string | boolean }[] {
  return [
    { label: "Daily messages", free: `${o.free.firstDay} on day one, then ${o.free.daily} a day`, finals: `${o.finals.daily} a day` },
    { label: "All your courses", free: true, finals: true },
    { label: "Premium courses", free: `${o.free.premiumDaily} questions a day`, finals: "Unlimited" },
    { label: "Answers cite your actual slides", free: true, finals: true },
    { label: "Summaries", free: String(o.free.summaries), finals: "Unlimited" },
    { label: "Quiz mode", free: false, finals: true },
    { label: "Valid", free: "Forever", finals: "Until your last paper" },
  ];
}
