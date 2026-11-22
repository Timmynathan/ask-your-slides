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
  it("repairs a marker closed with one bracket, however the stream splits it", () => {
    const text = "Implied meaning counts. [[s:ISM413-07-10]\n\nNext. [[s:ISM413-07-4]] End [[s:ISM413-07-9]";
    for (let size = 1; size <= 9; size++) {
      const chunks = text.match(new RegExp(`[\\s\\S]{1,${size}}`, "g"))!;
      const r = run(chunks, ["ISM413-07-10", "ISM413-07-4", "ISM413-07-9"]);
      expect(r.text).toBe("Implied meaning counts. [[s:ISM413-07-10]]\n\nNext. [[s:ISM413-07-4]] End [[s:ISM413-07-9]]");
    }
  });

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

// Phase B of the answer review (21 Nov 2026): a loaded slide that says nothing of its sentence.
describe("citation support check", async () => {
  const { supportsClaim } = await import("@/lib/agent/support");
  const TITLE = "FUNDAMENTALS\nFoundations of Data Structures\n4\nStephen A. Adubi";
  const QUEUE = "What is a Queue?\nA queue is a linear data structure that follows First In First Out: elements are added at the rear and removed from the front, like people waiting in line at a bank.";
  const TREE = "TREE\nUnlike natural trees, these trees are depicted upside down with the root at the top and the leaves (terminal nodes) at the bottom. Each node has a parent except the root.";

  it("drops a slide about something else (the real CSC301 overview)", () => {
    expect(supportsClaim("A tree is a hierarchy of nodes with a root at the top and leaves at the bottom.", QUEUE).ok).toBe(false);
  });
  it("keeps a slide that supports the claim", () => {
    expect(supportsClaim("A tree is a hierarchy of nodes with a root at the top and leaves at the bottom.", TREE).ok).toBe(true);
  });
  it("never judges a nearly empty slide or a maths step", () => {
    expect(supportsClaim("A linked list is a sequence of nodes, each holding data plus a pointer to the next node.", TITLE).ok).toBe(true);
    expect(supportsClaim("Then raise r to the 6th power and multiply the angle by 6, which gives 117 − 44i.", QUEUE).ok).toBe(true);
  });

  it("the stream filter drops the unsupported marker and keeps the sentence", () => {
    const unsupported: string[] = [];
    const cited: string[] = [];
    const texts: Record<string, string> = { "CSC301-11-4": QUEUE, "CSC301-13-2": TREE };
    const f = createCitationFilter({
      isAllowed: (k) => k in texts,
      supports: (k, claim) => supportsClaim(claim, texts[k]).ok,
      onCited: (k) => cited.push(k),
      onInvalid: () => {},
      onUnsupported: (k) => unsupported.push(k),
    });
    const out = f.push("A tree is a hierarchy of nodes with a root at the top and leaves at the bottom. [[s:CSC301-11-4]] [[s:CSC301-13-2]]") + f.flush();
    expect(out).toBe("A tree is a hierarchy of nodes with a root at the top and leaves at the bottom.  [[s:CSC301-13-2]]");
    expect(unsupported).toEqual(["CSC301-11-4"]);
    expect(cited).toEqual(["CSC301-13-2"]);
  });
});
