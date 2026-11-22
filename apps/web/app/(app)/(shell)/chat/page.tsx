import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookOpen, Brain, CalendarCheck, FileText, Lightbulb, Network, type LucideIcon } from "lucide-react";
import { ContentSkeleton } from "@/components/nav/content-skeleton";
import { AskBox } from "@/components/dashboard/ask-box";
import { askHref } from "@/lib/study/course-link";
import { AskGreeting } from "@/components/chat/ask-greeting";
import { Mascot } from "@/components/mascot/mascot";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId, PARTNERS } from "@/lib/partners";
import { planState } from "@/lib/plans/entitlement";
import { adminClient } from "@/lib/supabase/admin";
import { myCourses } from "@/lib/study/my-courses";

export const metadata: Metadata = { title: "Ask anything · Ask Your Slides" };

type Chip = { label: string; href: string; icon: LucideIcon };

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
  const name = (c: { shownCode: string | null; title: string }) => c.shownCode ?? c.title;
  const firstCourse = lectures[0]?.course ?? courses[0];
  const otherCourse = courses.find((c) => c.id !== firstCourse?.id);
  const chips: Chip[] = [];
  if (lectures[0]) chips.push({ label: `Explain "${lectures[0].title}" simply`, href: askHref(lectures[0].course.href, `Explain "${lectures[0].title}" simply, like I missed the class.`), icon: Brain });
  if (firstCourse) chips.push({ label: `How do the topics in ${name(firstCourse)} connect?`, href: askHref(firstCourse.href, "How do the topics in this course connect?"), icon: Network });
  if (firstCourse) chips.push({ label: `Make me a study plan for ${name(firstCourse)}`, href: askHref(firstCourse.href, "Make me a study plan for this course before my exam."), icon: CalendarCheck });
  // Quiz mode is Finals only: Free students don't get a chip that would only open the Finals sheet.
  if (state.plan !== "free" && lectures[0]) chips.push({ label: `Quiz me on "${lectures[0].title}"`, href: askHref(lectures[0].course.href, `Quiz me on "${lectures[0].title}".`), icon: Lightbulb });
  if (lectures[1]) chips.push({ label: `What are the key points of "${lectures[1].title}"?`, href: askHref(lectures[1].course.href, `What are the key points of "${lectures[1].title}"?`), icon: FileText });
  if (otherCourse) chips.push({ label: `What is ${name(otherCourse)} about?`, href: askHref(otherCourse.href, "What is this course about?"), icon: BookOpen });

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-3xl flex-col justify-center px-4 pb-16 pt-10 sm:px-6">
      <div className="flex flex-col items-center">
        <Mascot partner={profile.study_partner} size={80} mood="happy" animated={false} />
        <AskGreeting partnerName={PARTNERS[profile.study_partner].name} />
      </div>
      <div className="mx-auto mt-6 w-full max-w-2xl">
        <AskBox courses={courses.map((c) => ({ code: c.code, shownCode: c.shownCode, title: c.title, href: c.href }))} />
      </div>
      {chips.length > 0 && (
        <ul className="mx-auto flex max-w-2xl flex-wrap justify-center gap-2" aria-label="Questions to start with">
          {chips.map((c) => (
            <li key={c.label}>
              <Link href={c.href} className="inline-flex max-w-[22rem] items-center gap-2 rounded-full bg-sunken/70 py-2 pl-3 pr-4 text-[14px] text-ink transition hover:bg-sunken active:scale-95">
                <c.icon size={16} absoluteStrokeWidth strokeWidth={1.5} className="shrink-0 text-brand" aria-hidden />
                <span className="truncate">{c.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Loaded />
    </Suspense>
  );
}
