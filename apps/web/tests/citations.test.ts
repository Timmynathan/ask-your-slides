import { describe, expect, it } from "vitest";
import { citedKeys, createCitationFilter } from "@/lib/agent/citations";

function run(chunks: string[], allowed: string[]) {
  const cited: string[] = [];
  const invalid: string[] = [];
  const f = createCitationFilter({
    isAllowed: (k) => allowed.includes(k),
    onCited: (k) => cited.push(k),
    onInvalid: (k) => invalid.push(k),
  });
  const shown: string[] = chunks.map((c) => f.push(c));
  shown.push(f.flush());
  return { text: shown.join(""), shown, cited, invalid };
}

describe("citation filter", () => {
  it("keeps valid markers and drops invalid ones", () => {
    const r = run(["Indexes speed up reads. [[s:CSC420-02-21]] Made up. [[s:CSC420-99-1]]"], ["CSC420-02-21"]);
    expect(r.text).toBe("Indexes speed up reads. [[s:CSC420-02-21]] Made up. ");
    expect(r.cited).toEqual(["CSC420-02-21"]);
    expect(r.invalid).toEqual(["CSC420-99-1"]);
  });

  it("never shows part of a marker, however the stream splits it", () => {
    const text = "A B+ tree is balanced. [[s:CSC420-02-23]][[s:BAD-00-0]] Done.";
    for (let size = 1; size <= 8; size++) {
      const chunks = text.match(new RegExp(`[\\s\\S]{1,${size}}`, "g"))!;
      const r = run(chunks, ["CSC420-02-23"]);
      expect(r.text).toBe("A B+ tree is balanced. [[s:CSC420-02-23]] Done.");
      // No intermediate output ever contains a fragment of the invalid key.
      expect(r.shown.join("|")).not.toContain("BAD");
    }
  });

  it("passes through brackets that are not markers", () => {
    const r = run(["arrays a[i], [1, 2], [[nested]] and [[s: spaced]]"], []);
    expect(r.text).toBe("arrays a[i], [1, 2], [[nested]] and [[s: spaced]]");
    expect(r.invalid).toEqual([]);
  });

  it("normalizes key case", () => {
    const r = run(["x [[s:csc420-02-21]]"], ["CSC420-02-21"]);
    expect(r.text).toBe("x [[s:CSC420-02-21]]");
  });

  it("flushes an unfinished marker as text at the end", () => {
    expect(run(["trailing [[s:CSC4"], []).text).toBe("trailing [[s:CSC4");
  });

  it("citedKeys lists every marker", () => {
    expect(citedKeys("a [[s:CSC402-09-3]] b [[s:CSC402-09-4]]")).toEqual(["CSC402-09-3", "CSC402-09-4"]);
  });
});
