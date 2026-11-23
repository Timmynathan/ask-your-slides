// "Explain every slide" and "keep going" (owner, 21 Nov 2026): a student's walkthroughs of 25-44
// slide decks stopped part-way, and "keep going" searched the slides for those words and lost its
// place. The messages below are hers, word for word where possible.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}), must: (r: { data: unknown }) => r.data }));
const { PLANNING, asksForMemoryAids, dropStrayCjk, asksForWalkthrough, asksForWorking, matchesPart, namedPart, plainSlideTalk, citedRanges, isContinuation, lastCitedSlide, lastQuestion, pickedItem, trimApologyOpening, trimTrailingNarration } = await import("@/lib/agent/run");

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
    "Do all the notes from project initiation note to managing project risk note",
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

describe("thinking aloud in calculation answers (owner's live check, 23 Nov 2026)", () => {
  it("drops a bare 'Let me calculate it:' line and 'Hmm, check that again:'", () => {
    expect(plainSlideTalk("Here W_a = 0.7.\n\nLet me calculate it:\n\n$$E = 11.525$$")).toBe("Here W_a = 0.7.\n\n\n$$E = 11.525$$");
    expect(plainSlideTalk("It lands nearer 11.45%. Hmm, check that again: 11.525% is closer to 11.45%.")).toBe("It lands nearer 11.45%. 11.525% is closer to 11.45%.");
  });
  it("keeps ordinary sentences", () => {
    expect(plainSlideTalk("Let me show you why the weights matter.")).toBe("Let me show you why the weights matter.");
  });
  it("cuts 'Let me calculate it:' before a tool call", () => {
    expect(trimTrailingNarration("Here W_a = 0.7 and W_b = 0.3.\n\nLet me calculate it:").dropped).toBe("Let me calculate it:");
  });
});

describe("trimTrailingNarration (before a tool call)", () => {
  it("drops the closing planning sentence the review caught", () => {
    const r = trimTrailingNarration("I've covered the cash book and the subsidiary books here; for the Journal and the Petty Cash Book, let me pull the slides too.\n\n");
    expect(r.dropped).toMatch(/let me pull the slides too/);
    expect(r.text).toBe("");
  });
  it("keeps the teaching before it", () => {
    const r = trimTrailingNarration("A ledger groups entries by account. [[s:X-01-2]] I'll fetch the petty cash slides next.");
    expect(r.text).toBe("A ledger groups entries by account. [[s:X-01-2]]");
  });
  it("leaves ordinary endings alone", () => {
    expect(trimTrailingNarration("Let me know if you want another example.").dropped).toBeNull();
    expect(trimTrailingNarration("So the balance b/d is 13,400.").dropped).toBeNull();
  });
});

describe("trimApologyOpening", () => {
  it("drops an apology or a comment on the earlier answer", () => {
    expect(trimApologyOpening("You're right, my last explanation skipped the expansion steps. Let's go slowly.")).toBe("Let's go slowly.");
    expect(trimApologyOpening("Sorry about that, Leko. Let's slow down.")).toBe("Let's slow down.");
    expect(trimApologyOpening("Timmy, I'm sorry to say I can't answer this one from the photo. The slides don't cover it.")).toBe("The slides don't cover it.");
    expect(trimApologyOpening("You're right, Leko. My last answer rushed the steps. Let's slow down.")).toBe("Let's slow down.");
  });
  it("drops a note on method before the answer (owner, 23 Nov 2026)", () => {
    const head = "**Theories of international communication**\nThe five theories are…";
    expect(trimApologyOpening(`Where a topic's slides didn't include a clear definition, I've described it from its title rather than citing it.\n\n${head}`)).toBe(head);
    expect(trimApologyOpening(`Where the slides don't define a term, I explain it in general terms. ${head}`)).toBe(head);
  });
  it("keeps an opening that starts the answer", () => {
    expect(trimApologyOpening("Where a firm sells abroad, it faces exchange risk. [[s:A-01-2]]")).toBe("Where a firm sells abroad, it faces exchange risk. [[s:A-01-2]]");
  });
  it("keeps a quiz verdict and ordinary openings", () => {
    expect(trimApologyOpening("You're right, it's Planning. [[s:A-01-2]]")).toBe("You're right, it's Planning. [[s:A-01-2]]");
    expect(trimApologyOpening("A ledger groups entries by account.")).toBe("A ledger groups entries by account.");
  });
});

