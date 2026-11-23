import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

// Opening editor (owner, 23 Nov 2026: "why can't the AI itself read the intro and take these words out,
// rather than us black-listing phrases?"). Before the first words of an answer reach the student, a short
// second Haiku call reads its first sentences and says how many of them, from the start, are not part of
// the answer: the model planning to itself, talk about searching, or filler that only announces what is
// coming. It only returns a number, so it can remove sentences but never change or add a word. The phrase
// filters in run.ts stay as the safety net. Off with OPENING_EDITOR=0. About $0.0001 an answer.

const EDITOR_MODEL = process.env.CHAT_MODEL || "claude-haiku-5-5";
const USD_PER_MTOK = { input: 0.1, output: 0.5 };
/** Longer than this and the editor is skipped: the answer goes out as it is. */
const TIMEOUT_MS = 2_500;
const MAX_SENTENCES = 6;

export const OPENING_EDITOR_ON = process.env.OPENING_EDITOR !== "0";

const PROMPT = `You check the first sentences of a study tutor's reply to a university student, before the student sees it. Some replies start with sentences that are not part of the answer:
- the tutor planning or talking to itself ("I need the course materials for this.", "The student's photos cover several questions, so I'll answer the ones I can ground.")
- talk about searching or looking ("I went through your slides and found…", "The search found no slides on this.", "Let me pull the relevant slides.")
- empty filler that only announces what is coming ("Great question!", "Let me walk you through this.", "I'll explain this step by step.")

These are part of the answer and must be kept:
- a greeting with the student's name that leads into content ("Kika, week 7 is about digital laws.")
- a one-line lead-in that says what follows ("Here are five practice questions on Law and Conscience, with answers.")
- anything with real content: a definition, a fact, a direct answer, a reference to a slide.

Reply with only JSON: {"drop": N}, where N is how many of the numbered sentences, counted from sentence 1, to remove from the start (consecutive, from the start only). If sentence 1 is already part of the answer, N is 0. When unsure, keep it.`;

/** The opening split into sentence-like pieces whose concatenation is exactly the text. */
export function openingPieces(text: string): string[] {
  return text.match(/[^.!?\n]*(?:[.!?]+["')\]]*\s*|\n+|$)/g)?.filter((p) => p.length > 0) ?? [text];
}

/** How many leading pieces may be removed at most: never a piece with a citation or the start of a
 *  <general> block, never the last (possibly unfinished) piece, never everything. */
export function maxDroppable(pieces: string[]): number {
  let n = 0;
  for (const [i, p] of pieces.slice(0, -1).entries()) {
    // A citation follows its sentence ("Key fact. [[s:…]]"), so the sentence before one is kept too.
    if (p.includes("[[") || pieces[i + 1].trimStart().startsWith("[[") || p.includes("<general>") || p.includes("**") || /^\s*[-*#|]/.test(p)) break;
    n++;
  }
  return Math.min(n, MAX_SENTENCES);
}

/** Removes the first `drop` sentences of `text` (as the editor decided), within the safe limit. */
export function applyDrop(text: string, drop: number): { text: string; dropped: string | null } {
  const pieces = openingPieces(text);
  const n = Math.max(0, Math.min(Math.floor(drop) || 0, maxDroppable(pieces)));
  if (!n) return { text, dropped: null };
  const dropped = pieces.slice(0, n).join("");
  if (!dropped.trim()) return { text, dropped: null };
  return { text: pieces.slice(n).join("").replace(/^\s+/, ""), dropped: dropped.trim() };
}

/** Asks the editor about the opening of an answer. Never throws: on any failure the text is kept. */
export async function editOpening(text: string, question: string): Promise<{ text: string; dropped: string | null; cost: number }> {
  const pieces = openingPieces(text);
  const candidates = maxDroppable(pieces);
  if (!candidates) return { text, dropped: null, cost: 0 };
  const numbered = pieces
    .slice(0, candidates + 1)
    .map((p, i) => `${i + 1}. ${p.trim()}`)
    .join("\n");
  try {
    const { text: reply, usage } = await generateText({
      model: anthropic(EDITOR_MODEL),
      system: PROMPT,
      messages: [{ role: "user", content: `The student asked: ${question.slice(0, 500)}\n\nThe reply's first sentences:\n${numbered}` }],
      maxOutputTokens: 20,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      providerOptions: { anthropic: { thinking: { type: "disabled" } } },
    });
    const cost = ((usage.inputTokens ?? 0) * USD_PER_MTOK.input + (usage.outputTokens ?? 0) * USD_PER_MTOK.output) / 1e6;
    const drop = Number(reply.match(/"drop"\s*:\s*(\d+)/)?.[1] ?? 0);
    return { ...applyDrop(text, drop), cost };
  } catch {
    return { text, dropped: null, cost: 0 };
  }
}
