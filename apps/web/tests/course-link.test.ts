import { describe, expect, it } from "vitest";
import { courseHref, resolveCourse } from "@/lib/study/course-link";

const cs = { code: "INS401", programme: "computer-science", department: "Computer Science" };
const se = { code: "INS401", programme: "software-engineering", department: "Software Engineering" };
const csc420 = { code: "CSC420", programme: "computer-science", department: "Computer Science" };
const all = [cs, se, csc420];

describe("course links (a code can repeat across programmes)", () => {
  it("keeps links short when the code is unique", () => {
    expect(courseHref(csc420, all)).toBe("/study/CSC420");
    expect(courseHref(csc420, all, { chat: "abc" })).toBe("/study/CSC420?chat=abc");
  });

  it("adds the programme when the code is shared", () => {
    expect(courseHref(se, all)).toBe("/study/INS401?programme=software-engineering");
    expect(courseHref(cs, all, { topic: "2" })).toBe("/study/INS401?programme=computer-science&topic=2");
  });

  it("resolves /study/CODE by programme, then the student's department, then the first", () => {
    expect(resolveCourse(all, "INS401", "software-engineering", "Computer Science")).toBe(se);
    expect(resolveCourse(all, "INS401", undefined, "Software Engineering")).toBe(se);
    expect(resolveCourse(all, "INS401", undefined, null)).toBe(cs);
    expect(resolveCourse(all, "INS401", "no-such-programme", null)).toBe(cs);
    expect(resolveCourse(all, "CSC999", undefined, null)).toBeUndefined();
  });
});
