import { describe, expect, it } from "vitest";
import { citedKeys, scoreTrace, uncitedSentences } from "@/lib/evals/checks.mts";

describe("deterministic checks", () => {
  it("attaches a citation to the sentence before it", () => {
    const text = "A B+ tree is balanced and sorted by key. [[s:CSC420-02-21]] Hash indexes only support equality lookups. [[s:CSC420-02-30]]";
    expect(uncitedSentences(text)).toEqual([]);
  });
  it("finds uncited sentences outside <general> only", () => {
    const text = "Indexes make lookups much faster than full scans.\n<general>\nThis background sentence is not from the slides at all.\n</general>";
    expect(uncitedSentences(text)).toEqual(["Indexes make lookups much faster than full scans."]);
  });
  it("scores a trace", () => {
    const s = scoreTrace(
      { tool_calls: [{ name: "search_slides" }], retrieved_slide_ids: ["CSC420-02-5"], output_text: "ACID is four properties. [[s:CSC420-02-5]]" },
      "CSC420",
    );
    expect(s).toMatchObject({ retrieval_before_answer: true, citations_in_retrieved: true, citations_in_course: true, cited_slides: 1 });
    expect(citedKeys("x [[s:csc420-02-5]]")).toEqual(["CSC420-02-5"]);
  });
});
