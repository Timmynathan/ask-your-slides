// The Ask box opens a course when only its code or name is typed (owner, 21 Nov 2026: the
// dashboard's course search was removed).
import { describe, expect, it } from "vitest";
import { courseNamed } from "@/components/dashboard/ask-box";

const courses = [
  { code: "CSC420", shownCode: "CSC 420", title: "Data Management II", href: "/study/CSC420" },
  { code: "CSC402", shownCode: "CSC 402", title: "Ethics and Legal Issues for CSC and Software Engineering", href: "/study/CSC402" },
  { code: "INS401", shownCode: "INS 401", title: "Project Management", href: "/study/INS401" },
  { code: "ACC-BASIC-MATHEMATICS", shownCode: null, title: "Basic Mathematics", href: "/study/ACC-BASIC-MATHEMATICS" },
];

describe("courseNamed", () => {
  it.each([
    ["CSC 420", "CSC420"],
    ["csc420", "CSC420"],
    ["ins401", "INS401"],
    ["data management", "CSC420"],
    ["Project Management", "INS401"],
    ["ethics and legal", "CSC402"],
    ["basic mathematics", "ACC-BASIC-MATHEMATICS"],
  ])("opens the course: %s", (text, code) => expect(courseNamed(text, courses)?.code).toBe(code));

  it.each(["What is database normalisation?", "explain risk management in projects", "data", "quiz me on ethics"])("stays a question: %s", (text) =>
    expect(courseNamed(text, courses)).toBeNull(),
  );
});
