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

  const courses = await myCourses(supabase, profile.level);
  const ids = courses.map((c) => c.id);
  const [{ data: papers }, questionLists, state] = await Promise.all([
    supabase.from("past_papers").select("id, course_id, session").in("course_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    Promise.all(ids.map((id) => supabase.from("past_questions").select("id, parent_id, paper_id").eq("course_id", id).range(0, 4999))),
    planState(adminClient(), user.id, new Date()),
  ]);
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
