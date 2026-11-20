import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Dashboard, type DashboardCourse } from "@/components/dashboard/dashboard";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";
import { countMain, LIMITED_MAIN_MATERIALS, shownCode } from "@/lib/study/course-code";
import { courseHref } from "@/lib/study/course-link";
import { planState } from "@/lib/plans/entitlement";
import { FinalsWelcome } from "@/components/plans/finals-welcome";
import { FINALS_DAILY } from "@/lib/plans/config";
import { lagosDay, limitsFor } from "@/lib/plans/limits";
import { adminClient } from "@/lib/supabase/admin";
import { programmeChoices, sidebarTitle } from "@/lib/programmes";

export const metadata: Metadata = { title: "My courses · Ask Your Slides" };

// Dates are formatted here, in Lagos time, so server and browser render the same text.
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

async function Loaded() {
  const { supabase, user } = await requireUser();
  const [{ data: allCourses }, { data: profile, error: profileError }, { data: chats }, { data: enrolments }, { data: removals }] = await Promise.all([
    supabase.from("courses").select("id, code, code_confirmed, programme, level, title, department, sort_order, elective, premium, materials(kind)").order("sort_order"),
    supabase.from("profiles").select("display_name, onboarded, study_partner, programme, level").eq("id", user.id).single(),
    supabase.from("conversations").select("id, course_id, title, updated_at").order("updated_at", { ascending: false }).limit(500),
    // Extra courses the student added (retakes, extras). Missing before the migration: then none.
    supabase.from("course_enrollments").select("course_id"),
    // Own-level courses the student removed (carryovers). Missing before the migration: then none.
    supabase.from("course_removals").select("course_id"),
  ]);
  const removed = new Set(((removals ?? []) as { course_id: string }[]).map((r) => r.course_id));
  const added = new Set(((enrolments ?? []) as { course_id: string }[]).map((r) => r.course_id));
  // A failed read is an error, not "new student": never bounce an onboarded student back to Welcome.
  if (profileError) throw new Error(`Couldn't load your profile: ${profileError.message}`);
  if (!profile?.onboarded || !isPartnerId(profile.study_partner) || !profile.programme) redirect("/welcome");
  // RLS returns only the student's programme + level's courses (PRD F11), plus the courses they added.
  const courses = allCourses ?? [];

  // PRD F12: free questions left today on premium courses (Free students only).
  const db = adminClient();
  const now = new Date();
  const state = await planState(db, user.id, now);
  const today = lagosDay(now);
  const [{ data: daily }, { data: perCourse }] = await Promise.all([
    db.from("usage_daily").select("message_count").eq("user_id", user.id).eq("day", today).maybeSingle(),
    db.from("usage_course_daily").select("course_id, message_count").eq("user_id", user.id).eq("day", today),
  ]);
  const usedToday = (daily as { message_count: number } | null)?.message_count ?? 0;
  const usedIn = new Map(((perCourse ?? []) as { course_id: string; message_count: number }[]).map((r) => [r.course_id, r.message_count]));
  const premiumLeft = (courseId: string, premium: boolean): number | null => {
    const l = limitsFor(state.plan, { createdAt: state.createdAt, now, premium });
    if (l.course === null) return null;
    return Math.max(0, Math.min(l.daily - usedToday, l.course - (usedIn.get(courseId) ?? 0)));
  };

  const chatRows = (chats ?? []) as { id: string; course_id: string; title: string; updated_at: string }[];
  const list: DashboardCourse[] = (courses ?? [])
    .map((c) => {
      const mine = chatRows.filter((ch) => ch.course_id === c.id); // newest first
      // An added course from another level: tagged with its level, listed after the student's own.
      const extraLevel = added.has(c.id as string) && c.level !== profile.level ? (c.level as number) : null;
      return {
        id: c.id as string,
        code: c.code as string,
        href: courseHref(c as { code: string; programme: string }, (allCourses ?? []) as { code: string; programme: string }[]),
        title: c.title as string,
        department: c.department as string,
        elective: !!c.elective,
        sortOrder: (c.sort_order as number) + (extraLevel === null ? 0 : 1_000_000 + (900 - extraLevel) * 1000),
        extraLevel,
        shownCode: shownCode(c as { code: string; code_confirmed: boolean }),
        materials: (c.materials as { kind: string }[]).length,
        limited: countMain(c.materials as { kind: string }[]) < LIMITED_MAIN_MATERIALS,
        premiumLeft: premiumLeft(c.id as string, !!c.premium),
        chats: mine.length,
        lastStudiedAt: mine[0]?.updated_at ?? null,
        lastStudied: mine[0] ? day.format(new Date(mine[0].updated_at)) : null,
      };
    })
    .filter((c) => c.materials > 0) // a course with no material yet has nothing to study
    .filter((c) => c.extraLevel !== null || !removed.has(c.id)); // removed from My courses

  // Sidebar: the student's own uploads (missing before the uploads migration: then none).
  const { data: uploadRows } = await supabase.from("user_uploads").select("id, title, status, pages, course_id").order("created_at", { ascending: false }).limit(30);
  const files = ((uploadRows ?? []) as { id: string; title: string; status: "uploading" | "reading" | "ready" | "failed"; pages: number; course_id: string }[]).map((u) => {
    const c = list.find((x) => x.id === u.course_id);
    return { id: u.id, title: u.title, status: u.status, pages: u.pages, course: c ? c.shownCode ?? c.title : "" };
  });
  const last = chatRows[0];
  // Sidebar: the latest chats, each opening in its course (courses the student no longer takes are skipped).
  const recent = chatRows
    .map((ch) => ({ ch, course: list.find((c) => c.id === ch.course_id) }))
    .filter((r) => r.course)
    .slice(0, 6)
    .map(({ ch, course }) => ({ id: ch.id, title: ch.title || "New chat", href: `${course!.href}${course!.href.includes("?") ? "&" : "?"}chat=${ch.id}` }));
  const lastCourse = last ? list.find((c) => c.id === last.course_id) : undefined;

  return (
    <>
      <Dashboard
        courses={list}
        partner={profile.study_partner}
        onFinals={state.plan !== "free"}
        recent={recent}
        files={files}
        programmeTitle={sidebarTitle(await programmeChoices(supabase), profile.programme)}
        user={{ id: user.id, email: user.email ?? "", displayName: profile.display_name ?? null }}
        resume={last && lastCourse ? { href: `${lastCourse.href}${lastCourse.href.includes("?") ? "&" : "?"}chat=${last.id}`, label: last.title || lastCourse.title } : null}
      />
      {state.welcome && <FinalsWelcome id={state.welcome.id} endsAt={state.welcome.endsAt} daily={FINALS_DAILY} trial={state.welcome.trial} />}
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded />
    </Suspense>
  );
}
