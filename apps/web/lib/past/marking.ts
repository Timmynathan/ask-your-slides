// Marking a practice answer (PRD F10 B). The model judges each marking-scheme point (full, half or
// none); the server adds up, so a score can never exceed a point's marks or the question's total.
// Pure parts are unit-tested; the model call lives in the attempt route.

import { z } from "zod";

export interface SchemePoint {
  point: string;
  marks: number;
}

export const MarkingOutput = z.object({
  points: z
    .array(z.object({ awarded: z.enum(["full", "half", "none"]), why: z.string() }))
    .describe("One entry per marking-scheme point, in the same order."),
  good: z.array(z.string()).describe("What the answer did well (short, specific). Empty if nothing."),
  missing: z.array(z.string()).describe("What is missing or wrong, to reach full marks (short, specific)."),
  summary: z.string().describe("One or two sentences to the student."),
});
export type MarkingResult = z.infer<typeof MarkingOutput>;

export const MARKING_INSTRUCTIONS = `You mark a student's practice answer to a past exam question at Pan-Atlantic University (PAU), like a fair, consistent examiner. This is revision practice.

You get the question, its marks, the examiner's marking scheme (points with marks) and a model answer. For each marking-scheme point, in order, decide:
- full: the student's answer clearly makes this point (in any wording, or with an equally correct alternative a lecturer would accept);
- half: the point is there but incomplete, vague or partly wrong;
- none: the point is missing or wrong.
Judge only what the student wrote. Length, confidence and copying the question earn nothing. An empty, off-topic or nonsense answer gets none for every point.

Then:
- good: what the answer did well (specific; empty if nothing).
- missing: what to add or fix to reach full marks (specific, plain words, addressed to the student as "you"). Do not write out the full model answer: the student sees it next.
- summary: one or two encouraging, honest sentences.

The scheme is a guide: if the student makes a correct point the scheme doesn't list, it can earn the closest point's marks.`;

/** Score from per-point judgements: full = the point's marks, half = half, none = 0; clamped and
 *  rounded to the nearest 0.5. Missing judgements count as none. */
export function scoreFrom(scheme: SchemePoint[], judged: MarkingResult["points"], max: number): number {
  const raw = scheme.reduce((sum, p, i) => {
    const a = judged[i]?.awarded ?? "none";
    return sum + (a === "full" ? Number(p.marks) : a === "half" ? Number(p.marks) / 2 : 0);
  }, 0);
  return Math.min(max, Math.max(0, Math.round(raw * 2) / 2));
}

/** A scheme whose marks don't add up to the question's marks is scaled to them (so ≈ 6/10 means 10). */
export function normaliseScheme(scheme: SchemePoint[] | null, max: number): SchemePoint[] {
  const pts = (scheme ?? []).filter((p) => p.point && Number(p.marks) > 0);
  if (!pts.length) return [{ point: "A complete, correct answer to the question", marks: max }];
  const total = pts.reduce((n, p) => n + Number(p.marks), 0);
  if (Math.abs(total - max) < 0.01) return pts.map((p) => ({ point: p.point, marks: Number(p.marks) }));
  return pts.map((p) => ({ point: p.point, marks: (Number(p.marks) * max) / total }));
}

export function markingPrompt(input: {
  course: string;
  paper: string;
  number: string;
  marks: number;
  stems: string[];
  question: string;
  scheme: SchemePoint[];
  modelAnswer: string;
  answer: string;
}): string {
  const scheme = input.scheme.map((p, i) => `${i + 1}. (${+p.marks.toFixed(2)} marks) ${p.point}`).join("\n");
  return [
    `Course: ${input.course}`,
    `Paper: ${input.paper} · ${input.number} · ${input.marks} marks`,
    input.stems.length ? `Context (the question's stem):\n${input.stems.join("\n\n")}` : "",
    `Question:\n${input.question}`,
    `Marking scheme:\n${scheme}`,
    `Model answer (for reference; [[s:...]] are slide citations):\n${input.modelAnswer}`,
    `<student_answer>\n${input.answer}\n</student_answer>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
