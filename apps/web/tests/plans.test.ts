// Plans (PRD F12): limits, Lagos days, price switch, plan end, and the server gate in front of a
// chat turn. The database counting itself is proven in supabase/tests/plans.sql; here the gate
// runs against an in-memory stand-in with the same rules.
import { describe, expect, it } from "vitest";
import {
  FINALS_DAILY,
  FINALS_PRICE,
  FINALS_PRICE_EARLY,
  FREE_DAILY,
  FREE_FIRST_DAY,
  PLAN_END_DATE,
  PREMIUM_FREE_DAILY,
  PREMIUM_FREE_FIRST_DAY,
  PRICE_CHANGE_DATE,
} from "@/lib/plans/config";
import { activeEntitlement } from "@/lib/plans/entitlement";
import { admitChatTurn } from "@/lib/plans/gate";
import { asksForQuiz, asksForSummary, finalsPrice, isFirstDay, lagosDay, limitsFor, nextLagosMidnight } from "@/lib/plans/limits";

const at = (s: string) => new Date(s);
// Account created Mon 16 Nov 2026, 10:00 Lagos.
const CREATED = at("2026-11-16T10:00:00+01:00");
const DAY1 = at("2026-11-16T21:00:00+01:00");
const DAY2 = at("2026-11-17T09:00:00+01:00");

describe("plan config", () => {
  it("has the launch numbers", () => {
    expect([FREE_FIRST_DAY, FREE_DAILY, PREMIUM_FREE_FIRST_DAY, PREMIUM_FREE_DAILY, FINALS_DAILY]).toEqual([20, 5, 8, 2, 40]);
    expect([FINALS_PRICE_EARLY, FINALS_PRICE]).toEqual([3000, 5000]);
  });
});

describe("Lagos days", () => {
  it("a day is a Lagos calendar day, not a UTC one", () => {
    // 23:30 UTC on the 16th is already 00:30 on the 17th in Lagos.
    expect(lagosDay(at("2026-11-16T22:59:59Z"))).toBe("2026-11-16");
    expect(lagosDay(at("2026-11-16T23:00:00Z"))).toBe("2026-11-17");
  });

  it("limits reset at midnight Lagos time", () => {
    expect(nextLagosMidnight(at("2026-11-16T21:00:00+01:00")).toISOString()).toBe("2026-11-16T23:00:00.000Z");
    expect(nextLagosMidnight(at("2026-11-16T00:00:00+01:00")).toISOString()).toBe("2026-11-16T23:00:00.000Z");
  });

  it("the first day is the Lagos day the account was created", () => {
    expect(isFirstDay(CREATED, DAY1)).toBe(true);
    expect(isFirstDay(CREATED, at("2026-11-16T23:59:59+01:00"))).toBe(true);
    expect(isFirstDay(CREATED, at("2026-11-17T00:00:00+01:00"))).toBe(false);
    // Created at 00:30 Lagos (23:30 UTC the day before): its first day is the Lagos day.
    expect(isFirstDay(at("2026-11-16T23:30:00Z"), at("2026-11-17T20:00:00+01:00"))).toBe(true);
  });
});

describe("limits", () => {
  it("Free: 20 on day one, then 5; premium 8 then 2 (inside the daily cap); 1 summary; no quiz", () => {
    expect(limitsFor("free", { createdAt: CREATED, now: DAY1, premium: false })).toEqual({ plan: "free", daily: 20, course: null, summaries: 1, quiz: false });
    expect(limitsFor("free", { createdAt: CREATED, now: DAY1, premium: true })).toMatchObject({ daily: 20, course: 8 });
    expect(limitsFor("free", { createdAt: CREATED, now: DAY2, premium: false })).toMatchObject({ daily: 5, course: null });
    expect(limitsFor("free", { createdAt: CREATED, now: DAY2, premium: true })).toMatchObject({ daily: 5, course: 2 });
  });

  it("Finals: 40 a day, no premium limit, unlimited summaries, quiz", () => {
    for (const now of [DAY1, DAY2]) {
      expect(limitsFor("finals", { createdAt: CREATED, now, premium: true })).toEqual({ plan: "finals", daily: 40, course: null, summaries: null, quiz: true });
    }
  });
});

describe("price", () => {
  it("₦3,000 before PRICE_CHANGE_DATE, ₦5,000 from it", () => {
    expect(PRICE_CHANGE_DATE.toISOString()).toBe("2026-11-22T22:59:00.000Z"); // 23:59 Lagos
    expect(finalsPrice(at("2026-11-16T12:00:00+01:00"))).toBe(3000);
    expect(finalsPrice(at("2026-11-22T23:58:59+01:00"))).toBe(3000);
    expect(finalsPrice(at("2026-11-22T23:59:00+01:00"))).toBe(5000);
    expect(finalsPrice(at("2026-12-01T12:00:00+01:00"))).toBe(5000);
  });
});

