import { describe, expect, it } from "vitest";
import { solveLp, solveTransport } from "@/lib/agent/optimizer";

describe("optimizer (checks Operations Research answers)", () => {
  it("LP: maximise with <= constraints", () => {
    const r = solveLp({
      sense: "max",
      objective: { brit: 20000, yank: 30000 },
      constraints: [
        { coefficients: { brit: 1, yank: 1 }, op: "<=", rhs: 44 },
        { coefficients: { brit: 8, yank: 16 }, op: "<=", rhs: 512 },
        { coefficients: { brit: 5000, yank: 9000 }, op: "<=", rhs: 300000 },
      ],
    });
    expect(r).toMatchObject({ ok: true, objective: 1080000, values: { brit: 24, yank: 20 } });
  });

  it("LP: infeasible and unbounded are reported, not guessed", () => {
    expect(solveLp({ sense: "max", objective: { x: 1 }, constraints: [{ coefficients: { x: 1 }, op: "<=", rhs: 1 }, { coefficients: { x: 1 }, op: ">=", rhs: 2 }] }))
      .toMatchObject({ ok: false, feasible: false });
    expect(solveLp({ sense: "max", objective: { x: 1 }, constraints: [{ coefficients: { x: 1 }, op: ">=", rhs: 2 }] }))
      .toMatchObject({ ok: false, bounded: false });
  });

  it("transportation: the slides' VAM example (3,350) is checked against the optimum", () => {
    const r = solveTransport({
      sources: [{ name: "A", supply: 50 }, { name: "B", supply: 60 }, { name: "C", supply: 50 }],
      destinations: [{ name: "X", demand: 50 }, { name: "Y", demand: 70 }, { name: "W", demand: 30 }, { name: "Z", demand: 10 }],
      costs: [[21, 18, 27, 22], [19, 18, 24, 20], [24, 25, 28, 25]],
    });
    expect(r.ok && r.balanced).toBe(true);
    expect(r.total_cost).toBe(3350); // VAM happens to be optimal here
    expect(r.shipments.reduce((s, x) => s + x.quantity * x.unit_cost, 0)).toBeCloseTo(r.total_cost!, 6);
  });

  it("transportation: an unbalanced problem gets a dummy, like the slides", () => {
    const r = solveTransport({
      sources: [{ name: "I", supply: 40 }, { name: "II", supply: 20 }, { name: "III", supply: 50 }],
      destinations: [{ name: "A", demand: 25 }, { name: "B", demand: 25 }, { name: "C", demand: 42 }, { name: "D", demand: 8 }],
      costs: [[3, 16, 9, 2], [1, 9, 3, 7], [8, 4, 11, 5]],
    });
    expect(r).toMatchObject({ ok: true, balanced: false, dummy: "Dummy destination" });
    expect(r.shipments.filter((s) => s.to === "Dummy destination").reduce((a, s) => a + s.quantity, 0)).toBe(10);
  });

  it("refuses mismatched cost tables", () => {
    expect(solveTransport({ sources: [{ name: "A", supply: 1 }], destinations: [{ name: "X", demand: 1 }], costs: [[1, 2]] }).ok).toBe(false);
  });
});
