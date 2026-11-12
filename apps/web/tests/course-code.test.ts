import { describe, expect, it } from "vitest";
import {
  countMain,
  courseFullName,
  courseName,
  displayCode,
  LIMITED_MAIN_MATERIALS,
  MATERIAL_KEY_RE,
  parseMaterialKey,
  parseSlideKey,
  shownCode,
  SLIDE_KEY_RE,
} from "@/lib/study/course-code";
import { chatContext } from "@/lib/agent/prompt";

describe("course codes (placeholder codes, Nov 2026 programmes)", () => {
  it("parses real and placeholder slide keys", () => {
    expect(parseSlideKey("CSC420-02-12")).toEqual({ code: "CSC420", order: "02", number: 12, material: "CSC420-02" });
    expect(parseSlideKey("IOH-ETHICS-03-12")).toEqual({ code: "IOH-ETHICS", order: "03", number: 12, material: "IOH-ETHICS-03" });
    expect(parseSlideKey("BUA-SOC-POL-ENV-10-1")?.code).toBe("BUA-SOC-POL-ENV");
    expect(parseSlideKey("GET501-01-1")?.code).toBe("GET501");
  });

  it("refuses malformed keys", () => {
    for (const k of ["IOH-ETHICS-3-12", "IOH-ETHICS-03", "ioh-ethics-03-1", "IOH-1ST-03-1", "CSC420-02-1234", "CSC420-02-12'"]) {
      expect(SLIDE_KEY_RE.test(k), k).toBe(false);
    }
    expect(MATERIAL_KEY_RE.test("IOH-ETHICS-03")).toBe(true);
    expect(parseMaterialKey("ECO-ADV-ECONOMETRICS-07")).toEqual({ code: "ECO-ADV-ECONOMETRICS", order: 7 });
    expect(parseMaterialKey("IOH-ETHICS-03-1")).toBeNull();
  });

  it("never shows a placeholder code", () => {
    const real = { code: "ACC401", title: "Advanced Financial Reporting", code_confirmed: true };
    const guess = { code: "ACC401", title: "Advanced Financial Reporting", code_confirmed: false };
    const placeholder = { code: "IOH-ETHICS", title: "Selected Themes in Ethics and Society", code_confirmed: false };
    expect(displayCode("CSC402")).toBe("CSC 402");
    expect(shownCode(real)).toBe("ACC 401");
    expect(shownCode(guess)).toBeNull();
    expect(courseName(placeholder)).toBe("Selected Themes in Ethics and Society");
    expect(courseFullName(real)).toBe("ACC 401 Advanced Financial Reporting");
    expect(courseFullName(placeholder)).toBe("Selected Themes in Ethics and Society");
    expect(courseName({ code: "CSC402", title: "Compilers" })).toBe("CSC 402"); // older rows: confirmed
  });

  it("names a placeholder-code course by its title in the chat context", () => {
    const ctx = chatContext({ courseCode: "IOH-ETHICS", courseTitle: "Selected Themes in Ethics and Society", courseCodeConfirmed: false, topicTitle: null });
    expect(ctx).toContain("whole course Selected Themes in Ethics and Society");
    expect(ctx).toContain("never by the code in its slide keys");
    expect(ctx).not.toMatch(/IOH/);
    expect(chatContext({ courseCode: "CSC402", courseTitle: "Compilers", topicTitle: "Parsing" })).toContain("in CSC 402 Compilers");
  });

  it("flags limited materials: fewer than 4 slides/notes files", () => {
    expect(LIMITED_MAIN_MATERIALS).toBe(4);
    const kinds = (...k: string[]) => k.map((kind) => ({ kind }));
    expect(countMain(kinds("slides", "notes", "reading", "outline", "practical", "other"))).toBe(2);
    expect(countMain(kinds("slides", "slides", "notes", "reading")) < LIMITED_MAIN_MATERIALS).toBe(true);
    expect(countMain(kinds("slides", "slides", "notes", "notes")) < LIMITED_MAIN_MATERIALS).toBe(false);
    expect(countMain(null)).toBe(0);
  });
});
