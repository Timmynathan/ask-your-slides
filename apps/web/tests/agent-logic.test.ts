import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}), must: (r: { data: unknown }) => r.data }));
import { chunkBody, decideFallback, type SlideHit } from "@/lib/agent/retrieval";
const { historyText } = await import("@/lib/agent/run");

const hit = (topic_id: string, similarity: number) => ({ topic_id, similarity }) as SlideHit;

describe("decideFallback", () => {
  it("stays in the topic when it matches as well as the rest of the course", () => {
    expect(decideFallback([hit("T", 0.62)], [hit("T", 0.62), hit("U", 0.6)], "T").fellBack).toBe(false);
  });
  it("widens when another topic is clearly better", () => {
    const d = decideFallback([hit("T", 0.41)], [hit("U", 0.65), hit("T", 0.41)], "T");
    expect(d).toEqual({ fellBack: true, bestInTopic: 0.41, bestOutsideTopic: 0.65 });
  });
  it("widens when the topic has no material at all", () => {
    expect(decideFallback([], [hit("U", 0.3)], "T").fellBack).toBe(true);
  });
});

describe("history and chunks", () => {
  it("keeps citation markers in history (stale keys are dropped by the validator, not here)", () => {
    expect(historyText("Indexes help. [[s:CSC420-02-21]] Yes.")).toBe("Indexes help. [[s:CSC420-02-21]] Yes.");
  });
  it("chunkBody drops the header lines only", () => {
    const chunk = "Course: CSC420 Data Management II\nTopic: Transactions\nMaterial (slides): T — slide 3 of 9\nTitle: ACID\nText: Course: not a header";
    expect(chunkBody(chunk)).toBe("Title: ACID\nText: Course: not a header");
  });
});

describe("preSearchQuery", async () => {
  const { preSearchQuery } = await import("@/lib/agent/run");
  it("uses the question alone when there is no history", () => {
    expect(preSearchQuery({ userMessage: "What is ACID?", history: [] })).toBe("What is ACID?");
  });
  it("adds the previous question to a short follow-up", () => {
    const history = [{ role: "user" as const, content: "What is a B+ tree?" }, { role: "assistant" as const, content: "…" }];
    expect(preSearchQuery({ userMessage: "How is that different from a hash index?", history }))
      .toBe("What is a B+ tree?\nHow is that different from a hash index?");
  });
});
