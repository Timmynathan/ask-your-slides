import { describe, expect, it } from "vitest";
import { attentionReasons } from "@/lib/admin/attention";

const base = { rating: null, errors: [], latency_ms: 6000, output_text: "A B+ tree keeps keys sorted. [[s:CSC420-02-21]]", tool_calls: [{ name: "search_slides", detail: { similarities: [0.62, 0.5] } }] } as const;

describe("attentionReasons (/admin Answers: Needs attention)", () => {
  it("a fine answer needs nothing", () => expect(attentionReasons({ ...base, errors: [], tool_calls: [...base.tool_calls] })).toEqual([]));
  it("names each reason", () => {
    expect(
      attentionReasons({
        rating: -1,
        errors: [{ code: "truncated" }, { code: "citation_invalid" }, { code: "citation_invalid" }, { code: "citation_unsupported" }, { code: "narration_dropped" }],
        latency_ms: 31000,
        output_text: "Your slides don't cover this, but here's the idea:",
        tool_calls: [{ name: "search_slides", detail: { similarities: [0.21] } }],
      }),
    ).toEqual(["Thumbs down", "Not covered by the slides", "Search found nothing relevant", "Answer cut short (the student saw Continue)", "3 slide links removed", "Slow (31 s)"]);
  });
});
