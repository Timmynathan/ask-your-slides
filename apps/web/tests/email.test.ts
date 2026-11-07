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
