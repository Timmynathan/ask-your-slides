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
