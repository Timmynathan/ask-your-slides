import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { applyDrop, maxDroppable, openingPieces } = await import("@/lib/agent/opening-editor");
const { trimApologyOpening, plainSlideTalk } = await import("@/lib/agent/run");

describe("opening editor: what it may remove", () => {
  it("splits so the pieces join back to the exact text", () => {
    const t = "Great question! Let me walk you through this.\n\nKika, week 7 is about digital laws. [[s:MCM217-19-1]]";
    expect(openingPieces(t).join("")).toBe(t);
  });
  it("removes the sentences the editor names", () => {
    const t = "I need the course materials for this. The student's photos cover several questions.\n\nChineze, here is question 4.";
    expect(applyDrop(t, 2)).toEqual({ text: "Chineze, here is question 4.", dropped: "I need the course materials for this. The student's photos cover several questions." });
  });
  it("never removes a cited sentence, a <general> block, a list or everything", () => {
    expect(applyDrop("Filler here. Key fact. [[s:A-1-2]] More.", 5).text).toBe("Key fact. [[s:A-1-2]] More.");
    expect(applyDrop("Filler.\n<general>\nTeach.", 9).text).toBe("<general>\nTeach.");
    expect(maxDroppable(openingPieces("Only one sentence."))).toBe(0);
    expect(applyDrop("Intro.\n- item one\n- item two", 9).text).toBe("- item one\n- item two");
    expect(applyDrop("Kika, week 7 is about laws.", 0).dropped).toBeNull();
  });
});

describe("not-covered tag", () => {
  it("becomes the fixed line", () => {
    expect(trimApologyOpening("[[not-covered]]\n<general>\nKubernetes is…")).toBe("Your slides don't cover this, but here's the idea:\n\n<general>\nKubernetes is…");
    expect(trimApologyOpening("Hi Tolu! [[not-covered]] <general>x")).toBe("Your slides don't cover this, but here's the idea:\n\n<general>x");
  });
  it("is removed anywhere else", () => {
    expect(plainSlideTalk("Some text [[not-covered]]more")).toBe("Some text more");
  });
});

describe("dropSelfRemarks (safety net after the editor, owner's answer review 24 Nov 2026)", () => {
  it("drops the tutor's remarks about what it did, even when they name a slide", async () => {
    const { dropSelfRemarks } = await import("@/lib/agent/opening-editor");
    const r = dropSelfRemarks("Slide 25 is the reference list, so I've left it at the end.\n\n**Slide 1: Heritage**\n\nThe title slide…");
    expect(r.text.startsWith("**Slide 1")).toBe(true);
    expect(r.dropped).toContain("I've left it");
  });
  it("keeps content, lead-ins and cited sentences", async () => {
    const { dropSelfRemarks } = await import("@/lib/agent/opening-editor");
    for (const t of [
      "Here's the whole class, slide by slide.\n\n**Slide 1**",
      "A codec compresses video. [[s:ISM403-08-3]] I've read the slide.",
      "Kiishi, week 7 is about digital laws.",
    ]) expect(dropSelfRemarks(t).text).toBe(t);
  });
  it("never drops the cited sentence the remark sits in", async () => {
    const { dropSelfRemarks } = await import("@/lib/agent/opening-editor");
    const t = "I've checked slide 4. [[s:FIN209-09-4]] It lists four roles.";
    expect(dropSelfRemarks(t).text).toBe(t);
  });
});
