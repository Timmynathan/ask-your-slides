import "server-only";
import { cacheLife } from "next/cache";
import { displayCode } from "@/lib/study/course-code";
import { adminClient } from "@/lib/supabase/admin";

// What's on offer, read from the database instead of written into the copy: departments, courses
// and slide counts change as content is ingested (more departments are planned).
export interface Catalog {
  departments: string[];
  courseCodes: string[];
  courseCount: number;
  /** Distinct courses (one course filed under several programmes counts once). */
  distinctCourseCount: number;
  slideCount: number;
  /** Everyone who has signed up (the landing page's live stat). */
  studentCount: number;
  /** Past questions on papers students can see. */
  pastQuestionCount: number;
}

export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheLife("hours");
  const db = adminClient();
  const [{ data: courses }, { count }, { count: students }, { count: pastQuestions }] = await Promise.all([
    db.from("courses").select("code, code_confirmed, department").order("sort_order"),
    db.from("slides").select("*", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("past_questions").select("id, past_papers!inner(status)", { count: "exact", head: true }).eq("past_papers.status", "ok"),
  ]);
  const rows = (courses ?? []) as { code: string; code_confirmed: boolean; department: string }[];
  return {
    departments: [...new Set(rows.map((c) => c.department))],
    // A code can repeat across programmes; placeholder codes (IOH-ETHICS) are never shown.
    courseCodes: [...new Set(rows.filter((c) => c.code_confirmed !== false).map((c) => c.code))],
    courseCount: rows.length,
    distinctCourseCount: new Set(rows.map((c) => c.code)).size,
    slideCount: count ?? 0,
    studentCount: students ?? 0,
    pastQuestionCount: pastQuestions ?? 0,
  };
}

/** "Computer Science" · "Computer Science and Accounting" · "Computer Science, Accounting and Law". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** 1504 → "1,500+"; 87 → "87". */
export function roughCount(n: number): string {
  if (n < 100) return String(n);
  const step = n < 1000 ? 50 : 100;
  return `${(Math.floor(n / step) * step).toLocaleString("en-US")}+`;
}

/** "CSC402" → "CSC 402". */
export function spacedCode(code: string): string {
  return displayCode(code);
}
