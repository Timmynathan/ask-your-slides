import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PastQuestionsView, type PastCourseRow } from "@/components/past/past-questions-view";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";
import { PAST_QUESTIONS_LIVE } from "@/lib/past/feature";
import { planState } from "@/lib/plans/entitlement";
import { FREE_PAST_PROGRAMMES } from "@/lib/plans/config";
import { adminClient } from "@/lib/supabase/admin";
import { myCourses } from "@/lib/study/my-courses";
import { programmeChoices, sidebarTitle } from "@/lib/programmes";

export const metadata: Metadata = { title: "Past questions · Ask Your Slides" };

// Past questions for every course the student takes, on one page (owner, 20 Nov 2026): how many
// papers each course has and from which years, a button straight into that course's past questions,
// and a clear "No past papers yet" for the rest. Access follows PRD F12: Finals, or a programme in
// FREE_PAST_PROGRAMMES; others see an Upgrade link. Counts are those the course page shows: questions
// without parts, on papers students can see (RLS).
async function Loaded() {
  const { supabase, user } = await requireUser();
  const { data: profile, error } = await supabase.from("profiles").select("display_name, onboarded, study_partner, programme, level").eq("id", user.id).single();
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  if (!profile?.onboarded || !isPartnerId(profile.study_partner) || !profile.programme) redirect("/welcome");
  if (!PAST_QUESTIONS_LIVE) notFound();

  const [courses, choices] = await Promise.all([myCourses(supabase, profile.level), programmeChoices(supabase)]);
  const ids = courses.map((c) => c.id);
  const [{ data: papers }, questionLists, state, { data: chats }, { data: uploadRows }] = await Promise.all([
    supabase.from("past_papers").select("id, course_id, session").in("course_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    Promise.all(ids.map((id) => supabase.from("past_questions").select("id, parent_id, paper_id").eq("course_id", id).range(0, 4999))),
    planState(adminClient(), user.id, new Date()),
    supabase.from("conversations").select("id, title, course_id").order("updated_at", { ascending: false }).limit(20),
    supabase.from("user_uploads").select("id, title, status, pages, course_id").order("created_at", { ascending: false }).limit(30),
  ]);
  const files = ((uploadRows ?? []) as { id: string; title: string; status: "uploading" | "reading" | "ready" | "failed"; pages: number; course_id: string }[]).map((u) => {
    const c = courses.find((x) => x.id === u.course_id);
    return { id: u.id, title: u.title, status: u.status, pages: u.pages, course: c ? c.shownCode ?? c.title : "" };
  });
  const recent = ((chats ?? []) as { id: string; title: string; course_id: string }[])
    .map((ch) => ({ ch, course: courses.find((c) => c.id === ch.course_id) }))
    .filter((r) => r.course)
    .slice(0, 6)
    .map(({ ch, course }) => ({ id: ch.id, title: ch.title || "New chat", href: `${course!.href}${course!.href.includes("?") ? "&" : "?"}chat=${ch.id}` }));
  const paperRows = (papers ?? []) as { id: string; course_id: string; session: string }[];

  const rows: PastCourseRow[] = courses.map((c, i) => {
    const qs = (questionLists[i].data ?? []) as { id: string; parent_id: string | null; paper_id: string | null }[];
    const parents = new Set(qs.map((q) => q.parent_id).filter(Boolean));
    const leaves = qs.filter((q) => !parents.has(q.id));
    const withQuestions = new Set(leaves.map((q) => q.paper_id).filter(Boolean) as string[]);
    const mine = paperRows.filter((p) => p.course_id === c.id && withQuestions.has(p.id));
    const years = mine.map((p) => p.session.slice(0, 4)).sort();
    return {
      id: c.id,
      title: c.title,
      shownCode: c.shownCode,
      pastHref: c.pastHref,
      papers: mine.length,
      questions: leaves.length,
      years: years.length ? (years[0] === years[years.length - 1] ? years[0] : `${years[0]}–${years[years.length - 1]}`) : null,
      open: state.plan === "finals" || FREE_PAST_PROGRAMMES.includes(c.programme),
    };
  });

  return (
    <PastQuestionsView
      title={sidebarTitle(choices, profile.programme)}
      recent={recent}
      files={files}
      rows={rows}
      courses={courses.map((c) => ({ id: c.id, title: c.title, href: c.href }))}
      user={{ email: user.email ?? "", displayName: profile.display_name ?? null }}
    />
  );
}

export default function PastQuestionsPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded />
    </Suspense>
  );
}
