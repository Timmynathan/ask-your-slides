import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { myCourses } from "@/lib/study/my-courses";

/**
 * GET /api/onboarding → what the last onboarding pages show (owner, 27 Nov 2026): the student's courses
 * (as the dashboard lists them) and how many lecture slides and topics they have, for "Let's start
 * learning!". Runs as the student, so RLS limits it to their courses.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("level").eq("id", auth.user.id).single();
  const courses = await myCourses(supabase, profile?.level ?? null);
  const ids = courses.map((c) => c.id);
  if (!ids.length) return NextResponse.json({ courses: [], slides: 0, topics: 0 });

  const [{ count: slides }, { count: topics }] = await Promise.all([
    supabase.from("slides").select("id", { count: "exact", head: true }).in("course_id", ids),
    supabase.from("topics").select("id", { count: "exact", head: true }).in("course_id", ids),
  ]);
  return NextResponse.json({
    courses: courses.map((c) => ({ title: c.title, code: c.shownCode })),
    slides: slides ?? 0,
    topics: topics ?? 0,
  });
}
