// Paystack (PRD F12, phase 2): a plan is granted only after the server has confirmed the payment
// with Paystack, once per reference; a forged or replayed webhook never grants. Paystack's API is
// mocked (no network); the database is an in-memory stand-in with grant_finals' rule (one plan
// per reference).
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "sk_test_unit";
type Row = Record<string, unknown>;
let t: Record<string, Row[]>;
let authUser: { id: string; email: string } | null;

function makeDb() {
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let patch: Row | null = null;
    const match = () => (t[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      update: (p: Row) => ((patch = p), q),
      insert: async (row: Row) => ((t[table] ??= []).push({ ...row }), { data: null, error: null }),
      single: async () => ({ data: match()[0] ?? null, error: match()[0] ? null : { message: "none" } }),
      maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (patch) match().forEach((r) => Object.assign(r, patch));
        resolve({ data: patch ? null : match(), error: null });
      },
    };
    return q;
  };
  const rpc = async (name: string, a: Row) => {
    if (name !== "grant_finals") throw new Error(name);
    const existing = t.entitlements.find((e) => e.paystack_reference === a.p_reference);
    if (existing) return { data: existing.id, error: null };
    const id = `ent_${t.entitlements.length + 1}`;
    t.entitlements.push({ id, user_id: a.p_user_id, plan: "finals", starts_at: new Date(0).toISOString(), ends_at: a.p_ends_at, source: a.p_source, paystack_reference: a.p_reference });
    return { data: id, error: null };
  };
  return { from, rpc };
}

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => makeDb(),
  must: <T,>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authUser } }) } }) }));

const { validSignature, secretKey } = await import("@/lib/plans/paystack");
const webhook = (await import("@/app/api/pay/webhook/route")).POST;
const checkout = (await import("@/app/api/pay/checkout/route")).POST;
const verify = (await import("@/app/api/pay/verify/route")).GET;

const REF = `ays_${"a".repeat(32)}`;
const sign = (body: string, key = KEY) => createHmac("sha512", key).update(body).digest("hex");
const hook = (body: string, signature: string | null) =>
  webhook(new Request("http://localhost/api/pay/webhook", { method: "POST", body, headers: signature ? { "x-paystack-signature": signature } : {} }));
const chargeSuccess = (reference = REF, amount = 300000) =>
  JSON.stringify({ event: "charge.success", data: { reference, status: "success", amount, currency: "NGN" } });

/** What Paystack's verify endpoint says about each reference. */
let paystack: Record<string, { status: string; amount: number; currency: string }>;
const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  if (u.includes("/transaction/verify/")) {
    const ref = decodeURIComponent(u.split("/").pop()!);
    const tx = paystack[ref];
    return Response.json(tx ? { status: true, data: { reference: ref, ...tx } } : { status: false, message: "not found" }, { status: tx ? 200 : 400 });
  }
  if (u.endsWith("/transaction/initialize")) {
    const body = JSON.parse(String(init?.body));
    return Response.json({ status: true, data: { authorization_url: `https://checkout.paystack.com/${body.reference}`, reference: body.reference } });
  }
  throw new Error(`unexpected fetch ${u}`);
});

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = KEY;
  delete process.env.PAYSTACK_LIVE;
  authUser = { id: "u1", email: "ada@pau.edu.ng" };
  t = {
    profiles: [{ id: "u1", created_at: "2026-11-10T10:00:00+01:00" }, { id: "u2", created_at: "2026-11-10T10:00:00+01:00" }],
    payments: [{ id: "p1", user_id: "u1", reference: REF, plan: "finals", amount_kobo: 300000, currency: "NGN", status: "pending" }],
    entitlements: [],
  };
  paystack = { [REF]: { status: "success", amount: 300000, currency: "NGN" } };
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockClear();
});

describe("webhook signature", () => {
  it("accepts Paystack's HMAC-SHA512 of the raw body, nothing else", () => {
    const body = chargeSuccess();
    expect(validSignature(body, sign(body), KEY)).toBe(true);
    expect(validSignature(body, sign(body, "sk_test_other"), KEY)).toBe(false);
    expect(validSignature(body + " ", sign(body), KEY)).toBe(false); // tampered body
    expect(validSignature(body, null, KEY)).toBe(false);
    expect(validSignature(body, "abc", KEY)).toBe(false);
  });

  it("refuses a live key until PAYSTACK_LIVE=1", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_live_x";
    expect(() => secretKey()).toThrow(/test mode/);
    process.env.PAYSTACK_LIVE = "1";
    expect(secretKey()).toBe("sk_live_x");
  });
});

