// "Explain every slide" and "keep going" (owner, 21 Nov 2026): a student's walkthroughs of 25-44
// slide decks stopped part-way, and "keep going" searched the slides for those words and lost its
// place. The messages below are hers, word for word where possible.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}), must: (r: { data: unknown }) => r.data }));
const { asksForWalkthrough, citedRanges, isContinuation, lastCitedSlide } = await import("@/lib/agent/run");

describe("asksForWalkthrough", () => {
  it.each([
    "I meant that you should explain every slide in week 10 in detail without using words already on the slide so that I have sth esle to write in exam",
    "I meant that you should explain every slide  in detail without using words already on the slide",
    "explain each slide please",
    "go through all the slides one by one",
    "slide by slide breakdown of this topic",
    "can you explain all 35 slides",
    "explain the whole deck in detail",
    "teach me the entire lecture",
  ])("yes: %s", (m) => expect(asksForWalkthrough(m)).toBe(true));
  it.each([
    "What is three-point lighting?",
    "summarise this topic",
    "This first slide like I missed class and make sure that the texts And boards that are bold Further explained",
    "quiz me",
  ])("no: %s", (m) => expect(asksForWalkthrough(m)).toBe(false));
});

describe("isContinuation", () => {
  it.each(["keep going", "keepgoing", "keepp going", "keep going why didyou stopp", "you stopped at 19 when there are 35 slides keep going", "continue", "Keep going from where you stopped.", "go on"])(
    "yes: %s",
    (m) => expect(isContinuation(m)).toBe(true),
  );
  it.each(["what is a mesh?", "your explanations are too brief", "how do I continue a for loop in Python when a condition is met and also explain break and pass with an example of each one please thanks"])(
    "no: %s",
    (m) => expect(isContinuation(m)).toBe(false),
  );
});

describe("lastCitedSlide", () => {
  it("takes the last citation in the answer", () => {
    expect(lastCitedSlide("Slide 1 [[s:ISM414-07-1]] … **Slide 19** [[s:ISM414-07-19]] and the end")).toEqual({ material: "ISM414-07", number: 19 });
  });
  it("none when nothing was cited", () => {
    expect(lastCitedSlide("No citations here.")).toBeNull();
  });
});

describe("citedRanges (the previous answer's slides, read again on a follow-up)", () => {
  it("groups nearby slides per deck and bridges small gaps", () => {
    const a = "x [[s:INS401-06-14]] y [[s:INS401-06-12]] z [[s:INS401-06-30]] w [[s:INS401-02-3]] [[s:INS401-06-14]]";
    expect(citedRanges(a)).toEqual([
      { material: "INS401-06", from: 12, to: 14 },
      { material: "INS401-06", from: 30, to: 30 },
      { material: "INS401-02", from: 3, to: 3 },
    ]);
  });
  it("stays within the page budget", () => {
    const many = Array.from({ length: 60 }, (_, i) => `[[s:PHY101-05-${i + 1}]]`).join(" ");
    const total = citedRanges(many).reduce((s, r) => s + r.to - r.from + 1, 0);
    expect(total).toBe(40);
  });
  it("nothing when the answer cited nothing", () => expect(citedRanges("plain text")).toEqual([]));
});
