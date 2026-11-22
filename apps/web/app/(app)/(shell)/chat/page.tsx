import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ContentSkeleton } from "@/components/nav/content-skeleton";
import { askHref } from "@/lib/study/course-link";
import { AskView, type AskChip } from "@/components/chat/ask-view";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";
import { planState } from "@/lib/plans/entitlement";
import { adminClient } from "@/lib/supabase/admin";
import { myCourses } from "@/lib/study/my-courses";

export const metadata: Metadata = { title: "Ask anything · Ask Your Slides" };

// "Ask anything" (owner, 22 Nov 2026), from the chat icon in the sidebar: one box for a question when
// the student isn't sure which course it belongs to. It is a doorway, not a second chat: the question
// is matched to the right course and opens in that course's chat (components/dashboard/ask-box.tsx),
// so every conversation still lives in exactly one course. Typing a course's code or name opens it.
// Under it, ready-made questions (like tags) built from the student's own recent lectures and courses,
// so each one knows which course to open.
async function Loaded() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("display_name, onboarded, study_partner, level").eq("id", user.id).single();
  if (!profile?.onboarded || !isPartnerId(profile.study_partner)) redirect("/welcome");
  const [courses, { data: visits }, state] = await Promise.all([
    myCourses(supabase, profile.level ?? null),
    supabase.from("topic_visits").select("topic_id, visited_at, topics(title, course_id)").order("visited_at", { ascending: false }).limit(6),
    planState(adminClient(), user.id, new Date()),
  ]);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const lectures = ((visits ?? []) as unknown as { topics: { title: string; course_id: string } | null }[])
    .flatMap((v) => (v.topics && byId.has(v.topics.course_id) ? [{ title: v.topics.title, course: byId.get(v.topics.course_id)! }] : []))
    .slice(0, 2);
  // Five at most, each a few words (owner, 22 Nov 2026); the full question goes to the course.
  const firstCourse = lectures[0]?.course ?? courses[0];
  const otherCourse = courses.find((c) => c.id !== firstCourse?.id);
  const chips: AskChip[] = [];
  if (lectures[0]) chips.push({ label: "Explain my last lecture", href: askHref(lectures[0].course.href, `Explain "${lectures[0].title}" simply, like I missed the class.`), icon: "brain" });
  if (firstCourse) chips.push({ label: "How do topics connect?", href: askHref(firstCourse.href, "How do the topics in this course connect?"), icon: "network" });
  if (firstCourse) chips.push({ label: "Make a study plan", href: askHref(firstCourse.href, "Make me a study plan for this course before my exam."), icon: "plan" });
  // Quiz mode is Finals only: Free students don't get a chip that would only open the Finals sheet.
  if (state.plan !== "free" && lectures[0]) chips.push({ label: "Quiz me", href: askHref(lectures[0].course.href, `Quiz me on "${lectures[0].title}".`), icon: "quiz" });
  if (lectures[1]) chips.push({ label: "Key points to know", href: askHref(lectures[1].course.href, `What are the key points of "${lectures[1].title}"?`), icon: "points" });
  if (otherCourse) chips.push({ label: "What is this course about?", href: askHref(otherCourse.href, "What is this course about?"), icon: "about" });

  return (
    <AskView
      partner={profile.study_partner}
      account={user.id}
      chips={chips.slice(0, 5)}
      courses={courses.map((c) => ({ code: c.code, shownCode: c.shownCode, title: c.title, href: c.href }))}
    />
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Loaded />
    </Suspense>
  );
}
