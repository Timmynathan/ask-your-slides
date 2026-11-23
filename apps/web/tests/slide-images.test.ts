import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { ASKS_VISUAL } = await import("@/lib/agent/slide-images");

describe("ASKS_VISUAL (when slide images go to the model)", () => {
  it("matches questions about something to look at", () => {
    for (const q of ["Explain the diagram on slide 4", "what does this slide show?", "Draw the supply curve", "explain the graph of demand", "walk me through the flow chart", "show me the table"]) {
      expect(ASKS_VISUAL.test(q), q).toBe(true);
    }
  });
  it("leaves ordinary questions alone", () => {
    for (const q of ["What is NPV?", "Explain project stakeholders", "Quiz me on blockchain", "Summarize portfolio theory"]) {
      expect(ASKS_VISUAL.test(q), q).toBe(false);
    }
  });
});
