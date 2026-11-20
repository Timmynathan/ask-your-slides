import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shownCode } from "@/lib/study/course-code";
import { courseHref } from "@/lib/study/course-link";

// The courses a student studies, as the dashboard lists them (PRD F11): RLS returns their programme +
// level's courses plus any they added; courses they removed and courses with no material yet are left
// out. Used by the pages that share the sidebar (/past-questions, /chat). The dashboard builds its own,
// richer list from the same rules.
export interface MyCourse {
  id: string;
  code: string;
  title: string;
  shownCode: string | null;
  href: string;
  /** The course page opened on its past questions. */
  pastHref: string;
  programme: string;
  premium: boolean;
}

export async function myCourses(supabase: SupabaseClient, level: number | null): Promise<MyCourse[]> {
  const [{ data: courses }, { data: enrolments }, { data: removals }] = await Promise.all([
    supabase.from("courses").select("id, code, code_confirmed, programme, level, title, sort_order, premium, materials(kind)").order("sort_order"),
    supabase.from("course_enrollments").select("course_id"),
    supabase.from("course_removals").select("course_id"),
  ]);
  const all = (courses ?? []) as { id: string; code: string; code_confirmed: boolean; programme: string; level: number; title: string; sort_order: number; premium: boolean; materials: { kind: string }[] }[];
  const added = new Set(((enrolments ?? []) as { course_id: string }[]).map((r) => r.course_id));
  const removed = new Set(((removals ?? []) as { course_id: string }[]).map((r) => r.course_id));
  return all
    .filter((c) => c.materials.length > 0)
    .filter((c) => (added.has(c.id) && c.level !== level) || !removed.has(c.id))
    .map((c) => ({ c, extra: added.has(c.id) && c.level !== level }))
    .sort((a, b) => Number(a.extra) - Number(b.extra) || a.c.sort_order - b.c.sort_order)
    .map(({ c }) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      shownCode: shownCode(c),
      href: courseHref(c, all),
      pastHref: courseHref(c, all, { past: "1" }),
      programme: c.programme,
      premium: !!c.premium,
    }));
}
