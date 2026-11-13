// Admin approval of bank-transfer payments (PRD F12, phase 2). Only an admin (ADMIN_EMAILS, checked
// on the server) can approve or reject; approve grants Finals until PLAN_END_DATE once per request,
// however many clicks; reject never grants; the price is the one locked when the student made the
// request. No emails: the student sees a pop-up in the app. The database is an in-memory
// stand-in with the SQL functions' rules (proven for real in supabase/tests/plans.sql).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let t: Record<string, Row[]>;
let authUser: { id: string; email: string } | null;

function makeDb() {
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    const match = () => (t[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      order: () => q,
      limit: () => q,
      single: async () => ({ data: match()[0] ?? null, error: match()[0] ? null : { message: "none" } }),
      maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
      upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { reference: "AYS-7K3Q" }, error: null }) }) }),
      then: (resolve: (v: unknown) => void) => resolve({ data: match(), error: null }),
    };
    return q;
  };
  const rpc = async (name: string, a: Row) => {
    // A small pause, so two clicks really overlap (the SQL row lock serialises them).
    await new Promise((r) => setTimeout(r, 1));
    const req = t.payment_requests.find((r) => r.id === a.p_request_id);
    if (name === "approve_payment_request") {
      if (!req) return { data: [{ outcome: "not_found", entitlement_id: null }], error: null };
      if (req.status === "approved") return { data: [{ outcome: "already_approved", entitlement_id: t.entitlements.find((e) => e.payment_request_id === req.id)!.id }], error: null };
      if (req.status === "rejected") return { data: [{ outcome: "rejected", entitlement_id: null }], error: null };
      const id = `ent_${t.entitlements.length + 1}`;
      t.entitlements.push({ id, user_id: req.user_id, plan: "finals", starts_at: new Date(0).toISOString(), ends_at: a.p_ends_at, source: "manual", payment_request_id: req.id });
      Object.assign(req, { status: "approved", decided_by: a.p_admin, decided_at: new Date().toISOString() });
      return { data: [{ outcome: "approved", entitlement_id: id }], error: null };
    }
    if (name === "reject_payment_request") {
      if (!req) return { data: "not_found", error: null };
      if (req.status !== "pending") return { data: `already_${req.status}`, error: null };
      Object.assign(req, { status: "rejected", note: String(a.p_note).trim() || null, decided_by: a.p_admin, decided_at: new Date().toISOString() });
      return { data: "rejected", error: null };
    }
    if (name === "create_payment_request") {
      const id = `req_${t.payment_requests.length + 1}`;
      t.payment_requests.push({ id, user_id: a.p_user_id, email: a.p_email, reference: a.p_reference, amount_naira: a.p_amount, referral_code: a.p_referral, status: "pending", created_at: new Date().toISOString() });
      return { data: [{ allowed: true, request_id: id, pending_today: 1 }], error: null };
    }
    throw new Error(name);
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
let proxyEmail: string | null = null;
vi.mock("@/lib/supabase/proxy", async () => {
  const { NextResponse } = await import("next/server");
  return { updateSession: async () => ({ response: NextResponse.next(), userId: proxyEmail ? "u" : null, email: proxyEmail }) };
});

const decide = (await import("@/app/api/admin/payments/route")).POST;
const { proxy } = await import("@/proxy");
const { PLAN_END_DATE } = await import("@/lib/plans/config");
const { NextRequest } = await import("next/server");

const OWNER = { id: "owner", email: "owner@askyourslides.com" };
const STUDENT = { id: "u1", email: "ada@pau.edu.ng" };
const call = (body: unknown) => decide(new Request("https://askyourslides.com/api/admin/payments", { method: "POST", body: JSON.stringify(body) }));
const REQ = "11111111-1111-4111-8111-111111111111";
const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

// Nothing here may call out to the network (no email service).
const net = vi.fn(async () => Response.json({}));

beforeEach(() => {
  process.env.ADMIN_EMAILS = OWNER.email;
  authUser = OWNER;
  t = {
    profiles: [{ id: "u1", created_at: "2026-11-10T10:00:00+01:00" }],
    entitlements: [],
    payment_references: [],
    payment_requests: [
      { id: REQ, user_id: "u1", email: STUDENT.email, reference: "AYS-7K3Q", amount_naira: 3000, referral_code: "TOLU", status: "pending", created_at: "2026-11-20T09:00:00+01:00" },
    ],
  };
  at("2026-11-20T10:00:00+01:00");
  vi.stubGlobal("fetch", net);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  expect(net).not.toHaveBeenCalled();
  net.mockClear();
  delete process.env.ADMIN_EMAILS;
});

describe("only admins", () => {
  it("non-admins and signed-out visitors get 404 from the API, and nothing changes", async () => {
    for (const who of [STUDENT, { id: "x", email: "someone@gmail.com" }, null]) {
      authUser = who;
      expect((await call({ id: REQ, action: "approve" })).status).toBe(404);
      expect((await call({ id: REQ, action: "reject" })).status).toBe(404);
    }
    expect(t.entitlements).toEqual([]);
    expect(t.payment_requests[0].status).toBe("pending");
  });

  it("non-admins can't open /admin/payments (404 before any rendering)", async () => {
    for (const email of [STUDENT.email, null]) {
      proxyEmail = email;
      const res = await proxy(new NextRequest("https://askyourslides.com/admin/payments"));
      expect(res.status).toBe(404);
    }
    proxyEmail = OWNER.email;
    expect((await proxy(new NextRequest("https://askyourslides.com/admin/payments"))).status).not.toBe(404);
  });
});

describe("approve", () => {
  it("grants Finals until PLAN_END_DATE and marks the request approved", async () => {
    const res = await call({ id: REQ, action: "approve" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: "approved" });
    expect(t.entitlements).toEqual([expect.objectContaining({ user_id: "u1", source: "manual", payment_request_id: REQ, ends_at: PLAN_END_DATE.toISOString() })]);
    expect(t.payment_requests[0]).toMatchObject({ status: "approved", decided_by: OWNER.email });
  });

  it("a double click (two at once, then a third) grants one plan", async () => {
    const [a, b] = await Promise.all([call({ id: REQ, action: "approve" }), call({ id: REQ, action: "approve" })]);
    const c = await call({ id: REQ, action: "approve" });
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    expect(t.entitlements).toHaveLength(1);
  });

  it("price lock: a ₦3,000 request approved after PRICE_CHANGE_DATE stays ₦3,000", async () => {
    at("2026-11-25T12:00:00+01:00");
    expect((await call({ id: REQ, action: "approve" })).status).toBe(200);
    expect(t.payment_requests[0].amount_naira).toBe(3000);
    expect(t.entitlements).toHaveLength(1);
  });
});

describe("reject", () => {
  it("never grants, keeps the note for the student, and can't then be approved", async () => {
    const res = await call({ id: REQ, action: "reject", note: " No transfer with this reference " });
    expect(res.status).toBe(200);
    expect(t.payment_requests[0]).toMatchObject({ status: "rejected", note: "No transfer with this reference" });
    expect(t.entitlements).toEqual([]);
    expect((await call({ id: REQ, action: "approve" })).status).toBe(409);
    expect(t.entitlements).toEqual([]);
  });

  it("an approved request can't be rejected", async () => {
    await call({ id: REQ, action: "approve" });
    expect((await call({ id: REQ, action: "reject" })).status).toBe(409);
    expect(t.entitlements).toHaveLength(1);
  });
});

describe("welcome pop-up", () => {
  it("planState flags a Finals plan switched on in the last 14 days, not an older one", async () => {
    const { planState } = await import("@/lib/plans/entitlement");
    const db = (await import("@/lib/supabase/admin")).adminClient();
    await call({ id: REQ, action: "approve" });
    t.entitlements[0].created_at = "2026-11-20T10:00:00+01:00";
    expect((await planState(db, "u1", new Date("2026-11-21T10:00:00+01:00"))).welcome).toEqual({ id: "ent_1", endsAt: PLAN_END_DATE.toISOString() });
    expect((await planState(db, "u1", new Date("2026-12-05T10:00:00+01:00"))).welcome).toBeNull();
  });
});
