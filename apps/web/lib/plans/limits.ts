// Plan rules as pure functions of (plan, account creation time, now), so they can be tested with
// any clock. The server enforces them (app/api/chat); the UI only displays what they return.
import {
  FINALS_DAILY,
  FINALS_PRICE,
  FINALS_PRICE_EARLY,
  FREE_DAILY,
  FREE_FIRST_DAY,
  FREE_SUMMARIES,
  PREMIUM_FREE_DAILY,
  PREMIUM_FREE_FIRST_DAY,
  PRICE_CHANGE_DATE,
  TIME_ZONE,
  type PlanId,
} from "./config";

const lagosDate = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The Lagos calendar day of an instant, "YYYY-MM-DD". Limits reset when this changes. */
export function lagosDay(at: Date): string {
  return lagosDate.format(at);
}

/** The next midnight in Lagos after `at`: when today's limits reset. */
export function nextLagosMidnight(at: Date): Date {
  // Lagos is UTC+1 all year (no daylight saving).
  const [y, m, d] = lagosDay(at).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 60 * 60 * 1000);
}

/** True on the Lagos calendar day the account was created. */
export function isFirstDay(createdAt: Date, now: Date): boolean {
  return lagosDay(createdAt) === lagosDay(now);
}

export interface Limits {
  plan: PlanId;
  /** Messages allowed today (all courses). */
  daily: number;
  /** Questions allowed today in this course, or null when it has no own limit. */
  course: number | null;
  /** Summaries allowed in total, or null for unlimited. */
  summaries: number | null;
  quiz: boolean;
}

export function limitsFor(plan: PlanId, opts: { createdAt: Date; now: Date; premium: boolean }): Limits {
  if (plan === "finals") return { plan, daily: FINALS_DAILY, course: null, summaries: null, quiz: true };
  const first = isFirstDay(opts.createdAt, opts.now);
  return {
    plan,
    daily: first ? FREE_FIRST_DAY : FREE_DAILY,
    course: opts.premium ? (first ? PREMIUM_FREE_FIRST_DAY : PREMIUM_FREE_DAILY) : null,
    summaries: FREE_SUMMARIES,
    quiz: false,
  };
}

/** The Finals price in naira at `now`. The server decides it at checkout. */
export function finalsPrice(now: Date): number {
  return now < PRICE_CHANGE_DATE ? FINALS_PRICE_EARLY : FINALS_PRICE;
}

export function earlyPriceActive(now: Date): boolean {
  return now < PRICE_CHANGE_DATE;
}

// ── What the student is asking for (decided on the server, from their own words) ──
// The starter buttons send fixed wording ("Summarize the topic …", "Quiz me on …"), so these match
// them; typed requests use the same words.

/** "Quiz me", "test me", "give me practice questions"… */
export function asksForQuiz(message: string): boolean {
  return /\b(quiz(z(es|ing))?|test me|test my (knowledge|understanding)|(ask|give) me (some |a few |\d+ )?(practice |test )?questions)\b/i.test(message);
}

/** "Summarize…", "overview of…", "recap…". */
export function asksForSummary(message: string): boolean {
  return /\b(summar(y|ies|i[sz]e|i[sz]ing)|overview|recap)\b/i.test(message);
}
