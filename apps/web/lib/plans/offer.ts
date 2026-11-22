// What the pricing page, the landing page and the pricing sheet show (PRD F12). Built only from
// lib/plans/config.ts, the file the server enforces, so the screens can't drift from the rules.
// Plain data: safe to pass from a server component to a client one.
import { PAST_QUESTIONS_LIVE } from "@/lib/past/feature";
import {
  FINALS_DAILY,
  FINALS_PRICE,
  FINALS_PRICE_EARLY,
  FREE_DAILY,
  FREE_FIRST_DAY,
  FREE_PRACTICE_PER_COURSE,
  FREE_SUMMARIES,
  PLAN_END_DATE,
  PREMIUM_FREE_DAILY,
  PREMIUM_FREE_FIRST_DAY,
  PRICE_CHANGE_DATE,
  TIME_ZONE,
  UPLOADS_ALLOWED,
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
  free: { firstDay: number; daily: number; premiumFirstDay: number; premiumDaily: number; summaries: number; practicePerCourse: number };
  finals: { daily: number };
  /** Set by the server (lib/plans/manual-pay.ts paymentsOpen): false until the bank details are set. */
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
      practicePerCourse: FREE_PRACTICE_PER_COURSE,
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
/** `freePast`: the student's programme has its past questions open to everyone (FREE_PAST_PROGRAMMES). */
export function comparisonRows(o: PlanOffer, opts: { freePast?: boolean } = {}): { label: string; free: string | boolean; finals: string | boolean }[] {
  const rows = [
    { label: "Daily messages", free: `${o.free.firstDay} on day one, then ${o.free.daily} a day`, finals: `${o.finals.daily} a day` },
    { label: "All your courses", free: true, finals: true },
    { label: "Premium courses", free: `${o.free.premiumDaily} questions a day`, finals: "Unlimited" },
    { label: "Answers cite your actual slides", free: true, finals: true },
    { label: "Summaries", free: String(o.free.summaries), finals: "Unlimited" },
    { label: "Quiz mode", free: false, finals: true },
    { label: "Upload photos of your tests and notes", free: `Up to ${UPLOADS_ALLOWED.free}`, finals: `Up to ${UPLOADS_ALLOWED.finals}` },
  ];
  // "How long it lasts" and "Payment" rows removed (owner, 22 Nov 2026): the pricing page says both
  // under the table.
  if (!PAST_QUESTIONS_LIVE) return rows;
  return [
    ...rows,
    {
      label: "Past questions",
      free: opts.freePast ? "Every past question" : o.free.practicePerCourse > 0 ? `${o.free.practicePerCourse} practice question${o.free.practicePerCourse === 1 ? "" : "s"} per course` : false,
      finals: "Every past question",
    },
    { label: "Model answers and marked practice", free: !!opts.freePast, finals: true },
  ];
}

/**
 * The chat's reply when a student sends a question after today's limit (owner, 19 Nov 2026): the
 * box stays open, and each question gets this instead of an answer. Names the exact reset time
 * (Lagos), and how long until then.
 */
export function capReply(code: string, resetsAt: string | null, now: number): string {
  const which = code === "premium_cap" ? "Your premium limit is reached." : "Your daily limit is reached.";
  if (!resetsAt) return `${which} That's it for today. It resets at midnight (WAT).`;
  const at = new Date(resetsAt);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true })
    .format(at)
    .replace(/\s/g, " ")
    .replace(/^0:/, "12:");
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" }).format(at);
  const left = timeLeft(resetsAt, now);
  return `${which} That's it for today. It resets at ${time} WAT on ${day}${left ? ` (in ${left})` : ""}.`;
}
