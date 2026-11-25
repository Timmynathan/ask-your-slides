import "server-only";
// Background from outside the slides, looked up on the web (owner, 25 Nov 2026: Alheri asked for more on her
// Media Law cases and got only the slides' one line per case; "court cases, laws, people, events… e.t.c").
//
// Who decides: a model, not a word list (owner: "using matching text is something I generally frown against").
// First tried as a tool the chat model could call: in 8 test questions it never called it, even for "tell me
// more about Hicklin" (Haiku sticks to the slides when they say anything). So a small, focused call decides
// for every message (decideLookup, run alongside the first slide search, ~0.01 US cents), and the research runs
// in its own call (researchBackground): with web search inside the answer itself, Haiku split its reply into
// many small blocks (sentences broken across paragraphs, a cut opening) and once wrote "from my search"
// without searching.
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, isStepCount } from "ai";

const MODEL = process.env.CHAT_MODEL ?? "claude-haiku-5-5";
const USD_PER_MTOK = { input: 0.1, output: 0.5 };
const USD_PER_WEB_SEARCH = 0.01; // $10 per 1,000 searches
export const MAX_LOOKUPS = 4; // items per answer: the slides' case lists run to four (ISM413 obscenity)
const DECIDE_TIMEOUT_MS = 8_000;
const RESEARCH_TIMEOUT_MS = 30_000;

const cost = (usage: { inputTokens?: number; outputTokens?: number }, searches = 0) =>
  ((usage.inputTokens ?? 0) * USD_PER_MTOK.input + (usage.outputTokens ?? 0) * USD_PER_MTOK.output) / 1e6 + searches * USD_PER_WEB_SEARCH;

const DECIDE = `You help a study app for university students in Nigeria decide two things about the student's latest message.

1. wellbeing: does it suggest the student may be in danger or serious distress (thoughts of ending their life or harming themselves, abuse or assault, feeling unsafe, a crisis)? Ordinary exam stress, tiredness or frustration ("I'm so stressed", "I'm going to fail", "this course is killing me") is not this.

2. lookup: does a good reply to the student's latest message need facts from outside their lecture slides about specific named things, such as court cases, laws and statutes, people, organisations, events, treaties, reports or historical episodes?

Answer yes when the student wants to know more about such a thing than lecture slides usually give: what happened in it, who was involved, when, what was decided or enacted, what a law contains or how it came about, its background or consequences ("tell me more about Hicklin", "the important cases", "what does the Cybercrimes Act do", "tell me more about the NBC Code", "who was on the MacBride Commission"). Always yes when they ask for more than, or beyond, what their slides say about a named thing. Use the previous reply for what "it", "that case" or "the second one" refers to.
Answer no for ideas, definitions, theories, processes and calculations a tutor explains from knowledge; for questions about what the slides themselves say; for explaining a whole topic or lecture ("tell me everything on X", "talk to me about X", "explain like I missed class"), summaries, overviews, quizzes, practice questions, "explain every slide", and small talk or questions about the app: the student can ask about a particular case or law afterwards.

Reply with JSON only: {"wellbeing": true or false, "lookup": true or false, "about": "what the student is asking about, in their own terms, or empty"}. In "about", never add names or examples the student and the previous reply didn't mention: for "the important cases", write "the important cases in this lecture's slides".`;

export interface LookupDecision {
  /** The student may be in danger or serious distress (prompt rule 18; owner, 25 Nov 2026). */
  wellbeing: boolean;
  lookup: boolean;
  about: string;
  cost: number;
}

