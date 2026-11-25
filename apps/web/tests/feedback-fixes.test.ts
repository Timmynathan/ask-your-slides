// Student feedback (owner, 25 Nov 2026): the bot may look up background on the web when it decides to, and a whole-course chat reads a
// lecture in full when a student asks broadly about it.
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { asksBroadly, namedTopics } = await import("@/lib/agent/run");
const { lagosDayStart } = await import("@/lib/agent/tools");

describe("background lookups", () => {
  it("counts the day from midnight in Lagos", () => {
    // 23:30 UTC on 24 Nov is 00:30 on 25 Nov in Lagos: the day began at 23:00 UTC on 24 Nov.
    expect(lagosDayStart(Date.UTC(2026, 10, 24, 23, 30))).toBe("2026-11-24T23:00:00.000Z");
    // 22:30 UTC on 24 Nov is 23:30 on 24 Nov in Lagos: the day began at 23:00 UTC on 23 Nov.
    expect(lagosDayStart(Date.UTC(2026, 10, 24, 22, 30))).toBe("2026-11-23T23:00:00.000Z");
  });
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