describe("pickedItem ('5' or 'b' after a list)", () => {
  const roadmap = "Here is the roadmap:\n\n1. Introduction to accounting\n2. Users of accounts\n3. Concepts\n4. Source documents\n5. The Accounting Equation\n6. Double-entry\n\nWhich one?";
  it("finds the numbered item", () => expect(pickedItem("5", roadmap)).toBe("The Accounting Equation"));
  it("finds a lettered option", () => expect(pickedItem("b", "Which is right?\n(a) A treaty\n(b) An intergovernmental body\n(c) A company")).toBe("An intergovernmental body"));
  it("nothing for a real question or a missing item", () => {
    expect(pickedItem("what is 5?", roadmap)).toBeNull();
    expect(pickedItem("9", roadmap)).toBeNull();
  });
});

describe("lastQuestion", () => {
  it("takes the closing quiz question", () => {
    const a = "Plan [[s:A-06-17]].\n\n**Question 2:** Which process group do the other planning processes belong to, and what knowledge area is it under?\n\nGive it a go and I'll check it.\n</general>";
    expect(lastQuestion(a)).toBe("Question 2: Which process group do the other planning processes belong to, and what knowledge area is it under?");
  });
});

// "\frac" inside a template literal is a form feed + "rac": the maths example the model saw was garbled.
describe("instructions contain no hidden control characters", async () => {
  const { CORE_INSTRUCTIONS, CALCULATION_RULES, TURN_REMINDER } = await import("@/lib/agent/prompt");
  it.each([["core", CORE_INSTRUCTIONS], ["calculation", CALCULATION_RULES], ["reminder", TURN_REMINDER]])("%s", (_, text) => {
    expect(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)).toBe(false);
  });
});

describe("asksForWorking (maths turns think first in calculator courses)", () => {
  it.each(["Solve more examples on complex numbers and dive into Binomial theorem after", "Show more examples on binomial theorem", "expand (1+3x)^3/2", "what is 3 + 4i in polar form"])("yes: %s", (m) => expect(asksForWorking(m)).toBe(true));
  it.each(["What is a balance sheet?", "explain the history of the press in Nigeria"])("no: %s", (m) => expect(asksForWorking(m)).toBe(false));
});

describe("hasNoSubject (Ask anything: vague questions show the courses to pick from)", async () => {
  const { hasNoSubject } = await import("@/lib/study/question-subject");
  it.each(["Give me an overview of the whole course.", "Quiz me on this course.", "What should I revise first?", "Explain all my slides for first semester", "i have a test today give me a summary of all topics"])(
    "pick: %s",
    (q) => expect(hasNoSubject(q)).toBe(true),
  );
  it.each(["What is database normalisation?", "Explain the ethics of AI surveillance", "What are the types of networking cables"])("route: %s", (q) => expect(hasNoSubject(q)).toBe(false));
});

// Ask anything: open one course, or let the student pick (scores measured on CS 400 courses).
describe("decide (which course a question opens in)", async () => {
  const { decide } = await import("@/lib/study/question-subject");
  const r = (...fits: [string, number][]) => fits.map(([id, fit]) => ({ id, label: id, href: `/study/${id}`, fit }));
  it("opens the one course that covers it", () => {
    expect(decide(r(["CSC420", 0.41], ["CSC402", 0.33], ["CSC419", 0.306]))).toMatchObject({ clear: true });
    expect(decide(r(["CSC402", 0.558], ["CSC418", 0.324]))).toMatchObject({ clear: true });
  });
  it("asks, offering only the courses that cover a shared topic", () => {
    const d = decide(r(["CSC402", 0.467], ["INS401", 0.45], ["CSC409", 0.42], ["CSC418", 0.3]));
    expect(d).toMatchObject({ clear: false, several: true });
    expect(d.choices.map((c) => c.id)).toEqual(["CSC402", "INS401", "CSC409"]);
    expect(decide(r(["CSC402", 0.537], ["CSC418", 0.385], ["CSC409", 0.317])).choices.map((c) => c.id)).toEqual(["CSC402", "CSC418"]);
  });
  it("asks with the best three when no course clearly covers it", () => {
    const d = decide(r(["CSC412", 0.353], ["CSC418", 0.348], ["CSC420", 0.347]));
    expect(d.clear).toBe(false);
    expect(d.several).toBeFalsy();
    expect(d.choices).toHaveLength(3);
  });
});

