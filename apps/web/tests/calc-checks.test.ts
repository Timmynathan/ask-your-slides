import { describe, expect, it } from "vitest";
import { checkNumbers, hasNumber, numbersIn } from "@/lib/evals/checks.mts";

describe("number checks for calculation golden cases", () => {
  it("reads numbers the way answers write them", () => {
    expect(numbersIn("FV = ₦9,505,468.75 [[s:FIN413-06-26]]")).toEqual([9505468.75]);
    expect(numbersIn("$$K_e = 24.8\\%$$ and $$5{,}000{,}000$$")).toEqual([24.8, 5000000]);
    expect(numbersIn("a total of 1 000 000 units")).toEqual([1000000]);
    expect(numbersIn("Plant A's is about −N151,093; B is negative ₦184,072.13 or (N5,000)")).toEqual([-151093, -184072.13, -5000]);
  });

  it("matches rates as decimals or percentages, within the slides' rounding", () => {
    expect(hasNumber([24.8], 0.248)).toBe(24.8);
    expect(hasNumber([0.248], 24.8)).toBe(0.248);
    expect(hasNumber([15.3], 15.29)).toBe(15.3);
    expect(hasNumber([16], 15.29)).toBeNull();
  });

  it("knows whether the stated number came from the calculator", () => {
    const r = checkNumbers("So $$K_e = 24.8\\%$$ and WACC is 17.5%.", [
      { label: "Ke", any: [0.248] },
      { label: "WACC", any: [0.175] },
      { label: "Kd", any: [0.07] },
    ], ["0.248"]);
    expect(r).toEqual([
      { label: "Ke", found: 24.8, fromTool: true },
      { label: "WACC", found: 17.5, fromTool: false },
      { label: "Kd", found: null, fromTool: false },
    ]);
    // ₦4.49m in the answer, 4,490,000 from the tool: the same number.
    expect(checkNumbers("Total ₦4.49m.", [{ label: "total", any: [4.49, 4490000] }], ["4490000"])[0].fromTool).toBe(true);
  });
});
