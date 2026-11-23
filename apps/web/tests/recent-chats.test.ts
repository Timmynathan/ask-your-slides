import { describe, expect, it } from "vitest";
import { dayGroup } from "@/components/nav/recent-chats-panel";

describe("dayGroup (the rail's chat list)", () => {
  const now = new Date(2026, 10, 23, 12, 0);
  const ago = (days: number, hour = 9) => new Date(2026, 10, 23 - days, hour).toISOString();
  it("groups by calendar day, like ChatGPT", () => {
    expect(dayGroup(ago(0), now)).toBe("Today");
    expect(dayGroup(ago(1, 23), now)).toBe("Yesterday");
    expect(dayGroup(ago(3), now)).toBe("Previous 7 days");
    expect(dayGroup(ago(12), now)).toBe("Previous 30 days");
    expect(dayGroup(ago(40), now)).toBe("October 2026");
    expect(dayGroup(undefined, now)).toBe("Older");
  });
});
