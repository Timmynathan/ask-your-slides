// Past questions (PRD F10): the Exam map and practice ordering. Pure functions, unit-tested.

import { displayCode } from "@/lib/study/format";

export type PaperType = "exam" | "test" | "quiz" | "project" | "assignment" | "other";
export type Relevance = "covered" | "partial" | "not_covered";

export interface PastPaper {
  id: string;
  session: string; // "2025/2026"
  type: PaperType;
  code_on_paper: string | null;
  instructions: string | null;
  duration: string | null;
  total_marks: number | null;
}

export interface PastQuestion {
  id: string;
  paper_id: string | null;
  origin: "past_paper" | "generated";
  number: string;
  parent_id: string | null;
  section: string | null;
  text: string;
  marks: number | null;
  type: string;
  options: { label: string; text: string }[] | null;
  relevance: Relevance | null;
  repeat_group: string | null;
  sort_order: number;
}

export interface QuestionTopic {
  question_id: string;
  topic_id: string;
}

export interface MapTopic {
  id: string;
  title: string;
}

export interface MapRow {
  topicId: string;
  title: string;
  /** Papers (exams and tests) with at least one question on this topic, newest first. */
  papers: string[];
  marks: number;
  types: string[];
  /** Practised questions on this topic, from every paper (projects included). */
  questionCount: number;
  /** "2023/24 exam Q2" for each question of a repeat group that spans 2+ papers. */
  repeats: string[];
}

export interface ExamMap {
  /** Exams and tests: what "asked in N of M papers" counts. Projects/assignments are practice only. */
  papers: PastPaper[];
  rows: MapRow[];
  /** Fewer than 2 counted papers: show "Few past papers for this course." instead of a map. */
  few: boolean;
}

const COUNTED: PaperType[] = ["exam", "test", "quiz"];
export const isCounted = (p: PastPaper) => COUNTED.includes(p.type);

/** Questions a student practises: those without parts. */
export function practised(questions: PastQuestion[]): PastQuestion[] {
  const parents = new Set(questions.map((q) => q.parent_id).filter(Boolean));
  return questions.filter((q) => !parents.has(q.id));
}

/** Marks of a practised question; parts with no printed marks share their parent's marks evenly. */
export function effectiveMarks(q: PastQuestion, byId: Map<string, PastQuestion>, all: PastQuestion[]): number {
  if (q.marks != null) return Number(q.marks);
  const parent = q.parent_id ? byId.get(q.parent_id) : undefined;
  if (!parent || parent.marks == null) return 0;
  const siblings = all.filter((s) => s.parent_id === parent.id);
  const marked = siblings.reduce((n, s) => n + (s.marks != null ? Number(s.marks) : 0), 0);
  const unmarked = siblings.filter((s) => s.marks == null).length;
  return unmarked ? Math.max(0, (Number(parent.marks) - marked) / unmarked) : 0;
}

/** "2025/2026" → "2025/26". */
export function shortSession(session: string): string {
  const [a, b] = session.split("/");
  return b ? `${a}/${b.slice(2)}` : session;
}

export function paperLabel(p: Pick<PastPaper, "session" | "type">): string {
  return `${shortSession(p.session)} ${p.type}`;
}

const normCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^PAU/, "");

/** "then CSC 403" when the paper was set under an older code (course.yaml aliases), else null. */
export function oldCode(p: Pick<PastPaper, "code_on_paper">, courseCode: string): string | null {
  if (!p.code_on_paper) return null;
  const seen = normCode(p.code_on_paper);
  return seen && seen !== normCode(courseCode) ? displayCode(seen) : null;
}

const newestFirst = (a: PastPaper, b: PastPaper) => b.session.localeCompare(a.session) || a.type.localeCompare(b.type);

export function buildExamMap(topics: MapTopic[], papers: PastPaper[], questions: PastQuestion[], qt: QuestionTopic[]): ExamMap {
  const counted = papers.filter(isCounted).sort(newestFirst);
  const countedIds = new Set(counted.map((p) => p.id));
  const paperById = new Map(papers.map((p) => [p.id, p]));
  const fromPapers = questions.filter((q) => q.origin === "past_paper");
  const byId = new Map(fromPapers.map((q) => [q.id, q]));
  const leaves = practised(fromPapers).filter((q) => q.paper_id && paperById.has(q.paper_id));
  const topicsOf = new Map<string, string[]>();
  for (const { question_id, topic_id } of qt) topicsOf.set(question_id, [...(topicsOf.get(question_id) ?? []), topic_id]);

  // Repeat groups that span 2+ papers.
  const groupPapers = new Map<string, Set<string>>();
  for (const q of leaves) {
    if (q.repeat_group && q.paper_id) groupPapers.set(q.repeat_group, (groupPapers.get(q.repeat_group) ?? new Set()).add(q.paper_id));
  }

  const rows: MapRow[] = topics.map((t) => {
    const mine = leaves.filter((q) => topicsOf.get(q.id)?.includes(t.id));
    const inCounted = mine.filter((q) => q.paper_id && countedIds.has(q.paper_id));
    const typeCount = new Map<string, number>();
    for (const q of inCounted) typeCount.set(q.type, (typeCount.get(q.type) ?? 0) + 1);
    return {
      topicId: t.id,
      title: t.title,
      papers: counted.filter((p) => inCounted.some((q) => q.paper_id === p.id)).map((p) => p.id),
      marks: Math.round(inCounted.reduce((n, q) => n + effectiveMarks(q, byId, fromPapers), 0) * 10) / 10,
      types: [...typeCount.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k),
      questionCount: mine.length,
      repeats: mine
        .filter((q) => q.repeat_group && (groupPapers.get(q.repeat_group)?.size ?? 0) > 1)
        .map((q) => `${paperLabel(paperById.get(q.paper_id!)!)} ${q.number}`),
    };
  });
  return { papers: counted, rows, few: counted.length < 2 };
}

