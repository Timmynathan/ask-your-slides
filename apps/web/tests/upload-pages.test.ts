import { describe, expect, it } from "vitest";
import { CHUNK_CHARS, chunks, splitPages } from "@/lib/uploads/pages";

describe("splitPages", () => {
  it("splits on page markers and drops blank pages", () => {
    const text = "=== Page 1 ===\nQ1. Define a key. (5 marks)\n\n=== Page 2 ===\n[no text]\n=== Page 3 ===\nQ2. Normalise this table.";
    expect(splitPages(text)).toEqual([
      { page: 1, text: "Q1. Define a key. (5 marks)" },
      { page: 3, text: "Q2. Normalise this table." },
    ]);
  });
  it("treats text without markers as one page", () => {
    expect(splitPages("Just some notes")).toEqual([{ page: 1, text: "Just some notes" }]);
  });
});

describe("chunks", () => {
  it("keeps short pages whole and splits long ones near the limit", () => {
    expect(chunks("short")).toEqual(["short"]);
    const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} `.repeat(10)).join("\n\n");
    const parts = chunks(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= CHUNK_CHARS * 1.5)).toBe(true);
    expect(parts.join("\n\n").replace(/\s+/g, "")).toBe(long.replace(/\s+/g, ""));
  });
});
