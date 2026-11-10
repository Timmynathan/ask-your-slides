import { describe, expect, it } from "vitest";
import { nextCode, pillQueue } from "@/lib/landing-pills";

const CODES = ["CSC402", "CSC409", "CSC412", "CSC418", "CSC419", "CSC420", "INS401", "CMS411", "ISM403", "ISM410", "ISM411", "ISM412", "ISM413", "ISM414", "ISM415"];

describe("landing course pills", () => {
  it("mixes programmes from the start: CSC, INS, ISM, then others, round-robin", () => {
    const q = pillQueue(CODES);
    expect(q.slice(0, 6)).toEqual(["CSC402", "INS401", "ISM403", "CMS411", "CSC409", "ISM410"]);
    expect([...q].sort()).toEqual([...CODES].sort()); // every course, once
  });
  it("swaps in the next code that isn't already showing", () => {
    const q = pillQueue(CODES);
    const showing = q.slice(0, 6);
    const n = nextCode(q, showing, 5)!;
    expect(showing).not.toContain(n.code);
    expect(n.code).toBe(q[6]);
    expect(nextCode(["A", "B"], ["A", "B"], 1)).toBeNull();
  });
});
