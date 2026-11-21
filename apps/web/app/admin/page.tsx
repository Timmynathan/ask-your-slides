import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/dashboard";
import { isAdminEmail, rangeStart, RANGES, type Overview, type Range } from "@/lib/admin";
import { TABS, type Tab } from "@/lib/admin-shared";
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
  const [{ data, error }, plans, courses, heardFrom, funnel, { data: appFeedbackRows }] = await Promise.all([
    loadOverview(db, from),
    planStats(db, from),
    db.from("courses").select("code, department").order("sort_order"),
    heardFromCounts(db, from),
    signupFunnel(db, from),
    // General feedback from the Feedback button (missing before its migration: then none).
    db.from("app_feedback").select("id, created_at, message, sentiment, features, page, profiles(email)").order("created_at", { ascending: false }).limit(50),
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
  return <AdminDashboard data={overview} courses={withDepartments} plans={plans} heardFrom={heardFrom} funnel={funnel} appFeedback={appFeedback} range={range} tab={tab} email={user.email ?? ""} />;
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

// "How did you hear about us?" went live at this time: students who signed up before never saw it,
// so they pass that step when they passed step 1.
const HEARD_FROM_LIVE = "2026-11-20T18:45:00+01:00";

/** Sign-up funnel for students who signed up in the period: how many got through each step. Built
 *  from what each step already saves (profiles; usage_daily for a first question), no extra tracking. */
async function signupFunnel(db: ReturnType<typeof adminClient>, from: string | null) {
  let q = db.from("profiles").select("id, created_at, programme, heard_from, onboarded").range(0, 49_999);
  if (from) q = q.gte("created_at", from);
  const [{ data: profiles }, { data: usage }] = await Promise.all([q, db.from("usage_daily").select("user_id").gt("message_count", 0).range(0, 49_999)]);
  const rows = (profiles ?? []) as { id: string; created_at: string; programme: string | null; heard_from: string | null; onboarded: boolean }[];
  const asked = new Set(((usage ?? []) as { user_id: string }[]).map((u) => u.user_id));
  const live = Date.parse(HEARD_FROM_LIVE);
  const step1 = rows.filter((r) => r.programme);
  const step2 = step1.filter((r) => r.heard_from || Date.parse(r.created_at) < live);
  const step3 = step2.filter((r) => r.onboarded);
  const first = step3.filter((r) => asked.has(r.id));
  return [
    { label: "Created an account", n: rows.length },
    { label: "Step 1: name and programme", n: step1.length },
    { label: "Step 2: how they heard about us", n: step2.length },
    { label: "Step 3: picked a study partner", n: step3.length },
    { label: "Asked their first question", n: first.length },
  ];
}

export default function AdminPage(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded {...props} />
    </Suspense>
  );
}
