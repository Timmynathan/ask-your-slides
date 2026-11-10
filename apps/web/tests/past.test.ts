import { describe, expect, it } from "vitest";
import {
  buildExamMap,
  effectiveMarks,
  marksLabel,
  oldCode,
  paperQuestions,
  practised,
  shortSession,
  stems,
  topicQuestions,
  type PastPaper,
  type PastQuestion,
} from "@/lib/past/map";
import { normaliseScheme, scoreFrom } from "@/lib/past/marking";

const paper = (id: string, session: string, type: PastPaper["type"] = "exam", code: string | null = null): PastPaper => ({
  id, session, type, code_on_paper: code, instructions: null, duration: null, total_marks: null,
});
let order = 0;
const q = (id: string, paperId: string | null, number: string, o: Partial<PastQuestion> = {}): PastQuestion => ({
  id, paper_id: paperId, origin: paperId ? "past_paper" : "generated", number, parent_id: null, section: null, text: `Text ${id}`,
  marks: null, type: "explain", options: null, relevance: "covered", repeat_group: null, sort_order: order++, ...o,
});

// Two exams and a project; topics T1 (asked in both exams, repeated), T2 (one exam), T3 (project only).
const papers = [paper("e25", "2025/2026"), paper("e23", "2023/2024", "exam", "CSC 403"), paper("p25", "2025/2026", "project")];
const questions = [
  q("a1", "e25", "Q1", { marks: 20, text: "Case study" }),
  q("a1a", "e25", "Q1a", { parent_id: "a1", marks: 8, repeat_group: "g1" }),
  q("a1b", "e25", "Q1b", { parent_id: "a1", marks: 12, type: "compare" }),
  q("b2", "e23", "Q2", { marks: 10, repeat_group: "g1" }),
  q("b3", "e23", "Q3", { marks: 15, relevance: "not_covered" }),
  q("c1", "p25", "Q1", { marks: 30, type: "code" }),
  q("g1", null, "P1", { marks: 5 }),
];
const qt = [
  { question_id: "a1a", topic_id: "T1" }, { question_id: "a1", topic_id: "T1" }, { question_id: "b2", topic_id: "T1" },
  { question_id: "a1b", topic_id: "T2" }, { question_id: "b3", topic_id: "T1" },
  { question_id: "c1", topic_id: "T3" }, { question_id: "g1", topic_id: "T1" },
];
const topics = [{ id: "T1", title: "Indexing" }, { id: "T2", title: "Joins" }, { id: "T3", title: "SQL" }];

describe("exam map", () => {
  const map = buildExamMap(topics, papers, questions, qt);

  it("counts exams and tests only, newest first; projects are practice only", () => {
    expect(map.papers.map((p) => p.id)).toEqual(["e25", "e23"]);
    expect(map.few).toBe(false);
  });

  it("gives papers asked in, marks from practised parts, types, never stems or generated questions", () => {
    const [t1, t2, t3] = map.rows;
    expect(t1).toMatchObject({ papers: ["e25", "e23"], marks: 8 + 10 + 15, types: ["explain"], questionCount: 3 });
    expect(t2).toMatchObject({ papers: ["e25"], marks: 12, types: ["compare"] });
    expect(t3).toMatchObject({ papers: [], marks: 0, questionCount: 1 });
  });

  it("flags repeats across papers", () => {
    expect(map.rows[0].repeats).toEqual(["2025/26 exam Q1a", "2023/24 exam Q2"]);
  });

  it("says few papers below two", () => {
    expect(buildExamMap(topics, [papers[0], papers[2]], questions, qt).few).toBe(true);
  });
});

describe("practice", () => {
  it("lists practised questions only, not-in-this-year's-slides last, generated after past papers", () => {
    expect(practised(questions).map((x) => x.id)).not.toContain("a1");
    expect(topicQuestions("T1", questions, qt, papers).map((x) => x.id)).toEqual(["a1a", "b2", "g1", "b3"]);
    expect(paperQuestions("e25", questions).map((x) => x.number)).toEqual(["Q1a", "Q1b"]);
  });

  it("shows the stem and the old code", () => {
    expect(stems(questions[1], questions)).toEqual(["Case study"]);
    expect(oldCode(papers[1], "CSC420")).toBe("CSC 403");
    expect(oldCode(paper("x", "2025/2026", "exam", "PAU-CSC 420"), "CSC420")).toBeNull();
    expect(shortSession("2025/2026")).toBe("2025/26");
  });

  it("shares a parent's marks among parts that print none", () => {
    const qs = [q("p", "e", "Q2", { marks: 25 }), q("x", "e", "Q2a", { parent_id: "p" }), q("y", "e", "Q2b", { parent_id: "p" })];
    expect(effectiveMarks(qs[1], new Map(qs.map((z) => [z.id, z])), qs)).toBe(12.5);
    expect(marksLabel(12.5)).toBe("12.5 marks");
    expect(marksLabel(1)).toBe("1 mark");
  });
});

describe("marking arithmetic", () => {
  const scheme = [{ point: "a", marks: 2 }, { point: "b", marks: 3 }, { point: "c", marks: 5 }];

  it("adds full and half points, clamps and rounds to 0.5", () => {
    const j = (a: "full" | "half" | "none") => ({ awarded: a, why: "" });
    expect(scoreFrom(scheme, [j("full"), j("half"), j("none")], 10)).toBe(3.5);
    expect(scoreFrom(scheme, [j("full"), j("full"), j("full"), j("full")], 10)).toBe(10);
    expect(scoreFrom(scheme, [], 10)).toBe(0); // missing judgements = none
  });

  it("scales a scheme that doesn't add up to the marks, and supplies one when missing", () => {
    expect(normaliseScheme([{ point: "a", marks: 2 }, { point: "b", marks: 2 }], 10).map((p) => p.marks)).toEqual([5, 5]);
    expect(normaliseScheme(null, 6)).toEqual([{ point: "A complete, correct answer to the question", marks: 6 }]);
  });
});