describe("plan end", () => {
  const ent = { plan: "finals" as const, starts_at: "2026-11-16T12:00:00+01:00", ends_at: PLAN_END_DATE.toISOString() };
  it("Finals until PLAN_END_DATE, then back to Free", () => {
    expect(activeEntitlement([ent], DAY2)).toEqual(ent);
    expect(activeEntitlement([ent], new Date(PLAN_END_DATE.getTime() - 1000))).toEqual(ent);
    expect(activeEntitlement([ent], PLAN_END_DATE)).toBeNull();
    expect(activeEntitlement([ent], at("2026-11-16T11:00:00+01:00"))).toBeNull(); // not started
    expect(activeEntitlement([], DAY2)).toBeNull();
  });
});

describe("what the student asks for", () => {
  it("recognises quiz requests, including the starter buttons", () => {
    for (const m of ['Quiz me on "Normalisation".', "Quiz me on this course.", "can you test me on joins", "give me 5 practice questions", "quizzes please"]) {
      expect(asksForQuiz(m), m).toBe(true);
    }
    for (const m of ["What is a hash index?", "Explain the test plan in topic 3", "what questions came in the exam?"]) {
      expect(asksForQuiz(m), m).toBe(false);
    }
  });

  it("recognises summary requests, including the starter buttons", () => {
    for (const m of ['Summarize the topic "Risk".', "Give me an overview of the whole course.", "summarise week 3", "quick recap of lecture 2", "a summary of the privacy slides"]) {
      expect(asksForSummary(m), m).toBe(true);
    }
    for (const m of ["What is a hash index?", "Explain like I missed class"]) {
      expect(asksForSummary(m), m).toBe(false);
    }
  });
});

