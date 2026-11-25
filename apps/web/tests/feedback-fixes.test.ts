// Student feedback (owner, 25 Nov 2026): case questions may search the web, and a whole-course chat reads a
// lecture in full when a student asks broadly about it.
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { asksAboutCases, asksBroadly, namedTopics } = await import("@/lib/agent/run");

describe("case questions", () => {
  it.each([
    "could you give me more information on the important cases",
    "Tell me about chike obi case",
    "what happened in DPP v Whyte",
    "explain R v. Hicklin",
    "what was the judgment in Nwankwo v State",
    "which precedents apply to sedition?",
  ])("is a case question: %s", (m) => expect(asksAboutCases(m)).toBe(true));

  it.each([
    "What is the difference between libel and slander?",
    "in that case what is the penalty",
    "explain the Nokia case study",
    "what is a use case diagram",
    "in the worst case, how long does the search take",
    "libel vs slander",
    "summarize this topic",
  ])("is not a case question: %s", (m) => expect(asksAboutCases(m)).toBe(false));
});

describe("broad asks about a topic", () => {
  const ISM413 = ["Introduction to law", "Law of defamation", "Obscenity and indecency law", "Law of sedition"].map((title, i) => ({ id: String(i), title }));
  it("finds the one lecture named in a broad ask", () => {
    const m = "talk to me about LAW OF SEDITION IN MEDIA";
    expect(asksBroadly(m)).toBe(true);
    expect(namedTopics(m, ISM413, null).map((t) => t.title)).toEqual(["Law of sedition"]);
  });
  it.each(["tell me everything on Obscenity and Indecency law", "explain law of defamation", "go through the law of sedition"])("broad: %s", (m) => expect(asksBroadly(m)).toBe(true));
  it.each(["what does imputation mean in this context", "How is gesture a slander", "is truth a defence to sedition?"])("narrow: %s", (m) => expect(asksBroadly(m)).toBe(false));
});
