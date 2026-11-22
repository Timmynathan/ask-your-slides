import { describe, expect, it } from "vitest";
import { boardName, currentStreak, longestStreak } from "@/lib/study/streak";

// 22 Nov 2026, 10:00 Lagos
const now = new Date("2026-11-22T10:00:00+01:00");
const days = (...d: string[]) => new Set(d);

describe("currentStreak", () => {
  it("counts days in a row ending today", () => {
    expect(currentStreak(days("2026-11-20", "2026-11-21", "2026-11-22"), now)).toBe(3);
  });
  it("is still alive when the last question was yesterday", () => {
    expect(currentStreak(days("2026-11-20", "2026-11-21"), now)).toBe(2);
  });
  it("is 0 after a missed day", () => {
    expect(currentStreak(days("2026-11-19", "2026-11-20"), now)).toBe(0);
  });
  it("uses the Lagos day (23:30 UTC on the 21st is already the 22nd in Lagos)", () => {
    expect(currentStreak(days("2026-11-22"), new Date("2026-11-21T23:30:00Z"))).toBe(1);
  });
  it("runs across a month end", () => {
    expect(currentStreak(days("2026-11-30", "2026-12-01"), new Date("2026-12-01T12:00:00+01:00"))).toBe(2);
  });
});

describe("longestStreak", () => {
  it("finds the longest run, not the latest", () => {
    expect(longestStreak(days("2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-10", "2026-11-11"))).toBe(4);
  });
  it("is 0 with no days", () => {
    expect(longestStreak(days())).toBe(0);
  });
});

describe("boardName", () => {
  it("first name and last initial", () => expect(boardName("timilehin ilesanmi", null)).toBe("Timilehin I."));
  it("one name", () => expect(boardName("Kika", null)).toBe("Kika"));
  it("falls back to the email", () => expect(boardName("  ", "lesley.casca-felix@pau.edu.ng")).toBe("Lesley"));
});
