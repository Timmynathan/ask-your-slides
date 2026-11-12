import { describe, expect, it } from "vitest";
import { calculate, show } from "@/lib/agent/calculator";

const last = (steps: Parameters<typeof calculate>[0]) => {
  const r = calculate(steps);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.steps.at(-1)!;
};

describe("calculate (worked examples from the PAU slides)", () => {
  it("CAPM and WACC in named steps (ACC404 Cost of Capital, Linda Nig. Plc)", () => {
    const r = calculate([
      { name: "ke", expr: "0.03 + 1.5 * 0.05" },
      { name: "kd", expr: "0.12 * (1 - 0.3)" },
      { name: "wacc", expr: "wavg([ke, kd], [60, 40])" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.value)).toEqual(["0.105", "0.084", "0.0966"]);
    expect(r.steps[2].number).toBeCloseTo(0.0966, 10);
  });

  it("no floating-point noise in what the student sees", () => {
    expect(last([{ expr: "0.1 + 0.2" }]).value).toBe("0.3");
    expect(show(1 / 3)).toBe("0.333333333333");
  });

  it("transportation total (ECO Operations Research, VAM example)", () => {
    expect(last([{ expr: "50*18 + 40*19 + 20*18 + 10*24 + 30*28 + 10*25" }]).value).toBe("3350");
  });

  it("finance helpers: NPV (flow 0 today), IRR, annuities", () => {
    expect(last([{ expr: "npv(0.1, [-1000, 500, 500, 500])" }]).number).toBeCloseTo(243.426, 3);
    expect(last([{ expr: "irr([-1000, 500, 500, 500])" }]).number).toBeCloseTo(0.23375, 4);
    expect(last([{ expr: "pv(0.08, 5, 100)" }]).number).toBeCloseTo(399.271, 3);
    expect(last([{ expr: "fv(0.05, 10, 0, 1000)" }]).number).toBeCloseTo(1628.895, 3);
    expect(last([{ expr: "pmt(0.01, 12, 1000)" }]).number).toBeCloseTo(88.849, 3);
    expect(last([{ expr: "discount(0.1, 2)" }]).number).toBeCloseTo(0.826446, 6);
    expect(last([{ expr: "cagr(100, 200, 5)" }]).number).toBeCloseTo(0.148698, 6);
  });

  it("dividend growth model and redeemable debt (ACC404 formulas)", () => {
    // Ke = D0(1+g)/P0 + g
    expect(last([{ expr: "15 * (1 + 0.05) / 150 + 0.05" }]).value).toBe("0.155");
    // Kd (redeemable, after tax): IRR of the after-tax flows
    expect(last([{ expr: "irr([-95, 7, 7, 7, 107])" }]).number).toBeCloseTo(0.0852, 3);
  });

  it("engineering units (Mechatronics, Applied Design)", () => {
    expect(last([{ expr: "5 kN / 20 cm^2 to MPa" }]).value).toBe("2.5 MPa");
    expect(last([{ expr: "1500 rpm to Hz" }]).value).toBe("25 Hz");
    expect(last([{ expr: "1500 * 2 * pi / 60" }]).number).toBeCloseTo(157.0796, 4); // rad/s
  });

  it("statistics and least squares (Econometrics)", () => {
    expect(last([{ expr: "mean([2, 4, 6, 8])" }]).value).toBe("5");
    expect(last([{ expr: "std([2, 4, 4, 4, 5, 5, 7, 9], 'uncorrected')" }]).value).toBe("2");
    // y = 1 + 2x exactly
    const b = last([{ expr: "ols([[1, 1], [1, 2], [1, 3], [1, 4]], [3, 5, 7, 9])" }]).value;
    expect(b.replace(/\s/g, "")).toMatch(/^\[1(\.0+)?,2(\.0+)?\]$/);
  });

  it("reports the failing step so the model can fix it", () => {
    const r = calculate([{ name: "a", expr: "2 * 3" }, { name: "b", expr: "a / 0" }]);
    expect(r.ok).toBe(false);
    expect(r.steps).toHaveLength(1);
    expect(r.error).toMatchObject({ step: 2, message: expect.stringMatching(/finite/) });
    expect(calculate([{ expr: "unknownThing + 1" }]).error?.message).toMatch(/Undefined symbol/);
  });

  it("is a sandbox: no import, parse, evaluate or huge allocations", () => {
    for (const expr of [
      'import({x: 1})',
      'evaluate("1+1")',
      'parse("1+1")',
      'createUnit("foo")',
      "zeros(5000, 5000)",
      "range(1, 1e9)",
      "random()",
      "x".repeat(700),
    ]) {
      expect(calculate([{ expr }]).ok, expr).toBe(false);
    }
    expect(calculate([{ name: "bad name", expr: "1" }]).ok).toBe(false);
    expect(last([{ expr: "zeros(2, 3)" }]).value).toBe("[[0, 0, 0], [0, 0, 0]]");
    expect(last([{ expr: "inv([[2, 0], [0, 4]])" }]).value).toBe("[[0.5, 0], [0, 0.25]]");
  });
});
