// Past questions on Free vs Finals (PRD F12): Free gets the exam map and FREE_PRACTICE_PER_COURSE
// practice question(s) per course (the first one(s) they open; they can redo them). Finals gets every
// question, model answers and marked practice. Enforced here, on the server; the UI only mirrors it.
import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/admin";
import { FREE_PRACTICE_PER_COURSE, type PlanId } from "@/lib/plans/config";

type Db = ReturnType<typeof adminClient>;

export interface PastAccess {
  plan: PlanId;
  /** Free: the question(s) already used as the free practice in this course. */
  freeQuestions: string[];
  /** Free: how many free practice questions this course allows. */
  freeLimit: number;
}

/** The questions a student has practised (or revealed) in a course, oldest first. */
export async function practisedQuestions(db: Db, userId: string, courseId: string): Promise<string[]> {
  const rows = must(
    await db
      .from("practice_attempts")
      .select("question_id, created_at, past_questions!inner(course_id)")
      .eq("user_id", userId)
      .eq("past_questions.course_id", courseId)
      .order("created_at", { ascending: true })
      .limit(500),
  ) as { question_id: string }[];
  return [...new Set(rows.map((r) => r.question_id))];
}

export async function pastAccess(db: Db, userId: string, courseId: string, plan: PlanId): Promise<PastAccess> {
  if (plan === "finals") return { plan, freeQuestions: [], freeLimit: FREE_PRACTICE_PER_COURSE };
  return { plan, freeQuestions: (await practisedQuestions(db, userId, courseId)).slice(0, FREE_PRACTICE_PER_COURSE), freeLimit: FREE_PRACTICE_PER_COURSE };
}

/** May this student practise this question? Finals: always. Free: their free question(s), or a new
 *  one while the course's free allowance isn't used up. */
export function canPractise(access: PastAccess, questionId: string): boolean {
  return access.plan === "finals" || access.freeQuestions.includes(questionId) || access.freeQuestions.length < access.freeLimit;
}
