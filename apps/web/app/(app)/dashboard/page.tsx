import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Dashboard, type DashboardCourse } from "@/components/dashboard/dashboard";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";

export const metadata: Metadata = { title: "My courses · Ask Your Slides" };

// Dates are formatted here, in Lagos time, so server and browser render the same text.
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

async function Loaded() {
  const { supabase, user } = await requireUser();
  const [{ data: allCourses }, { data: profile }, { data: chats }] = await Promise.all([
    supabase.from("courses").select("id, code, title, department, sort_order, materials(count)").order("sort_order"),
    supabase.from("profiles").select("display_name, onboarded, study_partner, department").eq("id", user.id).single(),
    supabase.from("conversations").select("id, course_id, title, updated_at").order("updated_at", { ascending: false }).limit(500),
  ]);
  if (!profile?.onboarded || !isPartnerId(profile.study_partner)) redirect("/welcome");
  // The student's department's courses; everything when they haven't chosen one (older accounts).
  const courses = (allCourses ?? []).filter((c) => !profile.department || c.department === profile.department);

  const chatRows = (chats ?? []) as { id: string; course_id: string; title: string; updated_at: string }[];
  const list: DashboardCourse[] = (courses ?? [])
    .map((c) => {
      const mine = chatRows.filter((ch) => ch.course_id === c.id); // newest first
      return {
        id: c.id as string,
        code: c.code as string,
        title: c.title as string,
        department: c.department as string,
        sortOrder: c.sort_order as number,
        materials: (c.materials as unknown as { count: number }[])[0]?.count ?? 0,
        chats: mine.length,
        lastStudiedAt: mine[0]?.updated_at ?? null,
        lastStudied: mine[0] ? day.format(new Date(mine[0].updated_at)) : null,
      };
    })
    .filter((c) => c.materials > 0); // a course with no material yet has nothing to study

  const last = chatRows[0];
  const lastCourse = last ? list.find((c) => c.id === last.course_id) : undefined;

  return (
    <Dashboard
      courses={list}
      user={{ email: user.email ?? "", displayName: profile.display_name ?? null }}
      resume={last && lastCourse ? { href: `/study/${lastCourse.code}?chat=${last.id}`, label: last.title || lastCourse.title } : null}
    />
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded />
    </Suspense>
  );
}
