import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import { TIME_ZONE } from "@/lib/plans/config";
import { buildUpdate, sendEmail, UPDATE_TYPES, type UpdateType } from "./send";

// The update-email queue (owner, 24 Nov 2026). Runs every hour (.github/workflows/emails.yml →
// /api/cron/emails): queues welcome emails, then sends what's queued within the limits:
//   - at most DAILY_UPDATE_CAP update emails a day (Resend free plan is 100; sign-in codes need room),
//   - at most WEEKLY_PER_USER update emails per student per 7 days (welcome counts, sign-in doesn't),
//   - never to a student who turned updates off,
//   - students on Finals first, then the most recently active.
// A row that can't go yet (weekly limit) waits; after STALE_DAYS it is skipped as out of date.

type Db = ReturnType<typeof adminClient>;

export const DAILY_UPDATE_CAP = 90;
export const WEEKLY_PER_USER = 2;
const STALE_DAYS = 7;
const PER_RUN = 40; // keeps one run well inside the function time limit

/** Start of today in Lagos, as an ISO instant. */
export function lagosDayStart(now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${day}T00:00:00+01:00`).toISOString();
}

export async function updateSendsSince(db: Db, since: string, userId?: string): Promise<number> {
  let q = db.from("email_sends").select("id", { count: "exact", head: true }).in("type", UPDATE_TYPES).gte("sent_at", since);
  if (userId) q = q.eq("user_id", userId);
  const { count, error } = await q;
  if (error) throw new Error(`email_sends: ${error.message}`);
  return count ?? 0;
}

interface Row {
  id: string;
  user_id: string;
  type: UpdateType;
  course_id: string | null;
  created_at: string;
  attempts: number;
}

export interface RunResult {
  welcomesQueued: number;
  sent: number;
  skipped: number;
  failed: number;
  waiting: number;
  budgetLeft: number;
}

export async function runEmailQueue(db: Db, now = new Date()): Promise<RunResult> {
  const { data: welcomes, error: wErr } = await db.rpc("enqueue_welcome_emails");
  if (wErr) throw new Error(`enqueue_welcome_emails: ${wErr.message}`);
  const out: RunResult = { welcomesQueued: Number(welcomes ?? 0), sent: 0, skipped: 0, failed: 0, waiting: 0, budgetLeft: 0 };

  const budget = Math.min(PER_RUN, DAILY_UPDATE_CAP - (await updateSendsSince(db, lagosDayStart(now))));
  const { data: queued, error } = await db.from("email_queue").select("id, user_id, type, course_id, created_at, attempts").eq("status", "queued").order("created_at").limit(1000);
  if (error) throw new Error(`email_queue: ${error.message}`);
  const rows = (queued ?? []) as Row[];
  if (!rows.length) return { ...out, budgetLeft: Math.max(0, budget) };

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean))] as string[];
  const nowIso = now.toISOString();
  const [profiles, courses, paying, recent, weekSends] = await Promise.all([
    db.from("profiles").select("id, email, display_name, email_updates").in("id", userIds),
    courseIds.length ? db.from("courses").select("id, code, programme, title").in("id", courseIds) : Promise.resolve({ data: [], error: null }),
    db.from("entitlements").select("user_id").in("user_id", userIds).lte("starts_at", nowIso).gt("ends_at", nowIso),
    db.from("conversations").select("user_id, updated_at").in("user_id", userIds).order("updated_at", { ascending: false }).limit(5000),
    db.from("email_sends").select("user_id").in("user_id", userIds).in("type", UPDATE_TYPES).gte("sent_at", new Date(now.getTime() - 7 * 86_400_000).toISOString()),
  ]);
  for (const r of [profiles, courses, paying, recent, weekSends]) if (r.error) throw new Error(r.error.message);
  const profile = new Map((profiles.data as { id: string; email: string; display_name: string | null; email_updates: boolean }[]).map((p) => [p.id, p]));
  const course = new Map((courses.data as { id: string; code: string; programme: string; title: string }[]).map((c) => [c.id, c]));
  const onFinals = new Set((paying.data as { user_id: string }[]).map((e) => e.user_id));
  const lastActive = new Map<string, number>();
  for (const c of recent.data as { user_id: string; updated_at: string }[]) if (!lastActive.has(c.user_id)) lastActive.set(c.user_id, new Date(c.updated_at).getTime());
  const sentThisWeek = new Map<string, number>();
  for (const s of weekSends.data as { user_id: string }[]) sentThisWeek.set(s.user_id, (sentThisWeek.get(s.user_id) ?? 0) + 1);

  const mark = (id: string, patch: Record<string, unknown>) => db.from("email_queue").update(patch).eq("id", id);

  // Paying students first, then the most recently active; oldest row first within a student.
  rows.sort((a, b) => Number(onFinals.has(b.user_id)) - Number(onFinals.has(a.user_id)) || (lastActive.get(b.user_id) ?? 0) - (lastActive.get(a.user_id) ?? 0) || a.created_at.localeCompare(b.created_at));
  const sentThisRun = new Set<string>();
  let left = budget;
  for (const r of rows) {
    const p = profile.get(r.user_id);
    if (!p || !p.email) {
      await mark(r.id, { status: "skipped", reason: "no account" });
      out.skipped++;
      continue;
    }
    if (!p.email_updates) {
      await mark(r.id, { status: "skipped", reason: "unsubscribed" });
      out.skipped++;
      continue;
    }
    if (r.type === "welcome") {
      const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("user_id", r.user_id).eq("role", "user");
      if (count) {
        await mark(r.id, { status: "skipped", reason: "already asked a question" });
        out.skipped++;
        continue;
      }
    }
    const stale = now.getTime() - new Date(r.created_at).getTime() > STALE_DAYS * 86_400_000;
    if ((sentThisWeek.get(r.user_id) ?? 0) >= WEEKLY_PER_USER || sentThisRun.has(r.user_id)) {
      if (stale) {
        await mark(r.id, { status: "skipped", reason: "weekly limit, out of date" });
        out.skipped++;
      } else out.waiting++;
      continue;
    }
    if (left <= 0) {
      out.waiting++;
      continue;
    }
    const c = r.course_id ? course.get(r.course_id) : null;
    if (r.type !== "welcome" && !c) {
      await mark(r.id, { status: "skipped", reason: "course gone" });
      out.skipped++;
      continue;
    }
    const email = await buildUpdate(r.type, { userId: r.user_id, name: p.display_name, course: c });
    const res = await sendEmail(p.email, email, r.type);
    // A setup problem (no Resend key on the server): stop here and keep every row as it is, so the
    // emails go out as soon as the key is set instead of using up their attempts.
    if (res.error?.includes("is not set")) {
      out.failed++;
      out.waiting += rows.length - 1;
      break;
    }
    if (res.error) {
      const attempts = r.attempts + 1;
      await mark(r.id, { attempts, reason: res.error.slice(0, 300), ...(attempts >= 3 ? { status: "failed" } : {}) });
      out.failed++;
      continue;
    }
    await mark(r.id, { status: "sent", sent_at: new Date().toISOString(), attempts: r.attempts + 1, reason: null });
    await db.from("email_sends").insert({ user_id: r.user_id, type: r.type, course_id: r.course_id, queue_id: r.id, resend_id: res.id });
    sentThisRun.add(r.user_id);
    sentThisWeek.set(r.user_id, (sentThisWeek.get(r.user_id) ?? 0) + 1);
    left--;
    out.sent++;
  }
  out.budgetLeft = Math.max(0, left);
  return out;
}
