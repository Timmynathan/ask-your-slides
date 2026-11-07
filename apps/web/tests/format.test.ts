import { describe, expect, it } from "vitest";
import { chipLabel, markersToLinks, splitAnswer } from "@/lib/study/format";

describe("splitAnswer", () => {
  it("separates slide text and general blocks", () => {
    expect(splitAnswer("ACID is four properties. [[s:A-01-1]]\n<general>\nA memory aid.\n</general>\nMore.")).toEqual([
      { kind: "slides", text: "ACID is four properties. [[s:A-01-1]]" },
      { kind: "general", text: "A memory aid." },
      { kind: "slides", text: "More." },
    ]);
  });
  it("treats an unclosed block as general while it streams", () => {
    expect(splitAnswer("Your slides don't cover this.\n<general>\nProof-of-stake is")).toEqual([
      { kind: "slides", text: "Your slides don't cover this." },
      { kind: "general", text: "Proof-of-stake is" },
    ]);
  });
  it("hides a tag that is still being typed", () => {
    expect(splitAnswer("Text <gene")).toEqual([{ kind: "slides", text: "Text" }]);
    expect(splitAnswer("Text a < b")).toEqual([{ kind: "slides", text: "Text a < b" }]);
  });
});

describe("markersToLinks", () => {
  it("turns markers into cite links and hides a half-typed one", () => {
    expect(markersToLinks("Fast. [[s:CSC420-02-21]]")).toBe("Fast.  [CSC420-02-21](#cite:CSC420-02-21)");
    expect(markersToLinks("Fast. [[s:CSC4")).toBe("Fast. ");
  });
});

describe("chipLabel", () => {
  it("formats by kind", () => {
    expect(chipLabel({ slide_key: "CSC420-02-12", material_title: "Transactions and Indexing", material_kind: "slides", slide_number: 12 }))
      .toBe("Transactions and Indexing · Slide 12");
    expect(chipLabel({ slide_key: "CSC402-07-4", material_title: "Contextual Integrity", material_kind: "reading", slide_number: 4 }))
      .toBe("Reading: Contextual Integrity · p. 4");
    expect(chipLabel({ slide_key: "CSC402-07-4" })).toBe("Slide 4");
  });
  it("names the other topic in a topic chat", () => {
    expect(chipLabel({ slide_key: "CSC420-05-22", material_title: "Functions", material_kind: "slides", slide_number: 22,
      topic_title: "Functions, procedures and triggers", outside_topic: true }, { showTopic: true }))
      .toBe("Functions, procedures and triggers › Functions · Slide 22");
  });
  it("skips the topic when the material title already says it", () => {
    expect(chipLabel({ slide_key: "CSC420-05-22", material_title: "Functions, Procedures and Triggers", material_kind: "slides",
      slide_number: 22, topic_title: "Functions, procedures and triggers", outside_topic: true }, { showTopic: true }))
      .toBe("Functions, Procedures and Triggers · Slide 22");
  });
});
