import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/dashboard";
import { isAdminEmail, rangeStart, RANGES, type Overview, type Range } from "@/lib/admin";
import { requireUser } from "@/lib/auth/session";
import { adminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · Ask Your Slides", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ range?: string }> };

// Owner-only. Anyone else (signed in or not) gets a plain 404: the page doesn't admit it exists.
// The data comes from public.admin_overview(), callable only with the service role.
async function Loaded({ searchParams }: Props) {
  const { user } = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const raw = (await searchParams).range;
  const range: Range = RANGES.some((r) => r.id === raw) ? (raw as Range) : "30d";
  const cap = Number(process.env.DAILY_MESSAGE_CAP) > 0 ? Number(process.env.DAILY_MESSAGE_CAP) : 50;
  const { data, error } = await adminClient().rpc("admin_overview", { p_from: rangeStart(range), p_cap: cap });
  if (error) throw new Error(`Couldn't load the admin numbers: ${error.message}`);
  return <AdminDashboard data={data as Overview} range={range} email={user.email ?? ""} />;
}

export default function AdminPage(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded {...props} />
    </Suspense>
  );
}
