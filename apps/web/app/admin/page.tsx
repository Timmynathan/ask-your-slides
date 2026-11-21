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
  const [{ data, error }, plans, courses, heardFrom, { data: appFeedbackRows }] = await Promise.all([
    loadOverview(db, from),
    planStats(db, from),
    db.from("courses").select("code, department").order("sort_order"),
    heardFromCounts(db, from),
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
  return <AdminDashboard data={overview} courses={withDepartments} plans={plans} heardFrom={heardFrom} appFeedback={appFeedback} range={range} tab={tab} email={user.email ?? ""} />;
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


export default function AdminPage(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded {...props} />
    </Suspense>
  );
}
