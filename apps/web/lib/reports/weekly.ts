import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attentionReasons } from "@/lib/admin/attention";

// The owner's weekly email (owner, 23 Nov 2026): how the week went, each number beside last week's.
// Students, questions, paying students, ratings and comments, answers that need a look (and the
// questions the slides didn't cover), speed, daily-limit hits and what those students did next, and
// AI cost. The owner's and admins' own accounts (ADMIN_EMAILS) and test accounts are left out.
// Sent by app/api/cron/weekly-report (Vercel cron, Mondays 08:00 Lagos); previewed at the same
// address with ?preview=1 while signed in as an admin.

const DAY = 86_400_000;
const TEST_EMAIL = /^(?:[a-z]+-)+(?:check|shot|ui|test|e2e)[-\w]*@|^pills-|^plans-ui-|^replay-|^behaviour-check-/i;

type Db = SupabaseClient;

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);
const secs = (ms: number | null) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);
const change = (now: number, before: number) => (before === now ? "same as last week" : `${now > before ? "up" : "down"} from ${before}`);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

export interface WeeklyReport {
  subject: string;
  text: string;
  html: string;
}

export async function weeklyReport(db: Db, now = new Date()): Promise<WeeklyReport> {
  const end = now.getTime();
  const weekStart = new Date(end - 7 * DAY).toISOString();
  const lastStart = new Date(end - 14 * DAY).toISOString();
  const admins = new Set((process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));

  const profiles = await all<{ id: string; email: string | null; display_name: string | null; created_at: string }>((a, b) =>
    db.from("profiles").select("id, email, display_name, created_at").range(a, b),
  );
  const students = new Map(profiles.filter((p) => p.email && !admins.has(p.email.toLowerCase()) && !TEST_EMAIL.test(p.email)).map((p) => [p.id, p]));
  const isStudent = (id: string | null) => !!id && students.has(id);

  const [questions, traces, ratings, comments, limits, entitlements, payments, courses] = await Promise.all([
    all<{ user_id: string; created_at: string }>((a, b) => db.from("messages").select("user_id, created_at").eq("role", "user").gte("created_at", lastStart).range(a, b)),
    all<{ user_id: string | null; course_id: string; message_id: string | null; user_message: string; output_text: string | null; tool_calls: { name: string; detail?: { similarities?: number[] } }[] | null; errors: { code: string }[] | null; latency_ms: number | null; ttft_ms: number | null; cost_usd: number | null; created_at: string }>((a, b) =>
      db.from("traces").select("user_id, course_id, message_id, user_message, output_text, tool_calls, errors, latency_ms, ttft_ms, cost_usd, created_at").eq("kind", "chat").gte("created_at", lastStart).range(a, b),
    ),
    all<{ user_id: string; message_id: string; rating: number; reason: string | null; created_at: string }>((a, b) => db.from("feedback").select("user_id, message_id, rating, reason, created_at").gte("created_at", lastStart).range(a, b)),
    all<{ user_id: string; message: string; created_at: string }>((a, b) => db.from("app_feedback").select("user_id, message, created_at").gte("created_at", weekStart).order("created_at", { ascending: false }).range(a, b)),
    all<{ user_id: string; created_at: string }>((a, b) => db.from("limit_events").select("user_id, created_at").gte("created_at", lastStart).range(a, b)),
    all<{ user_id: string; plan: string; ends_at: string | null; created_at: string; source: string | null }>((a, b) => db.from("entitlements").select("user_id, plan, ends_at, created_at, source").range(a, b)),
    all<{ user_id: string; status: string; created_at: string }>((a, b) => db.from("payment_requests").select("user_id, status, created_at").range(a, b)),
    all<{ id: string; code: string; title: string }>((a, b) => db.from("courses").select("id, code, title").range(a, b)),
  ]);
  const courseName = new Map(courses.map((c) => [c.id, c.code]));
  const inWeek = (iso: string) => iso >= weekStart;
  const inLast = (iso: string) => iso >= lastStart && iso < weekStart;

  // Students and questions.
  const q = questions.filter((m) => isStudent(m.user_id));
  const qWeek = q.filter((m) => inWeek(m.created_at));
  const qLast = q.filter((m) => inLast(m.created_at));
  const activeWeek = new Set(qWeek.map((m) => m.user_id));
  const activeLast = new Set(qLast.map((m) => m.user_id));
  const returning = [...activeWeek].filter((id) => activeLast.has(id)).length;
  const newWeek = [...students.values()].filter((p) => inWeek(p.created_at)).length;
  const newLast = [...students.values()].filter((p) => inLast(p.created_at)).length;

  // Paying students: Finals right now, and new this week.
  const nowIso = now.toISOString();
  // "manual" = a payment the owner approved; "promo" and "comp" are free Finals.
  const finals = entitlements.filter((e) => e.plan === "finals" && isStudent(e.user_id) && (!e.ends_at || e.ends_at > nowIso));
  const paid = finals.filter((e) => e.source === "manual");
  const paying = new Set(paid.map((e) => e.user_id)).size;
  const newPaying = new Set(paid.filter((e) => inWeek(e.created_at)).map((e) => e.user_id)).size;
  const freeFinals = new Set(finals.filter((e) => e.source !== "manual").map((e) => e.user_id)).size;
  const pending = payments.filter((p) => p.status === "pending" && isStudent(p.user_id)).length;

  // Ratings and comments.
  const rWeek = ratings.filter((r) => isStudent(r.user_id) && inWeek(r.created_at));
  const up = rWeek.filter((r) => r.rating === 1).length;
  const down = rWeek.filter((r) => r.rating === -1);
  const rLast = ratings.filter((r) => isStudent(r.user_id) && inLast(r.created_at)).length;
  const studentComments = comments.filter((c) => isStudent(c.user_id));

  // Answers that need a look (lib/admin/attention.ts).
  const t = traces.filter((x) => isStudent(x.user_id));
  const tWeek = t.filter((x) => inWeek(x.created_at));
  const tLast = t.filter((x) => inLast(x.created_at));
  const downIds = new Set(ratings.filter((r) => r.rating === -1).map((r) => r.message_id));
  const reasonsOf = (x: (typeof t)[number]) =>
    attentionReasons({ rating: x.message_id && downIds.has(x.message_id) ? -1 : null, errors: x.errors ?? [], latency_ms: x.latency_ms, output_text: x.output_text, tool_calls: x.tool_calls });
  const flagged = tWeek.map((x) => ({ x, reasons: reasonsOf(x) })).filter((f) => f.reasons.length);
  const flaggedLast = tLast.filter((x) => reasonsOf(x).length).length;
  const byReason = new Map<string, number>();
  for (const f of flagged) for (const r of f.reasons) {
    const k = r.replace(/^Slow \(\d+ s\)$/, "Slow (over 20 s)").replace(/^\d+ slide links removed$/, "3+ slide links removed");
    byReason.set(k, (byReason.get(k) ?? 0) + 1);
  }
  // The questions the slides didn't answer: candidates for missing material.
  const uncovered = flagged
    .filter((f) => f.reasons.includes("Search found nothing relevant") || f.reasons.includes("Not covered by the slides"))
    .slice(0, 8)
    .map((f) => `${courseName.get(f.x.course_id) ?? "?"}: ${f.x.user_message.replace(/\s+/g, " ").slice(0, 110)}`);

  // Speed.
  const speed = (rows: typeof t) => {
    const first = rows.map((x) => x.ttft_ms ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
    const total = rows.map((x) => x.latency_ms ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
    return { first50: pct(first, 0.5), first90: pct(first, 0.9), total50: pct(total, 0.5), total90: pct(total, 0.9) };
  };
  const sW = speed(tWeek);
  const sL = speed(tLast);

  // Daily-limit hits, and what those students did next.
  const capWeek = limits.filter((l) => isStudent(l.user_id) && inWeek(l.created_at));
  const capped = [...new Set(capWeek.map((l) => l.user_id))];
  const firstCap = new Map<string, string>();
  for (const l of capWeek) if (!firstCap.has(l.user_id) || l.created_at < firstCap.get(l.user_id)!) firstCap.set(l.user_id, l.created_at);
  const cameBack = capped.filter((id) => q.some((m) => m.user_id === id && day(m.created_at) > day(firstCap.get(id)!))).length;
  const paidAfter = capped.filter((id) => entitlements.some((e) => e.user_id === id && e.plan === "finals" && e.created_at > firstCap.get(id)!) || payments.some((p) => p.user_id === id && p.created_at > firstCap.get(id)!)).length;

  // Busiest courses and AI cost.
  const perCourse = new Map<string, number>();
  for (const x of tWeek) perCourse.set(courseName.get(x.course_id) ?? "?", (perCourse.get(courseName.get(x.course_id) ?? "?") ?? 0) + 1);
  const busiest = [...perCourse].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, n]) => `${c} (${n})`);
  const cost = tWeek.reduce((s, x) => s + Number(x.cost_usd ?? 0), 0);
  const costLast = tLast.reduce((s, x) => s + Number(x.cost_usd ?? 0), 0);

  const range = `${day(weekStart)} to ${day(nowIso)}`;
  const sections: { title: string; lines: string[] }[] = [
    {
      title: "Students",
      lines: [
        `${students.size} signed up in all; ${newWeek} new this week (${change(newWeek, newLast)}).`,
        `${activeWeek.size} asked at least one question (${change(activeWeek.size, activeLast.size)}); ${returning} of them were also active last week.`,
        `${qWeek.length} questions asked (${change(qWeek.length, qLast.length)}).`,
        `Busiest courses: ${busiest.join(", ") || "none"}.`,
      ],
    },
    {
      title: "Paying students",
      lines: [`${paying} paid for Finals; ${newPaying} new this week.${freeFinals ? ` ${freeFinals} more on free Finals (promo codes or your grants).` : ""}`, pending ? `${pending} payment${pending === 1 ? "" : "s"} waiting for your approval in /admin/payments.` : "No payments waiting for approval."],
    },
    {
      title: "What students told us",
      lines: [
        `Ratings: ${up} thumbs up, ${down.length} thumbs down (${rWeek.length} in all, ${change(rWeek.length, rLast)}).`,
        ...(down.length ? [`Thumbs-down reasons: ${[...new Set(down.map((d) => d.reason ?? "no reason"))].join(", ")}.`] : []),
        ...(studentComments.length ? studentComments.slice(0, 5).map((c) => `Comment: "${c.message.replace(/\s+/g, " ").slice(0, 200)}"`) : ["No written feedback this week."]),
      ],
    },
    {
      title: "Answers that need a look",
      lines: [
        `${flagged.length} of ${tWeek.length} answers (${change(flagged.length, flaggedLast)}). Open /admin → Answers → Needs attention.`,
        ...[...byReason].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${n} × ${r}`),
        ...(uncovered.length ? ["Questions the slides didn't answer (possible missing material):", ...uncovered.map((u) => `  ${u}`)] : []),
      ],
    },
    {
      title: "Speed",
      lines: [
        `First words: typically ${secs(sW.first50)}, slowest 10% ${secs(sW.first90)} (last week ${secs(sL.first50)} / ${secs(sL.first90)}).`,
        `Whole answer: typically ${secs(sW.total50)}, slowest 10% ${secs(sW.total90)} (last week ${secs(sL.total50)} / ${secs(sL.total90)}).`,
      ],
    },
    {
      title: "Daily limit",
      lines: capped.length
        ? [`${capped.length} student${capped.length === 1 ? "" : "s"} ran out of free questions (${capWeek.length} times). Afterwards ${cameBack} came back on a later day and ${paidAfter} paid or asked to pay.`]
        : ["Nobody ran out of free questions."],
    },
    { title: "AI cost", lines: [`$${cost.toFixed(2)} this week (last week $${costLast.toFixed(2)}).`] },
  ];

  const subject = `Ask Your Slides weekly: ${activeWeek.size} active students, ${qWeek.length} questions, ${flagged.length} to look at`;
  const text = [`Your week, ${range}`, "", ...sections.flatMap((s) => [s.title.toUpperCase(), ...s.lines.map((l) => (l.startsWith("  ") ? l : `- ${l}`)), ""])].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#141a33">
<div style="max-width:620px;margin:0 auto;padding:28px 20px">
<p style="margin:0 0 4px;font-size:13px;color:#5b6178">Ask Your Slides · weekly</p>
<h1 style="margin:0 0 20px;font-size:22px;font-weight:600;color:#0e1664">Your week, ${esc(range)}</h1>
${sections
  .map(
    (s) => `<div style="background:#fff;border-radius:16px;padding:16px 18px;margin:0 0 12px;border:1px solid #e6e8f0">
<h2 style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0e1664">${esc(s.title)}</h2>
${s.lines.map((l) => `<p style="margin:4px 0;font-size:14px;line-height:1.5;${l.startsWith("  ") ? "padding-left:14px;color:#3b4160" : ""}">${esc(l.trim())}</p>`).join("\n")}
</div>`,
  )
  .join("\n")}
<p style="margin:16px 0 0;font-size:12px;color:#7a8099">Your own and test accounts are left out. Sent every Monday at 08:00 (Lagos).</p>
</div></body></html>`;
  return { subject, text, html };
}
