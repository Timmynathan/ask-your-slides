import { describe, expect, it } from "vitest";
import { isOtpCode, isPauEmail, normalizeEmail } from "@/lib/auth/email";

// Same cases as supabase/tests/phase3.sql: the app check and the DB hook must agree.
describe("isPauEmail", () => {
  it.each(["student@pau.edu.ng", "Student.Name@PAU.EDU.NG", "  a.b-c+d@pau.edu.ng ", "o'neil@pau.edu.ng"])(
    "accepts %s",
    (e) => expect(isPauEmail(e)).toBe(true),
  );
  it.each([
    "someone@gmail.com", "x@cs.pau.edu.ng", "x@pau.edu.ng.evil.com", "x@notpau.edu.ng",
    "a@pau.edu.ng@gmail.com", "pau.edu.ng", "", "x @pau.edu.ng", null, 42,
  ])("rejects %s", (e) => expect(isPauEmail(e)).toBe(false));
  it("normalizes case and spaces", () => expect(normalizeEmail("  A@PAU.edu.ng ")).toBe("a@pau.edu.ng"));
});

describe("isOtpCode", () => {
  it("accepts 6–10 digits", () => {
    expect(isOtpCode("123456")).toBe(true);
    expect(isOtpCode(" 12345678 ")).toBe(true);
  });
  it("rejects anything else", () => {
    for (const c of ["12345", "abcdef", "12 3456", "", undefined]) expect(isOtpCode(c)).toBe(false);
  });
});

import { passwordProblem } from "@/lib/auth/email";
describe("passwordProblem", () => {
  it("accepts 8+ characters", () => expect(passwordProblem("revise4exams")).toBeNull());
  it("rejects short, missing or over-long passwords", () => {
    expect(passwordProblem("short")).toMatch(/at least 8/);
    expect(passwordProblem(undefined)).toMatch(/at least 8/);
    expect(passwordProblem("é".repeat(40))).toMatch(/too long/); // 80 bytes
  });
});

import { safeNext } from "@/lib/auth/next";
describe("safeNext", () => {
  it("keeps in-app paths", () => {
    expect(safeNext("/study/CSC420")).toBe("/study/CSC420");
    expect(safeNext("/study/CSC420?topic=1")).toBe("/study/CSC420?topic=1");
  });
  it("refuses anything that could leave the app or loop", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "/sign-in", "/welcome?next=/x", "/api/chat", 42, null]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
