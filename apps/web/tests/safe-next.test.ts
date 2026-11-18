import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/next";

// Signed-in students who open /sign-up?next=/pay (landing "Lock in Finals") go to /pay, not the dashboard.
describe("safeNext", () => {
  it("keeps in-app paths", () => {
    expect(safeNext("/pay")).toBe("/pay");
    expect(safeNext("/study/CSC420")).toBe("/study/CSC420");
  });
  it("refuses other sites and sign-in/sign-up loops", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "/sign-in", "/sign-up?next=/pay", "/api/x", null]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
