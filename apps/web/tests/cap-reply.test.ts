import { describe, expect, it } from "vitest";
import { capReply } from "@/lib/plans/offer";

// After today's limit the chat box stays open; each question gets this reply (owner, 19 Nov 2026).
describe("capReply", () => {
  const reset = "2026-11-19T23:00:00.000Z"; // midnight in Lagos, start of Fri 20 Nov

  it("names the premium limit, the exact reset time in Lagos and how long is left", () => {
    expect(capReply("premium_cap", reset, Date.parse("2026-11-19T15:30:00Z"))).toBe(
      "Your premium limit is reached. That's it for today. It resets at 12:00 am WAT on Fri 20 Nov (in 7h 30m).",
    );
  });

  it("names the daily limit", () => {
    expect(capReply("daily_cap", reset, Date.parse("2026-11-19T22:00:00Z"))).toMatch(/^Your daily limit is reached\..*12:00 am WAT on Fri 20 Nov \(in 1h 0m\)\.$/);
  });

  it("still reads well without a reset time, or once it has passed", () => {
    expect(capReply("daily_cap", null, 0)).toBe("Your daily limit is reached. That's it for today. It resets at midnight (WAT).");
    expect(capReply("daily_cap", reset, Date.parse("2026-11-20T00:00:00Z"))).not.toContain("(in");
  });
});