const RELEVANCE_ORDER: Record<string, number> = { covered: 0, partial: 1, not_covered: 2 };

/** Practice order: in this year's slides first, "not in this year's slides" last (PRD F10 E);
 *  then newest paper first, then paper order. Generated questions after past-paper ones. */
export function practiceOrder(questions: PastQuestion[], papers: PastPaper[]): PastQuestion[] {
  const paperById = new Map(papers.map((p) => [p.id, p]));
  return [...questions].sort((a, b) => {
    const r = (RELEVANCE_ORDER[a.relevance ?? "partial"] ?? 1) - (RELEVANCE_ORDER[b.relevance ?? "partial"] ?? 1);
    if (r) return r;
    if (a.origin !== b.origin) return a.origin === "past_paper" ? -1 : 1;
    const pa = a.paper_id ? paperById.get(a.paper_id) : undefined;
    const pb = b.paper_id ? paperById.get(b.paper_id) : undefined;
    if (pa && pb && pa.id !== pb.id) return newestFirst(pa, pb);
    return a.sort_order - b.sort_order;
  });
}

/** Questions of one topic (practised ones), in practice order. */
export function topicQuestions(topicId: string, questions: PastQuestion[], qt: QuestionTopic[], papers: PastPaper[]): PastQuestion[] {
  const ids = new Set(qt.filter((x) => x.topic_id === topicId).map((x) => x.question_id));
  return practiceOrder(practised(questions).filter((q) => ids.has(q.id)), papers);
}

/** A whole paper's practised questions, in the paper's order. */
export function paperQuestions(paperId: string, questions: PastQuestion[]): PastQuestion[] {
  return practised(questions.filter((q) => q.paper_id === paperId)).sort((a, b) => a.sort_order - b.sort_order);
}

/** Stems of enclosing questions (case study, table), outermost first. */
export function stems(q: PastQuestion, questions: PastQuestion[]): string[] {
  const byId = new Map(questions.map((x) => [x.id, x]));
  const out: string[] = [];
  let p = q.parent_id ? byId.get(q.parent_id) : undefined;
  while (p) {
    if (p.text.trim()) out.unshift(p.text.trim());
    p = p.parent_id ? byId.get(p.parent_id) : undefined;
  }
  return out;
}

export const TYPE_LABEL: Record<string, string> = {
  define: "define",
  explain: "explain",
  compare: "compare",
  calculate: "calculate",
  code: "code",
  case_study: "case study",
  mcq: "multiple choice",
  essay: "essay",
};

/** "6 marks", "1.5 marks", "1 mark", or null. */
export function marksLabel(marks: number | null): string | null {
  if (marks == null) return null;
  const n = Number(marks);
  return `${Number.isInteger(n) ? n : n.toFixed(1)} mark${n === 1 ? "" : "s"}`;
}

// ── Where a model answer comes from (answer design v2, PRD F10) ─────────────
// Decided by the analysis step through relevance (ingestion/past_analysis.py, migration
// 20261113000003): covered → slides, partial → partial, not_covered → general.
export type Grounding = "slides" | "partial" | "general";

export function groundingOf(relevance: Relevance | string | null | undefined): Grounding | null {
  return relevance === "covered" ? "slides" : relevance === "partial" ? "partial" : relevance === "not_covered" ? "general" : null;
}

export const GROUNDING_LABEL: Record<Grounding, string> = {
  slides: "From your slides",
  partial: "Partly from your slides",
  general: "Not from your slides",
};

/** Shown with every general answer. */
export const GENERAL_NOTICE = "Not from your slides. Either this topic hasn't been uploaded yet, or it isn't in this year's slides.";

/** "4 papers: 2025/26 exam, 2025/26 test, 2024/25 exam, 2022/23 exam", newest first. */
export function paperSummary(papers: Pick<PastPaper, "session" | "type">[]): string {
  const sorted = [...papers].sort((a, b) => b.session.localeCompare(a.session) || a.type.localeCompare(b.type));
  return `${papers.length} paper${papers.length === 1 ? "" : "s"}: ${sorted.map((p) => paperLabel(p)).join(", ")}`;
}
