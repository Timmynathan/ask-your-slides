import "server-only";
// Court cases looked up on the web before the answer (owner, 25 Nov 2026: "always let it search the web
// for case questions", after Alheri asked for more on her Media Law cases and got only the slides' one line
// per case). A separate call, so the answer itself streams as usual: with web search inside the answer,
// Haiku split its reply into many small blocks (sentences broken across paragraphs, a cut opening) and
// once wrote "from my search" without searching. The notes it returns go to the answer as background,
// below the slides.
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, isStepCount } from "ai";

const MODEL = process.env.CHAT_MODEL ?? "claude-haiku-5-5";
const USD_PER_MTOK = { input: 0.1, output: 0.5 };
const USD_PER_WEB_SEARCH = 0.01; // $10 per 1,000 searches
export const MAX_CASE_SEARCHES = 4; // the slides' case lists run to four (ISM413 obscenity)
const TIMEOUT_MS = 30_000;

const SYSTEM = `You research court cases for a law tutor. The student's question and the lecture slides it relates to are below. Work out which cases the student is asking about (for "the important cases", the cases the slides list, most important first; at most ${MAX_CASE_SEARCHES}). Look up each one with web_search, one search per case (add "Nigeria" to the search for a Nigerian case).

Then write short notes, one section per case, headed with the case name as the slides give it:
- Confirmed facts: who the parties were and what happened, the court and year, what was decided and why, and why it matters. Only what the web results clearly support. Name the kind of source in words (a law report, a university page, a news site); no links.
- Differences: anything the sources give differently from the slides (year, court, country, holding), stated neutrally.
- Not confirmed: anything you couldn't confirm. If you found nothing reliable on a case, say exactly that.
Never guess or fill gaps from memory. Plain text, no preamble.`;

export interface CaseResearch {
  notes: string;
  queries: string[];
  cost: number;
}

export async function researchCases(question: string, slides: string, previous: string | null, lecture: string | null, abortSignal?: AbortSignal): Promise<CaseResearch | null> {
  try {
    const { text, usage, steps } = await generateText({
      model: anthropic(MODEL),
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `${lecture ? `This chat is about the lecture "${lecture}": for "the important cases", use the cases its slides list.\n\n` : ""}${previous ? `The tutor's previous reply in this chat (for what "these cases" or "the second one" refers to):\n${previous.slice(0, 3000)}\n\n` : ""}Slides:\n${slides.slice(0, 12_000)}\n\nThe student's question: ${question.slice(0, 1000)}`,
        },
      ],
      tools: { web_search: anthropic.tools.webSearch_20250305({ maxUses: MAX_CASE_SEARCHES }) },
      stopWhen: isStepCount(MAX_CASE_SEARCHES + 2),
      maxOutputTokens: 1500,
      abortSignal: abortSignal ? AbortSignal.any([abortSignal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
      providerOptions: { anthropic: { thinking: { type: "disabled" } } },
    });
    const queries = steps.flatMap((s) => s.toolCalls).filter((c) => c.toolName === "web_search").map((c) => String((c.input as { query?: string })?.query ?? ""));
    const cost = ((usage.inputTokens ?? 0) * USD_PER_MTOK.input + (usage.outputTokens ?? 0) * USD_PER_MTOK.output) / 1e6 + queries.length * USD_PER_WEB_SEARCH;
    // No search ran: the notes would be from memory, which is what this step exists to avoid.
    if (!queries.length || !text.trim()) return { notes: "", queries, cost };
    return { notes: text.trim(), queries, cost };
  } catch (e) {
    console.error("case research failed", e);
    return null;
  }
}
