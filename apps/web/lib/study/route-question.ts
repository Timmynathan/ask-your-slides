import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedQuery } from "@/lib/agent/embed";
import { matchSlides, type SlideHit } from "@/lib/agent/retrieval";
import { adminClient } from "@/lib/supabase/admin";
import { decide, hasNoSubject, type RouteChoice } from "@/lib/study/question-subject";
import { myCourses, type MyCourse } from "@/lib/study/my-courses";

// "Ask anything" on the dashboard (owner, 21 Nov 2026): which of the student's courses is a question
// about? The question is matched against each course's slides; the dashboard then opens the answer
// inside that course's whole-course chat (no separate general chat: every conversation lives in one
// course). When two courses fit about equally, the student picks.

/** How many slides to compare per course. */
const PER_COURSE = 3;


/** A course's fit: the average similarity of its best PER_COURSE slides. One slide that happens to
 *  share a phrase shouldn't outrank a course whose slides are about the topic (20 Nov 2026). */
export function courseFit(hits: Pick<SlideHit, "similarity">[]): number {
  const top = hits.map((h) => h.similarity ?? 0).sort((a, b) => b - a).slice(0, PER_COURSE);
  return top.length ? top.reduce((a, b) => a + b, 0) / PER_COURSE : 0;
}


/** The student's courses ranked for the question (best first, at most 3), and whether the first is a clear winner. */
export async function routeQuestion(supabase: SupabaseClient, level: number | null, question: string): Promise<{ choices: RouteChoice[]; clear: boolean; several?: boolean }> {
  const courses = await myCourses(supabase, level);
  const label = (c: MyCourse) => (c.shownCode ? `${c.shownCode} · ${c.title}` : c.title);
  if (courses.length <= 1) return { choices: courses.map((c) => ({ id: c.id, label: label(c), href: c.href, fit: 1 })), clear: true };
  // Nothing to match on: every course, for the student to pick.
  if (hasNoSubject(question)) return { choices: courses.map((c) => ({ id: c.id, label: label(c), href: c.href, fit: 0 })), clear: false };
  const embedding = await embedQuery(question);
  const db = adminClient();
  const fits = await Promise.all(courses.map(async (c) => courseFit(await matchSlides(db, { courseId: c.id, embedding, query: question, k: PER_COURSE }).catch(() => []))));
  const ranked = courses.map((c, i) => ({ id: c.id, label: label(c), href: c.href, fit: fits[i] })).sort((a, b) => b.fit - a.fit);
  return decide(ranked);
}
