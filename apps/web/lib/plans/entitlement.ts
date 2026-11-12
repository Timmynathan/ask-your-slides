// Which plan a student is on right now (server only: reads service-role tables).
import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/admin";
import type { PlanId } from "./config";
import { lagosDay, limitsFor, type Limits } from "./limits";

type Db = ReturnType<typeof adminClient>;

export interface PlanState {
  plan: PlanId;
  /** When the current Finals plan ends (null on Free). */
  endsAt: Date | null;
  /** The account's creation time: decides the first-day allowance. */
  createdAt: Date;
}

export interface EntitlementRow {
  plan: PlanId;
  starts_at: string;
  ends_at: string;
}

/** The entitlement that covers `now` (latest end wins), or null: the student is on Free. */
export function activeEntitlement(rows: EntitlementRow[], now: Date): EntitlementRow | null {
  const t = now.getTime();
  return (
    rows
      .filter((e) => new Date(e.starts_at).getTime() <= t && t < new Date(e.ends_at).getTime())
      .sort((a, b) => new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime())[0] ?? null
  );
}

/** Finals while an entitlement covers `now`; otherwise Free. */
export async function planState(db: Db, userId: string, now: Date): Promise<PlanState> {
  const [profile, ents] = await Promise.all([
    db.from("profiles").select("created_at").eq("id", userId).single(),
    db.from("entitlements").select("plan, starts_at, ends_at").eq("user_id", userId),
  ]);
  const createdAt = new Date((must(profile) as { created_at: string }).created_at);
  const active = activeEntitlement(must(ents) as EntitlementRow[], now);
  return active ? { plan: active.plan, endsAt: new Date(active.ends_at), createdAt } : { plan: "free", endsAt: null, createdAt };
}

export interface UsageNow {
  limits: Limits;
  day: string;
  /** Messages used today (all courses), and in this course (0 when it has no own limit). */
  used: number;
  courseUsed: number;
  summariesUsed: number;
  /** Messages the student can still send in this course today. */
  left: number;
}

/** Limits and today's counts for one course, for the server and for display. */
export async function usageNow(db: Db, state: PlanState, opts: { userId: string; courseId: string; premium: boolean; now: Date }): Promise<UsageNow> {
  const limits = limitsFor(state.plan, { createdAt: state.createdAt, now: opts.now, premium: opts.premium });
  const day = lagosDay(opts.now);
  const [daily, course, summaries] = await Promise.all([
    db.from("usage_daily").select("message_count").eq("user_id", opts.userId).eq("day", day).maybeSingle(),
    db.from("usage_course_daily").select("message_count").eq("user_id", opts.userId).eq("day", day).eq("course_id", opts.courseId).maybeSingle(),
    db.from("summary_uses").select("id", { count: "exact", head: true }).eq("user_id", opts.userId),
  ]);
  const used = (must(daily) as { message_count: number } | null)?.message_count ?? 0;
  const courseUsed = (must(course) as { message_count: number } | null)?.message_count ?? 0;
  const summariesUsed = summaries.count ?? 0;
  const left = Math.max(0, Math.min(limits.daily - used, limits.course === null ? Infinity : limits.course - courseUsed));
  return { limits, day, used, courseUsed, summariesUsed, left };
}

export type LimitFeature = "daily_cap" | "premium_cap" | "summary" | "quiz";

/** Every time a limit or lock stops a student (PRD F12). Never fails the request. */
export async function logLimitEvent(db: Db, e: { userId: string; plan: PlanId; courseId: string | null; feature: LimitFeature }) {
  const { error } = await db.from("limit_events").insert({ user_id: e.userId, plan: e.plan, course_id: e.courseId, feature: e.feature });
  if (error) console.error("limit_events insert failed", error.message);
}