export async function decideLookup(message: string, previousAnswer: string | null, lecture: string | null, course: string, abortSignal?: AbortSignal): Promise<LookupDecision> {
  try {
    const { text, usage } = await generateText({
      model: anthropic(MODEL),
      system: DECIDE,
      messages: [
        {
          role: "user",
          content: `Course: ${course}${lecture ? `\nLecture: ${lecture}` : ""}${previousAnswer ? `\n\nThe previous reply (start):\n${previousAnswer.slice(0, 1500)}` : ""}\n\nThe student's latest message:\n${message.slice(0, 1500)}`,
        },
      ],
      maxOutputTokens: 60,
      abortSignal: abortSignal ? AbortSignal.any([abortSignal, AbortSignal.timeout(DECIDE_TIMEOUT_MS)]) : AbortSignal.timeout(DECIDE_TIMEOUT_MS),
      providerOptions: { anthropic: { thinking: { type: "disabled" } } },
    });
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { wellbeing?: unknown; lookup?: unknown; about?: unknown };
    return { wellbeing: json.wellbeing === true, lookup: json.lookup === true, about: typeof json.about === "string" ? json.about.slice(0, 200) : "", cost: cost(usage) };
  } catch {
    return { wellbeing: false, lookup: false, about: "", cost: 0 };
  }
}

const RESEARCH = `You research background for a university tutor in Nigeria. You get the student's question, what it is about, and the lecture slides it relates to. Work out the specific things to look up (court cases, laws, people, organisations, events and the like): the ones the student asks about, or for "the important cases" and the like, the ones the slides list, most important first; at most ${MAX_LOOKUPS}. Only items the student or the slides name: never add others (the "what to look up" line is a short summary, not a list to follow). Look up each one with web_search, one search per item (add "Nigeria" when the item is Nigerian).

Then write short notes, one section per item, headed with its name as the slides give it:
- Confirmed facts: what the sources clearly support. For a case: the parties and what happened, the court and year, what was decided and why. For a law: when and by whom it was made, what it does, key sections. For a person: who they are and what they did that matters here. For an event: when, where, what happened and its consequences. Name the kind of source in words (a law report, a government site, a university page, a news site); no links.
- Differences: anything the sources give differently from the slides (a year, court, country, title, number), stated neutrally.
- Not confirmed: anything you couldn't confirm. If you found nothing reliable on an item, say exactly that.
Never guess or fill gaps from memory. Plain text, no preamble.`;

export interface BackgroundResearch {
  notes: string;
  queries: string[];
  cost: number;
}

export async function researchBackground(
  input: { question: string; about: string; slides: string; previousAnswer: string | null; lecture: string | null; course: string },
  abortSignal?: AbortSignal,
): Promise<BackgroundResearch> {
  const { text, usage, steps } = await generateText({
    model: anthropic(MODEL),
    system: RESEARCH,
    messages: [
      {
        role: "user",
        content:
          `Course: ${input.course}${input.lecture ? `\nThis chat is about the lecture "${input.lecture}": for "the important cases" and the like, use the ones its slides list.` : ""}` +
          `${input.previousAnswer ? `\n\nThe tutor's previous reply (for what "it" or "the second one" refers to):\n${input.previousAnswer.slice(0, 3000)}` : ""}` +
          `\n\nSlides:\n${input.slides.slice(0, 12_000)}\n\nThe student's question: ${input.question.slice(0, 1000)}\nWhat to look up: ${input.about || "(work it out from the question)"}`,
      },
    ],
    tools: { web_search: anthropic.tools.webSearch_20250305({ maxUses: MAX_LOOKUPS }) },
    stopWhen: isStepCount(MAX_LOOKUPS + 2),
    maxOutputTokens: 1500,
    abortSignal: abortSignal ? AbortSignal.any([abortSignal, AbortSignal.timeout(RESEARCH_TIMEOUT_MS)]) : AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
    providerOptions: { anthropic: { thinking: { type: "disabled" } } },
  });
  const queries = steps.flatMap((s) => s.toolCalls).filter((c) => c.toolName === "web_search").map((c) => String((c.input as { query?: string })?.query ?? ""));
  // No search ran: the notes would be from memory, which is what this step exists to avoid.
  return { notes: queries.length ? text.trim() : "", queries, cost: cost(usage, queries.length) };
}
