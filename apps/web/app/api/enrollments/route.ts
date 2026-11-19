import { NextResponse } from "next/server";
import { z } from "zod";
import { shownCode } from "@/lib/study/course-code";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// My courses, edited by the student (owner, 18 and 19 Nov 2026): add a course from another level of
// their programme (retakes, extras), or remove any course, including one of their own level (a
// carryover student who doesn't take it). Only courses of the student's own programme with
// something to study. Students can't write these tables themselves (migrations 20261118000001,
// 20261119000001): this route checks, then writes with the service role.
//
//   own level     removing writes course_removals (hidden from My courses); adding deletes it
//   other level   adding writes course_enrollments (my_course_ids opens it); removing deletes it
//
//   GET                      → { level, courses: [{ id, code, title, level, enrolled }] }
//   POST   { course: uuid }  → add (or bring back)
//   DELETE { course: uuid }  → remove (chats are kept, and come back on adding it again)

const Body = z.object({ course: z.string().uuid() }).strict();

type CourseRow = { id: string; code: string; code_confirmed: boolean | null; title: string; level: number; sort_order: number; materials: { count: number }[] };
type Student = { id: string; institution: string; programme: string; level: number };

async function student(): Promise<Student | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase.from("profiles").select("institution, programme, level").eq("id", auth.user.id).single();
  if (!profile?.programme || !profile.level) return null;
  return { id: auth.user.id, institution: profile.institution as string, programme: profile.programme as string, level: profile.level as number };
}

/** Courses of the student's programme (every level) that have materials. */
async function offered(db: ReturnType<typeof adminClient>, s: Student) {
  const { data, error } = await db
    .from("courses")
    .select("id, code, code_confirmed, title, level, sort_order, materials(count)")
    .eq("institution", s.institution)
    .eq("programme", s.programme);
  if (error) throw error;
  return ((data ?? []) as CourseRow[]).filter((c) => (c.materials[0]?.count ?? 0) > 0);
}

/** Ids from a student-owned table. Before its migration has run, none. */
async function ids(db: ReturnType<typeof adminClient>, table: "course_enrollments" | "course_removals", userId: string) {
  const { data, error } = await db.from(table).select("course_id").eq("user_id", userId);
  if (error) {
    if (table === "course_removals") return new Set<string>();
    throw error;
  }
  return new Set((data ?? []).map((r) => r.course_id as string));
}

export async function GET() {
  const s = await student();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const db = adminClient();
  try {
    const [courses, added, removed] = await Promise.all([offered(db, s), ids(db, "course_enrollments", s.id), ids(db, "course_removals", s.id)]);
    const list = courses
      .sort((a, b) => b.level - a.level || a.sort_order - b.sort_order)
      .map((c) => ({
        id: c.id,
        code: shownCode(c),
        title: c.title,
        level: c.level,
        enrolled: c.level === s.level ? !removed.has(c.id) : added.has(c.id),
      }));
    return NextResponse.json({ level: s.level, courses: list });
  } catch {
    return NextResponse.json({ error: "Couldn't load the courses. Try again." }, { status: 500 });
  }
}

async function change(request: Request, add: boolean) {
  const s = await student();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Which course?" }, { status: 400 });
  const id = parsed.data.course;
  const db = adminClient();
  const failed = NextResponse.json({ error: add ? "Couldn't add the course. Try again." : "Couldn't remove the course. Try again." }, { status: 500 });

  let course: CourseRow | undefined;
  try {
    course = (await offered(db, s)).find((c) => c.id === id);
  } catch {
    return failed;
  }

  if (!course) {
    if (add) return NextResponse.json({ error: "You can only add courses from your own programme." }, { status: 400 });
    // Not in the programme (any more): just drop an old enrolment, if any.
    const { error } = await db.from("course_enrollments").delete().eq("user_id", s.id).eq("course_id", id);
    return error ? failed : NextResponse.json({ ok: true });
  }

  const row = { user_id: s.id, course_id: id };
  const opts = { onConflict: "user_id,course_id", ignoreDuplicates: true };
  const own = course.level === s.level;
  const { error } = own
    ? add
      ? await db.from("course_removals").delete().eq("user_id", s.id).eq("course_id", id)
      : await db.from("course_removals").upsert(row, opts)
    : add
      ? await db.from("course_enrollments").upsert(row, opts)
      : await db.from("course_enrollments").delete().eq("user_id", s.id).eq("course_id", id);
  return error ? failed : NextResponse.json({ ok: true });
}

export const POST = (request: Request) => change(request, true);
export const DELETE = (request: Request) => change(request, false);
