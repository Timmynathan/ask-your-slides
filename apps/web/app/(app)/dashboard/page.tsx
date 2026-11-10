import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Dashboard, type DashboardCourse } from "@/components/dashboard/dashboard";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";
import { courseHref } from "@/lib/study/course-link";

export const metadata: Metadata = { title: "My courses · Ask Your Slides" };

// Dates are formatted here, in Lagos time, so server and browser render the same text.
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

async function Loaded() {
  const { supabase, user } = await requireUser();
  const [{ data: allCourses }, { data: profile, error: profileError }, { data: chats }] = await Promise.all([
    supabase.from("courses").select("id, code, programme, title, department, sort_order, elective, materials(count)").order("sort_order"),
    supabase.from("profiles").select("display_name, onboarded, study_partner, programme").eq("id", user.id).single(),
    supabase.from("conversations").select("id, course_id, title, updated_at").order("updated_at", { ascending: false }).limit(500),
  ]);
  // A failed read is an error, not "new student": never bounce an onboarded student back to Welcome.
  if (profileError) throw new Error(`Couldn't load your profile: ${profileError.message}`);
  if (!profile?.onboarded || !isPartnerId(profile.study_partner) || !profile.programme) redirect("/welcome");
  // RLS returns only the student's programme + level's courses (PRD F11): no filtering here.
  const courses = allCourses ?? [];

  const chatRows = (chats ?? []) as { id: string; course_id: string; title: string; updated_at: string }[];
  const list: DashboardCourse[] = (courses ?? [])
    .map((c) => {
      const mine = chatRows.filter((ch) => ch.course_id === c.id); // newest first
      return {
        id: c.id as string,
        code: c.code as string,
        href: courseHref(c as { code: string; programme: string }, (allCourses ?? []) as { code: string; programme: string }[]),
        title: c.title as string,
        department: c.department as string,
        elective: !!c.elective,
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
      resume={last && lastCourse ? { href: `${lastCourse.href}${lastCourse.href.includes("?") ? "&" : "?"}chat=${last.id}`, label: last.title || lastCourse.title } : null}
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