describe("POST /api/pay/webhook", () => {
  it("a forged signature never grants (and never reaches Paystack or the database)", async () => {
    const body = chargeSuccess();
    expect((await hook(body, sign(body, "sk_test_attacker"))).status).toBe(401);
    expect((await hook(body, null)).status).toBe(401);
    expect(t.entitlements).toEqual([]);
    expect(t.payments[0].status).toBe("pending");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a valid charge.success grants Finals once; replays grant nothing more", async () => {
    const body = chargeSuccess();
    for (let i = 0; i < 3; i++) expect((await hook(body, sign(body))).status).toBe(200);
    expect(t.entitlements).toHaveLength(1);
    expect(t.entitlements[0]).toMatchObject({ user_id: "u1", source: "paystack", paystack_reference: REF });
    expect(t.payments[0]).toMatchObject({ status: "success" });
  });

  it("grants only what Paystack's verify endpoint confirms, not the webhook body", async () => {
    paystack[REF] = { status: "failed", amount: 300000, currency: "NGN" };
    const body = chargeSuccess();
    await hook(body, sign(body));
    expect(t.entitlements).toEqual([]);
    expect(t.payments[0].status).toBe("failed");
  });

  it("an underpayment (less than the server's price) never grants", async () => {
    paystack[REF] = { status: "success", amount: 100, currency: "NGN" };
    const body = chargeSuccess(REF, 100);
    expect(await (await hook(body, sign(body))).json()).toMatchObject({ outcome: "mismatch" });
    expect(t.entitlements).toEqual([]);
    expect(t.payments[0].status).toBe("pending");
  });

  it("an unknown reference grants nothing", async () => {
    const other = `ays_${"b".repeat(32)}`;
    paystack[other] = { status: "success", amount: 300000, currency: "NGN" };
    const body = chargeSuccess(other);
    expect(await (await hook(body, sign(body))).json()).toMatchObject({ outcome: "unknown_reference" });
    expect(t.entitlements).toEqual([]);
  });
});

describe("POST /api/pay/checkout", () => {
  const start = (body: unknown = {}) => checkout(new Request("http://localhost/api/pay/checkout", { method: "POST", body: JSON.stringify(body) }));

  it("₦3,000 before PRICE_CHANGE_DATE, decided and stored by the server", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-22T23:58:00+01:00"));
    const res = await start({ referral_code: " tolu ", amount: 1 });
    const json = await res.json();
    expect(json.amount).toBe(3000);
    const p = t.payments.at(-1)!;
    expect(p).toMatchObject({ user_id: "u1", amount_kobo: 300000, status: "pending", referral_code: "TOLU" });
    const sent = JSON.parse(String(fetchMock.mock.calls.at(-1)![1]!.body));
    expect(sent).toMatchObject({ amount: 300000, email: "ada@pau.edu.ng", channels: ["card", "bank_transfer", "ussd"], callback_url: "http://localhost/pay/return" });
    expect(json.authorization_url).toContain(p.reference as string);
  });

  it("₦5,000 from PRICE_CHANGE_DATE", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-22T23:59:00+01:00"));
    expect((await (await start()).json()).amount).toBe(5000);
    expect(t.payments.at(-1)).toMatchObject({ amount_kobo: 500000, referral_code: null });
  });

  it("refuses a student who already has Finals, and signed-out visitors", async () => {
    t.entitlements.push({ id: "e", user_id: "u1", plan: "finals", starts_at: "2026-11-01T00:00:00Z", ends_at: "2099-01-01T00:00:00Z", paystack_reference: "x" });
    expect((await start()).status).toBe(409);
    authUser = null;
    expect((await start()).status).toBe(401);
  });
});

describe("GET /api/pay/verify", () => {
  const check = (ref: string) => verify(new Request(`http://localhost/api/pay/verify?reference=${ref}`));

  it("grants after Paystack confirms, even before the webhook; then webhook + verify still grant once", async () => {
    expect(await (await check(REF)).json()).toMatchObject({ status: "success", plan: "finals" });
    const body = chargeSuccess();
    await hook(body, sign(body));
    await check(REF);
    expect(t.entitlements).toHaveLength(1);
  });

  it("someone else's reference is not found", async () => {
    authUser = { id: "u2", email: "b@pau.edu.ng" };
    expect((await check(REF)).status).toBe(404);
    expect(t.entitlements).toEqual([]);
  });
});