// ── The gate, against an in-memory database with the same counting rules as the SQL ──────────
type Row = Record<string, unknown>;
function fakeDb(opts: { createdAt: Date; entitlements?: Row[] }) {
  const t: Record<string, Row[]> = {
    profiles: [{ id: "u1", created_at: opts.createdAt.toISOString() }],
    entitlements: (opts.entitlements ?? []).map((e) => ({ user_id: "u1", ...e })),
    usage_daily: [],
    usage_course_daily: [],
    summary_uses: [],
    limit_events: [],
  };
  let nextId = 1;
  const count = (table: string, match: Row) => t[table].find((r) => Object.entries(match).every(([k, v]) => r[k] === v));
  const rpc = async (name: string, a: Row) => {
    if (name === "consume_message_plan") {
      const d = count("usage_daily", { user_id: a.p_user_id, day: a.p_day });
      const c = count("usage_course_daily", { user_id: a.p_user_id, day: a.p_day, course_id: a.p_course_id });
      const used = (d?.message_count as number) ?? 0;
      const cu = (c?.message_count as number) ?? 0;
      if (used >= (a.p_cap as number)) return { data: [{ allowed: false, reason: "daily_cap", used, course_used: cu }], error: null };
      if (a.p_course_cap !== null && cu >= (a.p_course_cap as number)) return { data: [{ allowed: false, reason: "premium_cap", used, course_used: cu }], error: null };
      if (d) d.message_count = used + 1;
      else t.usage_daily.push({ user_id: a.p_user_id, day: a.p_day, message_count: 1 });
      if (c) c.message_count = cu + 1;
      else t.usage_course_daily.push({ user_id: a.p_user_id, day: a.p_day, course_id: a.p_course_id, message_count: 1 });
      return { data: [{ allowed: true, reason: null, used: used + 1, course_used: cu + 1 }], error: null };
    }
    if (name === "refund_message_plan") {
      const d = count("usage_daily", { user_id: a.p_user_id, day: a.p_day });
      const c = count("usage_course_daily", { user_id: a.p_user_id, day: a.p_day, course_id: a.p_course_id });
      if (d) d.message_count = Math.max(0, (d.message_count as number) - 1);
      if (c) c.message_count = Math.max(0, (c.message_count as number) - 1);
      return { data: null, error: null };
    }
    if (name === "consume_summary") {
      const used = t.summary_uses.filter((r) => r.user_id === a.p_user_id).length;
      if (a.p_limit !== null && used >= (a.p_limit as number)) return { data: [{ allowed: false, used, use_id: null }], error: null };
      const id = nextId++;
      t.summary_uses.push({ id, user_id: a.p_user_id });
      return { data: [{ allowed: true, used: used + 1, use_id: id }], error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  };
  const from = (table: string) => {
    const filters: Row = {};
    let head = false;
    let del = false;
    const rows = () => t[table].filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
    const q = {
      select: (_c?: string, o?: { head?: boolean }) => ((head = !!o?.head), q),
      eq: (k: string, v: unknown) => ((filters[k] = v), q),
      delete: () => ((del = true), q),
      insert: async (row: Row) => (t[table].push({ ...row }), { data: null, error: null }),
      single: async () => ({ data: rows()[0], error: rows()[0] ? null : { message: "no row" } }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (del) {
          t[table] = t[table].filter((r) => !rows().includes(r));
          return resolve({ data: null, error: null });
        }
        resolve(head ? { data: null, error: null, count: rows().length } : { data: rows(), error: null });
      },
    };
    return q;
  };
  return { db: { from, rpc } as never, t };
}

const admit = (db: never, message: string, now: Date, premium = false, courseId = "c1") =>
  admitChatTurn(db, { userId: "u1", courseId, premium, message, now });

async function sendUntilRefused(db: never, now: Date, premium: boolean, courseId = "c1") {
  let n = 0;
  for (;;) {
    const r = await admit(db, "What is a hash index?", now, premium, courseId);
    if (!r.ok) return { n, refusal: r.refusal };
    n++;
  }
}

describe("server gate (admitChatTurn)", () => {
  it("Free day one: 20 messages; premium course 8, inside the 20", async () => {
    const { db, t } = fakeDb({ createdAt: CREATED });
    const premium = await sendUntilRefused(db, DAY1, true, "premium");
    expect(premium.n).toBe(8);
    expect(premium.refusal).toMatchObject({ status: 429, body: { code: "premium_cap", resets_at: "2026-11-16T23:00:00.000Z" } });
    const rest = await sendUntilRefused(db, DAY1, false, "other");
    expect(rest.n).toBe(12);
    expect(rest.refusal.body.code).toBe("daily_cap");
    expect(t.limit_events.map((e) => e.feature)).toEqual(["premium_cap", "daily_cap"]);
    expect(t.limit_events[0]).toMatchObject({ user_id: "u1", plan: "free", course_id: "premium" });
  });

  it("Free day two: 5 messages, premium 2 inside them; resets at Lagos midnight", async () => {
    const { db } = fakeDb({ createdAt: CREATED });
    expect((await sendUntilRefused(db, DAY2, true, "premium")).n).toBe(2);
    expect((await sendUntilRefused(db, DAY2, false, "other")).n).toBe(3);
    // 23:59 Lagos on day two: still refused. 00:00 on day three: a new allowance.
    expect((await admit(db, "hi", at("2026-11-17T23:59:59+01:00"))).ok).toBe(false);
    expect((await sendUntilRefused(db, at("2026-11-18T00:00:00+01:00"), false)).n).toBe(5);
  });

  it("Free: quiz refused before anything is counted", async () => {
    const { db, t } = fakeDb({ createdAt: CREATED });
    const r = await admit(db, 'Quiz me on "Normalisation".', DAY1);
    expect(r).toMatchObject({ ok: false, refusal: { status: 403, body: { code: "quiz", resets_at: null } } });
    expect(t.usage_daily).toEqual([]);
    expect(t.limit_events[0]).toMatchObject({ feature: "quiz", plan: "free" });
  });

  it("Free: one summary ever; the second is refused and not counted", async () => {
    const { db, t } = fakeDb({ createdAt: CREATED });
    const first = await admit(db, 'Summarize the topic "Risk".', DAY1);
    expect(first.ok && first.turn.summary).toBe(true);
    const second = await admit(db, "Give me an overview of the whole course.", DAY2, false, "c2");
    expect(second).toMatchObject({ ok: false, refusal: { status: 403, body: { code: "summary" } } });
    expect(t.usage_daily.find((r) => r.day === "2026-11-17")).toBeUndefined();
    // After the free summary, the model is told not to write one either.
    const normal = await admit(db, "What is risk?", DAY2);
    expect(normal.ok && normal.turn.planNote).toMatch(/used their one free summary/);
  });

  it("a failed turn gives back the message and the summary", async () => {
    const { db, t } = fakeDb({ createdAt: CREATED });
    const r = await admit(db, "Summarize this topic", DAY1, true, "premium");
    if (!r.ok) throw new Error("should be admitted");
    await r.turn.refund();
    expect(t.usage_daily[0].message_count).toBe(0);
    expect(t.usage_course_daily[0].message_count).toBe(0);
    expect(t.summary_uses).toEqual([]);
  });

  it("Finals: 40 a day, no premium limit, summaries and quiz allowed", async () => {
    const ents = [{ plan: "finals", starts_at: "2026-11-16T00:00:00+01:00", ends_at: PLAN_END_DATE.toISOString() }];
    const { db } = fakeDb({ createdAt: CREATED, entitlements: ents });
    for (let i = 0; i < 3; i++) expect((await admit(db, "Summarize the topic", DAY2, false, `s${i}`)).ok).toBe(true);
    const quiz = await admit(db, "Quiz me on this course.", DAY2);
    expect(quiz.ok && quiz.turn.planNote).toBeNull();
    const premium = await sendUntilRefused(db, DAY2, true, "premium");
    expect(premium.n).toBe(36); // 40 minus the 4 above: no premium-course limit
    expect(premium.refusal.body).toMatchObject({ code: "daily_cap", plan: "finals" });
  });

  it("Finals ends at PLAN_END_DATE: the student is back on Free", async () => {
    const ents = [{ plan: "finals", starts_at: "2026-11-16T00:00:00+01:00", ends_at: PLAN_END_DATE.toISOString() }];
    const { db } = fakeDb({ createdAt: CREATED, entitlements: ents });
    const after = new Date(PLAN_END_DATE.getTime() + 60_000);
    expect(await admit(db, "Quiz me", after)).toMatchObject({ ok: false, refusal: { body: { code: "quiz", plan: "free" } } });
    expect((await sendUntilRefused(db, after, false)).n).toBe(5);
  });
});
