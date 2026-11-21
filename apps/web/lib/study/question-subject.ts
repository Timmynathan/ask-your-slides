import { stems } from "@/lib/agent/support";

// Words that say what to do, not what about: "give me an overview of the whole course", "quiz me on
// this course", "explain each slide", "what should I revise first?". Measured on the 60 real first
// questions (21 Nov 2026): these were the ones sent to the wrong course with confidence.
const REQUEST_WORDS = new Set(
  stems(
    `overview whole course courses class lecture lectures slide slides note notes material materials topic topics
    semester first quiz test exam exams question questions teach explain summary summarise summarize revise revision
    study learn tell know want please help give based basic basics everything detail detailed each every start
    should what which where today tomorrow different last three five concept concepts thing things`,
  ),
);

/** No subject to route on: only request words ("overview of the whole course", "quiz me"). */
export function hasNoSubject(question: string): boolean {
  return stems(question).filter((w) => !REQUEST_WORDS.has(w)).length < 1;
}

export interface RouteChoice {
  id: string;
  label: string;
  href: string;
  fit: number;
}

// When to ask (owner, 21 Nov 2026: a topic found in several courses should let the student pick).
// Measured on CS 400 questions: a course whose slides are about the question scores ~0.4–0.6; other
// courses ~0.2–0.35; a topic taught in two courses (scalability, stakeholders, IoT surveillance
// ethics) scores 0.38+ in each.
/** A course covers the question from this fit up… */
export const COVERS = 0.38;
/** …if it is also this close to the best course. */
export const NEAR = 0.7;

/** Open the best course, or ask: when several courses cover the question (only those are offered),
 *  or when none clearly does (the best three are). */
export function decide(ranked: RouteChoice[]): { choices: RouteChoice[]; clear: boolean; several?: boolean } {
  const top = ranked[0]?.fit ?? 0;
  const covering = ranked.filter((c) => c.fit >= COVERS && c.fit >= NEAR * top);
  if (covering.length >= 2) return { choices: covering.slice(0, 3), clear: false, several: true };
  if (top < COVERS) return { choices: ranked.slice(0, 3), clear: false };
  return { choices: ranked.slice(0, 3), clear: true };
}
