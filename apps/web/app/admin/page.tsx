import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/dashboard";
import { isAdminEmail, rangeStart, RANGES, type Overview, type Range } from "@/lib/admin";
import { TABS, type DeviceStats, type RecommendStats, type Tab } from "@/lib/admin-shared";
import { requireUser } from "@/lib/auth/session";
import { adminClient } from "@/lib/supabase/admin";
import { FREE_DAILY } from "@/lib/plans/config";
import { planStats } from "@/lib/plans/admin-stats";
import { HEARD_FROM } from "@/lib/heard-from";

export const metadata: Metadata = { title: "Admin · Ask Your Slides", robots: { index: false, follow: false } };

/** The admin numbers, with the owner's and admins' own accounts left out of activity (migration
 *  20261121000003). Until that migration is pushed, the older function (no p_exclude) answers. */
async function loadOverview(db: ReturnType<typeof adminClient>, from: string | null) {
  const exclude = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const res = await db.rpc("admin_overview", { p_from: from, p_cap: FREE_DAILY, p_exclude: exclude });
  if (!res.error) return res;
  return db.rpc("admin_overview", { p_from: from, p_cap: FREE_DAILY });
}

type Props = { searchParams: Promise<{ range?: string; tab?: string }> };

// Owner-only. Anyone else (signed in or not) gets a plain 404: the page doesn't admit it exists.
// The data comes from public.admin_overview(), callable only with the service role.
async function Loaded({ searchParams }: Props) {
  const { user } = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const sp = await searchParams;
  const raw = sp.range;
  const tab: Tab = TABS.some((x) => x.id === sp.tab) ? (sp.tab as Tab) : "overview";
  const range: Range = RANGES.some((r) => r.id === raw) ? (raw as Range) : "30d";
  const db = adminClient();
  const from = rangeStart(range);
  // The overview's own cap count is superseded by limit_events (PRD F12); FREE_DAILY keeps it sensible.
  const [{ data, error }, plans, courses, heardFrom, { data: appFeedbackRows }, devices, recommend] = await Promise.all([
    loadOverview(db, from),
    planStats(db, from),
    db.from("courses").select("code, department").order("sort_order"),
    heardFromCounts(db, from),
    // General feedback from the Feedback button (missing before its migration: then none).
    db.from("app_feedback").select("id, created_at, message, sentiment, features, page, profiles(email)").order("created_at", { ascending: false }).limit(50),
    deviceCounts(db, from),
    recommendStats(db, from),
  ]);
  const appFeedback = ((appFeedbackRows ?? []) as unknown as { id: string; created_at: string; message: string; sentiment: "good" | "bad" | null; features: string[]; page: string | null; profiles: { email: string } | null }[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    message: r.message,
    sentiment: r.sentiment,
    features: r.features,
    page: r.page,
    email: r.profiles?.email ?? "",
  }));
  if (error) throw new Error(`Couldn't load the admin numbers: ${error.message}`);
  const overview = data as Overview;
  // admin_overview lists every course in sort_order (unique), so its rows line up with this list.
  const departments = (courses.data ?? []) as { code: string; department: string }[];
  const withDepartments = overview.courses.map((c, i) => ({ ...c, department: departments[i]?.code === c.code ? departments[i].department : "Other" }));
  return <AdminDashboard data={overview} courses={withDepartments} plans={plans} heardFrom={heardFrom} devices={devices} recommend={recommend} appFeedback={appFeedback} range={range} tab={tab} email={user.email ?? ""} />;
}

/** "How did you hear about us?" answers from students who signed up in the period (asked since 20 Nov 2026). */
async function heardFromCounts(db: ReturnType<typeof adminClient>, from: string | null) {
  const count = async (id: string | null) => {
    let q = db.from("profiles").select("id", { count: "exact", head: true });
    q = id ? q.eq("heard_from", id) : q.is("heard_from", null);
    if (from) q = q.gte("created_at", from);
    const { count: n, error } = await q;
    return error ? 0 : n ?? 0;
  };
  const rows = await Promise.all([...HEARD_FROM.map(async (h) => ({ label: h.label, n: await count(h.id) })), count(null).then((n) => ({ label: "Not asked (joined earlier)", n }))]);
  return rows.filter((r) => r.n > 0);
}

/** Students seen on each kind of device, system and browser in the period (table user_devices, recorded
 *  since 23 Nov 2026). A student on a phone and a laptop counts once in each row. Admins are left out. */
async function deviceCounts(db: ReturnType<typeof adminClient>, from: string | null): Promise<DeviceStats> {
  const exclude = new Set((process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  let q = db.from("user_devices").select("user_id, kind, os, browser, profiles(email)").limit(5000);
  if (from) q = q.gte("last_seen", from);
  const { data, error } = await q;
  const rows = error ? [] : ((data ?? []) as unknown as { user_id: string; kind: string; os: string; browser: string; profiles: { email: string } | null }[]);
  const kept = rows.filter((r) => !exclude.has((r.profiles?.email ?? "").toLowerCase()));
  const tally = (pick: (r: (typeof kept)[number]) => string) => {
    const by = new Map<string, Set<string>>();
    for (const r of kept) by.set(pick(r), (by.get(pick(r)) ?? new Set()).add(r.user_id));
    return [...by.entries()].map(([label, ids]) => ({ label, n: ids.size })).sort((a, b) => b.n - a.n);
  };
  const KIND: Record<string, string> = { phone: "Phone", tablet: "Tablet", laptop: "Laptop / desktop" };
  return {
    students: new Set(kept.map((r) => r.user_id)).size,
    kinds: tally((r) => KIND[r.kind] ?? r.kind),
    systems: tally((r) => r.os),
    browsers: tally((r) => r.browser),
  };
}

/** The recommend-us card (nps_responses, asked since 23 Nov 2026) in the period. A student who answered
 *  more than once counts once, with their latest score. Admins are left out. */
async function recommendStats(db: ReturnType<typeof adminClient>, from: string | null): Promise<RecommendStats> {
  const exclude = new Set((process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  let q = db.from("nps_responses").select("user_id, score, reason, created_at, profiles(email, display_name)").order("created_at", { ascending: false }).limit(5000);
  if (from) q = q.gte("created_at", from);
  const { data, error } = await q;
  const rows = (error ? [] : ((data ?? []) as unknown as { user_id: string; score: number; reason: string | null; created_at: string; profiles: { email: string; display_name: string | null } | null }[])).filter(
    (r) => !exclude.has((r.profiles?.email ?? "").toLowerCase()),
  );
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.user_id)) latest.set(r.user_id, r); // newest first
  const scores = [...latest.values()].map((r) => r.score);
  const count = (ok: (s: number) => boolean) => scores.filter(ok).length;
  const promoters = count((s) => s >= 9);
  const detractors = count((s) => s <= 6);
  return {
    students: scores.length,
    average: scores.length ? Math.round((10 * scores.reduce((a, b) => a + b, 0)) / scores.length) / 10 : null,
    nps: scores.length ? Math.round((100 * (promoters - detractors)) / scores.length) : null,
    promoters,
    passives: scores.length - promoters - detractors,
    detractors,
    scores: Array.from({ length: 11 }, (_, s) => ({ score: 10 - s, n: count((x) => x === 10 - s) })),
    responses: rows.slice(0, 200).map((r) => ({ score: r.score, reason: r.reason, email: r.profiles?.email ?? "", name: r.profiles?.display_name ?? null, createdAt: r.created_at })),
  };
}

export default function AdminPage(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded {...props} />
    </Suspense>
  );
}
