import "server-only";
import type { adminClient } from "@/lib/supabase/admin";

/** A course for test emails and previews: the one asked for, else the first course with past questions. */
export async function sampleCourse(db: ReturnType<typeof adminClient>, courseId?: string) {
  if (courseId) {
    const { data } = await db.from("courses").select("code, programme, title").eq("id", courseId).maybeSingle();
    if (data) return data as { code: string; programme: string; title: string };
  }
  const { data } = await db.from("past_papers").select("courses!inner(code, programme, title)").limit(1).maybeSingle();
  const c = (data as { courses?: { code: string; programme: string; title: string } } | null)?.courses;
  if (c) return c;
  const { data: any } = await db.from("courses").select("code, programme, title").limit(1).single();
  return any as { code: string; programme: string; title: string };
}
