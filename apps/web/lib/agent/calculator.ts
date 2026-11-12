// Calculator for calculation courses (PRD F11, Nov 2026): the model writes the calculation, the
// server works out the numbers. mathjs evaluates expressions without running code; the functions
// that could define new behaviour or allocate huge arrays are switched off.
//
// One call = a few named steps in one scope, so later steps can use earlier results:
//   ke = 0.03 + 1.5 * 0.05          → 0.105
//   kd = 0.12 * (1 - 0.3)           → 0.084
//   wacc = wavg([ke, kd], [60, 40]) → 0.0966
import { all, create, type MathJsInstance } from "mathjs";

const MAX_STEPS = 30;
const MAX_EXPR = 600;
const MAX_ELEMENTS = 10_000;

const math: MathJsInstance = create(all, { number: "number", precision: 64 });
const evaluate = math.evaluate.bind(math);

function refuse(name: string) {
  return () => {
    throw new Error(`${name} is not available in this calculator`);
  };
}

function capped<T extends (...a: never[]) => unknown>(name: string, fn: T, size: (...a: Parameters<T>) => number): T {
  return ((...a: Parameters<T>) => {
    if (size(...a) > MAX_ELEMENTS) throw new Error(`${name}: at most ${MAX_ELEMENTS} elements`);
    return fn(...a);
  }) as T;
}

const dims = (...a: unknown[]) => a.filter((x) => typeof x === "number").reduce((p: number, x) => p * Math.abs(x as number), 1);
const { zeros, ones, identity, range } = math;

// ── finance helpers (textbook convention: positive amounts; cash flow 0 is today) ──────────
const toArr = (v: unknown): number[] => {
  const raw = math.isMatrix(v) ? (v as { toArray(): unknown[] }).toArray() : v;
  if (!Array.isArray(raw)) throw new Error("expected a list of numbers, e.g. [-1000, 400, 500]");
  return raw.flat(Infinity).map(Number);
};

function npv(rate: number, flows: unknown): number {
  return toArr(flows).reduce((s, cf, t) => s + cf / (1 + rate) ** t, 0);
}

function irr(flows: unknown): number {
  const cf = toArr(flows);
  if (!cf.some((x) => x < 0) || !cf.some((x) => x > 0)) throw new Error("irr needs both negative and positive cash flows");
  // Bisection on a bracket where NPV changes sign: always converges, no starting guess needed.
  let lo = -0.9999;
  let hi = 10;
  const f = (r: number) => npv(r, cf);
  if (f(lo) * f(hi) > 0) throw new Error("no IRR between -99.99% and 1000%");
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

const annuity = (rate: number, n: number) => (rate === 0 ? n : (1 - (1 + rate) ** -n) / rate);
const pv = (rate: number, n: number, payment: number, future = 0) => payment * annuity(rate, n) + future / (1 + rate) ** n;
const fv = (rate: number, n: number, payment: number, present = 0) =>
  present * (1 + rate) ** n + (rate === 0 ? payment * n : payment * (((1 + rate) ** n - 1) / rate));
const pmt = (rate: number, n: number, present: number, future = 0) =>
  (present - future / (1 + rate) ** n) / annuity(rate, n);
const discount = (rate: number, n: number) => (1 + rate) ** -n;
const cagr = (start: number, end: number, years: number) => (end / start) ** (1 / years) - 1;

function wavg(values: unknown, weights: unknown): number {
  const v = toArr(values);
  const w = toArr(weights);
  if (v.length !== w.length) throw new Error("wavg: values and weights must be the same length");
  const total = w.reduce((a, b) => a + b, 0);
  return v.reduce((s, x, i) => s + x * w[i], 0) / total;
}

/** Least squares: coefficients b of y = X b (include a column of 1s in X for an intercept). */
function ols(X: unknown, y: unknown) {
  const Xm = math.matrix(X as number[][]);
  const yv = math.matrix(toArr(y));
  const Xt = math.transpose(Xm);
  return math.multiply(math.inv(math.multiply(Xt, Xm)), math.multiply(Xt, yv));
}

math.import(
  {
    npv, irr, pv, fv, pmt, annuity, discount, cagr, wavg, ols,
    zeros: capped("zeros", zeros as never, dims),
    ones: capped("ones", ones as never, dims),
    identity: capped("identity", identity as never, (n: number) => n * n),
    range: capped("range", range as never, (a: number, b: number, s = 1) => (typeof a === "number" && typeof b === "number" ? Math.abs((b - a) / s) : 0)),
  },
  { override: true },
);
// Units the engineering slides use that mathjs lacks.
math.createUnit("rpm", "1 / minute");
// mathjs security guidance: nothing that parses, defines or imports from inside an expression.
math.import(
  {
    import: refuse("import"), createUnit: refuse("createUnit"), evaluate: refuse("evaluate"), parse: refuse("parse"),
    simplify: refuse("simplify"), derivative: refuse("derivative"), resolve: refuse("resolve"), compile: refuse("compile"),
    random: refuse("random"), randomInt: refuse("randomInt"), pickRandom: refuse("pickRandom"),
  },
  { override: true },
);

export interface CalcStep {
  name?: string;
  expr: string;
}

export interface CalcResult {
  ok: boolean;
  steps: { name: string | null; expr: string; value: string; number?: number }[];
  error?: { step: number; expr: string; message: string };
}

/** Human-readable value: 12 significant digits, no float noise (0.1 + 0.2 → 0.3). */
export function show(v: unknown): string {
  return math.format(v as never, { precision: 12, lowerExp: -9, upperExp: 15 });
}

export function calculate(steps: CalcStep[]): CalcResult {
  const scope = new Map<string, unknown>();
  const out: CalcResult["steps"] = [];
  for (const [i, s] of steps.slice(0, MAX_STEPS).entries()) {
    const expr = s.expr.trim();
    const name = s.name?.trim() || null;
    try {
      if (expr.length > MAX_EXPR) throw new Error(`expression longer than ${MAX_EXPR} characters`);
      if (name && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`name "${name}" must be letters, digits or _`);
      const value = evaluate(name ? `${name} = ${expr}` : expr, scope);
      if (math.isMatrix(value) && (value as { size(): number[] }).size().reduce((a: number, b: number) => a * b, 1) > MAX_ELEMENTS) {
        throw new Error("result too large");
      }
      const n = typeof value === "number" ? value : undefined;
      if (n !== undefined && !Number.isFinite(n)) throw new Error("the result is not a finite number (division by zero?)");
      out.push({ name, expr, value: show(value), ...(n !== undefined ? { number: n } : {}) });
    } catch (e) {
      return { ok: false, steps: out, error: { step: i + 1, expr, message: e instanceof Error ? e.message : String(e) } };
    }
  }
  return { ok: true, steps: out };
}
