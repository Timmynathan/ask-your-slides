import { NextResponse } from "next/server";
import { z } from "zod";
import { shownCode } from "@/lib/study/course-code";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Extra courses (owner, 18 Nov 2026): a student retaking or adding a course enrols in it, and it
// joins My courses. Only courses of the student's own programme, at another level, with something to
// study. Students can't insert enrolments themselves (migration 20261118000001): this route checks,
// then writes with the service role. Once enrolled, the database (my_course_ids) opens the course.
//
//   GET                      → { level, courses: [{ id, code, title, level, enrolled }] }
//   POST   { course: uuid }  → enrol
//   DELETE { course: uuid }  → remove (chats are kept, and come back on re-enrolling)

const Body = z.object({ course: z.string().uuid() }).strict();

type CourseRow = { id: string; code: string; code_confirmed: boolean | null; title: string; level: number; sort_order: number; materials: { count: number }[] };

async function student() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase.from("profiles").select("institution, programme, level").eq("id", auth.user.id).single();
  if (!profile?.programme || !profile.level) return null;
  return { id: auth.user.id, institution: profile.institution as string, programme: profile.programme as string, level: profile.level as number };
}

/** Courses of the student's programme at other levels that have materials. */
async function offered(db: ReturnType<typeof adminClient>, s: { institution: string; programme: string; level: number }) {
  const { data, error } = await db
    .from("courses")
    .select("id, code, code_confirmed, title, level, sort_order, materials(count)")
    .eq("institution", s.institution)
    .eq("programme", s.programme)
    .neq("level", s.level);
  if (error) throw error;
  return ((data ?? []) as CourseRow[]).filter((c) => (c.materials[0]?.count ?? 0) > 0);
}

export async function GET() {
  const s = await student();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const db = adminClient();
  try {
    const [courses, { data: mine, error }] = await Promise.all([offered(db, s), db.from("course_enrollments").select("course_id").eq("user_id", s.id)]);
    if (error) throw error;
    const enrolled = new Set((mine ?? []).map((r) => r.course_id as string));
    const list = courses
      .sort((a, b) => b.level - a.level || a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, code: shownCode(c), title: c.title, level: c.level, enrolled: enrolled.has(c.id) }));
    return NextResponse.json({ level: s.level, courses: list });
  } catch {
    return NextResponse.json({ error: "Couldn't load the courses. Try again." }, { status: 500 });
  }
}

async function change(request: Request, enrol: boolean) {
  const s = await student();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Which course?" }, { status: 400 });
  const course = parsed.data.course;
  const db = adminClient();
  if (enrol) {
    let ok = false;
    try {
      ok = (await offered(db, s)).some((c) => c.id === course);
    } catch {
      return NextResponse.json({ error: "Couldn't add the course. Try again." }, { status: 500 });
    }
    if (!ok) return NextResponse.json({ error: "You can only add courses from your own programme." }, { status: 400 });
    const { error } = await db.from("course_enrollments").upsert({ user_id: s.id, course_id: course }, { onConflict: "user_id,course_id", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: "Couldn't add the course. Try again." }, { status: 500 });
  } else {
    const { error } = await db.from("course_enrollments").delete().eq("user_id", s.id).eq("course_id", course);
    if (error) return NextResponse.json({ error: "Couldn't remove the course. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const POST = (request: Request) => change(request, true);
export const DELETE = (request: Request) => change(request, false);
