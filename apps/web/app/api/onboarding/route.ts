import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { myCourses } from "@/lib/study/my-courses";

/**
 * GET /api/onboarding → what the last onboarding pages show (owner, 27 Nov 2026): the student's courses
 * (as the dashboard lists them), how many lecture slides and topics they have, and the first course's
 * first topics for "your study path". Runs as the student, so RLS limits it to their courses.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("level").eq("id", auth.user.id).single();
  const courses = await myCourses(supabase, profile?.level ?? null);
  const ids = courses.map((c) => c.id);
  if (!ids.length) return NextResponse.json({ courses: [], slides: 0, topics: 0, path: null });

  const [{ count: slides }, { data: topicRows }] = await Promise.all([
    supabase.from("slides").select("id", { count: "exact", head: true }).in("course_id", ids),
    supabase.from("topics").select("course_id, topic_order, title").in("course_id", ids).order("topic_order"),
  ]);
  const topics = (topicRows ?? []) as { course_id: string; topic_order: number; title: string }[];
  const first = courses.find((c) => topics.some((t) => t.course_id === c.id)) ?? null;
  const path = first
    ? {
        course: { title: first.title, code: first.shownCode, href: first.href },
        topics: topics
          .filter((t) => t.course_id === first.id)
          .slice(0, 4)
          .map((t) => ({ title: t.title, href: `${first.href}${first.href.includes("?") ? "&" : "?"}topic=${t.topic_order}` })),
      }
    : null;
  return NextResponse.json({
    courses: courses.map((c) => ({ title: c.title, code: c.shownCode })),
    slides: slides ?? 0,
    topics: topics.length,
    path,
  });
}
