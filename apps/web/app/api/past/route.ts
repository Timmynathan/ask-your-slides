import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// GET /api/past?course=<uuid> → one course's past papers and questions, without answers (PRD F10).
// Read as the student: RLS returns only reviewed papers, and the answer columns are not granted.

const Query = z.object({ course: z.string().uuid() });

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Which course?" }, { status: 400 });
  const course = parsed.data.course;

  const [papers, questions, attempts] = await Promise.all([
    supabase.from("past_papers").select("id, session, type, code_on_paper, instructions, duration, total_marks").eq("course_id", course),
    supabase
      .from("past_questions")
      .select("id, paper_id, origin, number, parent_id, section, text, marks, type, options, relevance, repeat_group, sort_order")
      .eq("course_id", course)
      .order("sort_order"),
    supabase.from("practice_attempts").select("question_id, score, max_score, revealed_only, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  const failed = papers.error ?? questions.error ?? attempts.error;
  if (failed) return NextResponse.json({ error: "Couldn't load past questions." }, { status: 500 });

  const ids = (questions.data ?? []).map((q) => q.id);
  const topics = ids.length ? await supabase.from("question_topics").select("question_id, topic_id").in("question_id", ids) : { data: [], error: null };
  if (topics.error) return NextResponse.json({ error: "Couldn't load past questions." }, { status: 500 });

  // Latest attempt per question of this course, for the ✓ marks in practice.
  const mine = new Set(ids);
  const latest: Record<string, { score: number | null; max: number | null; revealed: boolean }> = {};
  for (const a of attempts.data ?? []) {
    if (mine.has(a.question_id) && !latest[a.question_id]) {
      latest[a.question_id] = { score: a.score, max: a.max_score, revealed: a.revealed_only };
    }
  }

  return NextResponse.json({
    papers: papers.data,
    questions: (questions.data ?? []).map((q) => ({ ...q, marks: q.marks == null ? null : Number(q.marks) })),
    questionTopics: topics.data,
    attempts: latest,
  });
}
