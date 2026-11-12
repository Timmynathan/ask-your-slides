// Checker for step-by-step optimisation methods (Operations Research, Nov 2026): the model teaches
// the method the slides use (VAM, simplex tableau, …) step by step; this finds the true optimum so
// the model can say whether the method's answer is optimal. It never replaces the method's steps.
import solver from "javascript-lp-solver";

const MAX_VARS = 400;

export interface LpInput {
  sense: "max" | "min";
  /** Objective coefficients by variable, e.g. { x: 3, y: 5 }. */
  objective: Record<string, number>;
  /** Each: coefficients by variable, a comparison and the right-hand side. */
  constraints: { name?: string; coefficients: Record<string, number>; op: "<=" | ">=" | "="; rhs: number }[];
  /** Variables that must be whole numbers. */
  integers?: string[];
}

export interface LpResult {
  ok: boolean;
  feasible: boolean;
  bounded: boolean;
  objective: number | null;
  values: Record<string, number>;
  message?: string;
}

const round = (x: number) => Math.round(x * 1e9) / 1e9;

export function solveLp(input: LpInput): LpResult {
  const vars = new Set([...Object.keys(input.objective), ...input.constraints.flatMap((c) => Object.keys(c.coefficients))]);
  if (vars.size === 0) return { ok: false, feasible: false, bounded: false, objective: null, values: {}, message: "no variables" };
  if (vars.size > MAX_VARS) return { ok: false, feasible: false, bounded: false, objective: null, values: {}, message: `at most ${MAX_VARS} variables` };
  const OBJ = "__objective";
  const constraints: Record<string, Record<string, number>> = {};
  const variables: Record<string, Record<string, number>> = {};
  for (const v of vars) variables[v] = { [OBJ]: input.objective[v] ?? 0 };
  input.constraints.forEach((c, i) => {
    const key = `c${i}`;
    constraints[key] = c.op === "<=" ? { max: c.rhs } : c.op === ">=" ? { min: c.rhs } : { equal: c.rhs };
    for (const [v, a] of Object.entries(c.coefficients)) variables[v][key] = a;
  });
  const ints = Object.fromEntries((input.integers ?? []).filter((v) => vars.has(v)).map((v) => [v, 1 as const]));
  const r = solver.Solve({ optimize: OBJ, opType: input.sense, constraints, variables, ints }) as Record<string, number | boolean>;
  const feasible = r.feasible === true;
  const bounded = r.bounded !== false;
  const values: Record<string, number> = {};
  if (feasible) for (const v of vars) values[v] = round(typeof r[v] === "number" ? (r[v] as number) : 0);
  return {
    ok: feasible && bounded,
    feasible,
    bounded,
    objective: feasible && bounded ? round(r.result as number) : null,
    values,
    ...(!feasible ? { message: "no solution satisfies every constraint" } : !bounded ? { message: "the objective can grow without limit" } : {}),
  };
}

export interface TransportInput {
  sources: { name: string; supply: number }[];
  destinations: { name: string; demand: number }[];
  /** costs[i][j]: unit cost from source i to destination j. */
  costs: number[][];
}

export interface TransportResult {
  ok: boolean;
  total_cost: number | null;
  /** Non-zero shipments: from, to, quantity, unit cost. */
  shipments: { from: string; to: string; quantity: number; unit_cost: number }[];
  balanced: boolean;
  dummy?: string;
  message?: string;
}

/** Minimum-cost transportation plan. Unbalanced problems get a zero-cost dummy row or column,
 *  the way the slides balance them. */
export function solveTransport(input: TransportInput): TransportResult {
  const { sources, destinations, costs } = input;
  if (costs.length !== sources.length || costs.some((row) => row.length !== destinations.length)) {
    return { ok: false, total_cost: null, shipments: [], balanced: false, message: "costs must have one row per source and one column per destination" };
  }
  const supply = sources.reduce((s, x) => s + x.supply, 0);
  const demand = destinations.reduce((s, x) => s + x.demand, 0);
  const S = [...sources];
  const D = [...destinations];
  const C = costs.map((r) => [...r]);
  let dummy: string | undefined;
  if (supply > demand) {
    dummy = "Dummy destination";
    D.push({ name: dummy, demand: supply - demand });
    C.forEach((r) => r.push(0));
  } else if (demand > supply) {
    dummy = "Dummy source";
    S.push({ name: dummy, supply: demand - supply });
    C.push(D.map(() => 0));
  }
  const v = (i: number, j: number) => `x_${i}_${j}`;
  const objective: Record<string, number> = {};
  const constraints: LpInput["constraints"] = [];
  S.forEach((s, i) => {
    const co: Record<string, number> = {};
    D.forEach((_, j) => {
      objective[v(i, j)] = C[i][j];
      co[v(i, j)] = 1;
    });
    constraints.push({ coefficients: co, op: "=", rhs: s.supply });
  });
  D.forEach((d, j) => {
    const co: Record<string, number> = {};
    S.forEach((_, i) => (co[v(i, j)] = 1));
    constraints.push({ coefficients: co, op: "=", rhs: d.demand });
  });
  const r = solveLp({ sense: "min", objective, constraints });
  if (!r.ok) return { ok: false, total_cost: null, shipments: [], balanced: !dummy, dummy, message: r.message };
  const shipments: TransportResult["shipments"] = [];
  S.forEach((s, i) =>
    D.forEach((d, j) => {
      const q = r.values[v(i, j)];
      if (q > 1e-9) shipments.push({ from: s.name, to: d.name, quantity: q, unit_cost: C[i][j] });
    }),
  );
  return { ok: true, total_cost: r.objective, shipments, balanced: !dummy, ...(dummy ? { dummy } : {}) };
}
