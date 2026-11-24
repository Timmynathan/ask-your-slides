// Answer review fixes (owner, 24 Nov 2026): a pasted paper is searched question by question, and
// topics the student names are found by title.
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { namedTopics, numberedQuestions, preSearchQuery, refersBack } = await import("@/lib/agent/run");

const THEOLOGY = ["1-2 commandments", "2nd and 3rd commandments", "1st commandment", "10 COMMANDMENTS INTRODUCTION (lite", "5th commandment", "Fifth Commandment2", "6th commandment (lite", "Sixth Commandment", "7th commandment", "Seventh Commandment", "6th commandment", "8th commandment", "910 commandments (lite", "THE LAST THINGS (lite", "8. PERSONAL SIN (lite"].map((title, i) => ({ id: String(i), title }));

describe("numbered questions", () => {
  it("splits a pasted four-question paper", () => {
    const paper = "1. Why do we pray for the dead? 1mark (b) what concept does this support?\n2. A student finds money on the floor. What should he do?\n3. Explain the moral object.\n4. Compare abortion and in vitro fertilization";
    const q = numberedQuestions(paper)!;
    expect(q).toHaveLength(4);
    expect(q[0]).toMatch(/^Why do we pray for the dead/);
    expect(q[3]).toMatch(/abortion/);
  });
  it("leaves a single question alone, and numbers inside a sentence", () => {
    expect(numberedQuestions("Give 5 questions on this topic")).toBeNull();
    expect(numberedQuestions("Explain slide 4. Then slide 5.")).toBeNull();
    expect(numberedQuestions("Q1) Define a codec\nQ2) Name two codecs")).toEqual(["Define a codec", "Name two codecs"]);
  });
});

describe("named topics", () => {
  it("finds the 7th and 8th commandment topics from Anthony's request (not the chat's own topic)", () => {
    const got = namedTopics("Talk on the 7th, 8th and 9th commandments with 5 questions each and their answers", THEOLOGY, "6").map((t) => t.title);
    expect(got).toEqual(expect.arrayContaining(["7th commandment", "Seventh Commandment", "8th commandment"]));
    expect(got).not.toContain("6th commandment (lite");
    expect(got).not.toContain("5th commandment");
  });
  it("needs every word of a title, and a number for one-word titles", () => {
    expect(namedTopics("what is purgatory", [{ id: "a", title: "Purgatory" }], null)).toEqual([]);
    expect(namedTopics("explain the last things", THEOLOGY, null).map((t) => t.title)).toEqual(["THE LAST THINGS (lite"]);
    expect(namedTopics("what is sin", THEOLOGY, null)).toEqual([]);
  });
});

describe("the follow-up glue still applies (and the new message is now searched on its own as well)", () => {
  it("joins the previous question for a follow-up-looking message", () => {
    const history = [{ role: "user" as const, content: "Explain abortion and IVF" }, { role: "assistant" as const, content: "…" }];
    const msg = "Talk on the 7th, 8th and 9th commandments with 5 questions each and their answers";
    expect(refersBack(msg)).toBe(true);
    expect(preSearchQuery({ userMessage: msg, history })).not.toBe(msg); // so run.ts adds a second search with msg alone
  });
});