describe("namedPart / matchesPart ('week 7' finds the week 7 file)", () => {
  it("reads the week or lecture the student names", () => {
    expect(namedPart("okay lets go back to the note for today week 7 pls")).toEqual({ kind: "week", n: 7 });
    expect(namedPart("no explain wk7")).toEqual({ kind: "week", n: 7 });
    expect(namedPart("summarise lecture 3")).toEqual({ kind: "lecture", n: 3 });
    expect(namedPart("what is a B+ tree?")).toBeNull();
  });
  it("matches real file names, not other numbers", () => {
    const wk7 = { kind: "week" as const, n: 7 };
    expect(matchesPart("WK7 Digital Legislations in Nigeria.pptx", wk7)).toBe(true);
    expect(matchesPart("WEEK 07", wk7)).toBe(true);
    expect(matchesPart("WK17 Something.pptx", wk7)).toBe(false);
    expect(matchesPart("WK2 Freedom of Expression.pptx", wk7)).toBe(false);
    const l3 = { kind: "lecture" as const, n: 3 };
    expect(matchesPart("05-PAU-CSC420-Lecture3-Functions-Procedures-Triggers.pdf", l3)).toBe(true);
    expect(matchesPart("07-COS409-Lecture-3-Notes.pdf", l3)).toBe(true);
    expect(matchesPart("03-CSC409-Lecture-0-Notes.pdf", l3)).toBe(false);
  });
});

describe("plainSlideTalk (search talk said about the slides)", () => {
  it("rewrites the phrases seen in real answers", () => {
    expect(plainSlideTalk("The search didn't return anything on shares or share capital themselves, so I'll cover them.")).toBe("Your slides don't cover shares or share capital themselves, so I'll cover them.");
    expect(plainSlideTalk("I can't find a detailed worked example for it in the materials I searched.")).toBe("I can't find a detailed worked example for it in your slides.");
  });
  it("leaves normal teaching alone", () => {
    expect(plainSlideTalk("A binary search halves the range each step.")).toBe("A binary search halves the range each step.");
  });
});

describe("memory aids (owner's review, 22 Nov 2026)", () => {
  it("spots a memory-aid request", () => {
    for (const m of ["give memory aids", "give me memory aids for each topic so i remember definitions and content", "any mnemonics for this?", "help me remember the defences"]) expect(asksForMemoryAids(m), m).toBe(true);
    for (const m of ["What is fair comment?", "Summarise lecture 3", "remember to cite"]) expect(asksForMemoryAids(m), m).toBe(false);
  });
  it("drops an opening comment on what the slides lack, keeps the rest", () => {
    expect(trimApologyOpening("Hey Chineze, the course has no memory-aid slides as such, so I'll give you aids built on the key lists in your lectures. Oya, let's start.")).toBe("Oya, let's start.");
    expect(trimApologyOpening("Your slides don't have any worked examples, so here's one. First, …")).toBe("First, …");
    // Kept: what the slides do have, and rule 6's exact opening.
    expect(trimApologyOpening("Your slides have a clear list of the four defences.")).toBe("Your slides have a clear list of the four defences.");
    expect(trimApologyOpening("Your slides don't cover this, but here's the idea:")).toBe("Your slides don't cover this, but here's the idea:");
  });
  it("drops a stray CJK character", () => {
    expect(dropStrayCjk("Facts, public interest,面 Fine to recognise")).toBe("Facts, public interest, Fine to recognise");
  });
});

describe("planning and search talk (owner's review, 22 Nov 2026)", () => {
  it("recognises the model planning to itself", () => {
    expect(PLANNING.test("I need the course materials for the exam questions. The student's photos cover several questions, so I'll answer the ones I can ground in the slides.")).toBe(true);
    expect(PLANNING.test("Defamation is judged by whether the words tend to lower the claimant in the estimation of reasonable people.")).toBe(false);
    expect(PLANNING.test("I'll explain each step, then give an example.")).toBe(false);
  });
  it("drops whole sentences about searching", () => {
    expect(plainSlideTalk("I searched the slides for press freedom and NBC regulation, and the materials give a framework. Section 39 applies.")).toBe("Section 39 applies.");
    expect(plainSlideTalk("Facts first.\nI didn't find slides that deal with a study lounge. The defamation notes are closest.")).toBe("Facts first.\nThe defamation notes are closest.");
    expect(plainSlideTalk("The court searched the slides? No.")).toBe("The court searched the slides? No.");
  });
});
