// Manual bank-transfer payments (PRD F12, phase 1): "I've sent it" records ONE pending request at
// the server's price, with the student's reference, and hands back a correctly encoded wa.me link.
// It never grants Finals. The database is an in-memory stand-in with create_payment_request's rule
// (at most MAX_PENDING_REQUESTS_A_DAY pending since the start of the Lagos day); the SQL itself is
// proven in supabase/tests/plans.sql.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let t: Record<string, Row[]>;
let authUser: { id: string; email: string } | null;
let refDraws: string[];

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
      upsert: (row: Row) => {
        const rows = (t[table] ??= []);
        let result: { data: Row | null; error: { code: string; message: string } | null };
        if (rows.some((r) => r.user_id === row.user_id)) result = { data: null, error: null };
        else if (rows.some((r) => r.reference === row.reference)) result = { data: null, error: { code: "23505", message: "duplicate reference" } };
        else {
          rows.push({ ...row });
          result = { data: { reference: row.reference }, error: null };
        }
        const done = { select: () => done, maybeSingle: async () => result };
        return done;
      },
      then: (resolve: (v: unknown) => void) => resolve({ data: match(), error: null }),
    };
    return q;
  };
  const rpc = async (name: string, a: Row) => {
    if (name !== "create_payment_request") throw new Error(name);
    const since = new Date(a.p_since as string).getTime();
    const pending = t.payment_requests.filter((r) => r.user_id === a.p_user_id && r.status === "pending" && new Date(r.created_at as string).getTime() >= since).length;
    if (pending >= (a.p_max_pending as number)) return { data: [{ allowed: false, request_id: null, pending_today: pending }], error: null };
    const id = `req_${t.payment_requests.length + 1}`;
    t.payment_requests.push({
      id,
      user_id: a.p_user_id,
      email: a.p_email,
      reference: a.p_reference,
      amount_naira: a.p_amount,
      referral_code: a.p_referral,
      status: "pending",
      created_at: new Date().toISOString(),
    });
    return { data: [{ allowed: true, request_id: id, pending_today: pending + 1 }], error: null };
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
// Deterministic reference draws: the characters of refDraws, in order (AYS-TAKN is taken).
vi.mock("node:crypto", async (orig) => ({
  ...(await orig<typeof import("node:crypto")>()),
  randomInt: () => {
    const c = refDraws.join("")[0];
    refDraws = [refDraws.join("").slice(1)];
    return "23456789ABCDEFGHJKMNPQRSTUVWXYZ".indexOf(c);
  },
}));

const POST = (await import("@/app/api/pay/request/route")).POST;
const { paymentDetails, whatsappText, whatsappUrl, cleanReferral } = await import("@/lib/plans/manual-pay");

const ENV = { BANK_NAME: "Opay", BANK_ACCOUNT_NUMBER: "8132265016", BANK_ACCOUNT_NAME: "Ilesanmi Oluwatimilehin", WHATSAPP_NUMBER: "+234 800 000 0000" };
const send = (body: unknown = {}) => POST(new Request("http://localhost/api/pay/request", { method: "POST", body: JSON.stringify(body) }));
const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

beforeEach(() => {
  Object.assign(process.env, ENV);
  authUser = { id: "u1", email: "Ada.Obi@pau.edu.ng" };
  refDraws = ["TAKN", "7K3Q"];
  t = {
    profiles: [{ id: "u1", created_at: "2026-11-10T10:00:00+01:00" }],
    entitlements: [],
    payment_references: [{ user_id: "someone-else", reference: "AYS-TAKN" }],
    payment_requests: [],
  };
  at("2026-11-16T12:00:00+01:00");
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of Object.keys(ENV)) delete process.env[k];
});

describe("POST /api/pay/request", () => {
  it("creates one pending row at the server's price and returns a correctly encoded wa.me link", async () => {
    const res = await send({ referral_code: " tolu ", amount: 1 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ status: "pending", amount: 3000, reference: "AYS-7K3Q" });
    expect(t.payment_requests).toEqual([
      expect.objectContaining({ user_id: "u1", email: "ada.obi@pau.edu.ng", reference: "AYS-7K3Q", amount_naira: 3000, referral_code: "TOLU", status: "pending" }),
    ]);
    const text = "Hi, I've paid ₦3,000 for AskYourSlides Finals. Email: ada.obi@pau.edu.ng. Reference: AYS-7K3Q.";
    expect(json.whatsapp_url).toBe(`https://wa.me/2348000000000?text=${encodeURIComponent(text)}`);
    expect(json.whatsapp_url).toContain("%E2%82%A6"); // ₦, URL-encoded
    expect(json.whatsapp_url).not.toMatch(/ /);
    expect(new URL(json.whatsapp_url).searchParams.get("text")).toBe(text);
    // Never granted by a request.
    expect(t.entitlements).toEqual([]);
  });

  it("keeps the student's reference across requests (a taken one is redrawn)", async () => {
    await send();
    await send();
    expect(t.payment_references.filter((r) => r.user_id === "u1")).toEqual([{ user_id: "u1", reference: "AYS-7K3Q" }]);
    expect(t.payment_requests.map((r) => r.reference)).toEqual(["AYS-7K3Q", "AYS-7K3Q"]);
  });

  it("price lock: the amount is fixed when the request is made (₦3,000 to 22 Nov 23:58, ₦5,000 from 23:59)", async () => {
    at("2026-11-22T23:58:59+01:00");
    expect((await (await send()).json()).amount).toBe(3000);
    at("2026-11-22T23:59:00+01:00");
    expect((await (await send()).json()).amount).toBe(5000);
    expect(t.payment_requests.map((r) => r.amount_naira)).toEqual([3000, 5000]);
  });

  it("at most 3 pending requests a Lagos day; the next day is fresh", async () => {
    for (let i = 0; i < 3; i++) expect((await send()).status).toBe(200);
    const res = await send();
    expect(res.status).toBe(429);
    expect(t.payment_requests).toHaveLength(3);
    at("2026-11-17T00:00:00+01:00"); // Lagos midnight
    expect((await send()).status).toBe(200);
  });

  it("refuses signed-out visitors, students already on Finals, and after PLAN_END_DATE", async () => {
    t.entitlements.push({ user_id: "u1", plan: "finals", starts_at: "2026-11-01T00:00:00Z", ends_at: "2099-01-01T00:00:00Z" });
    expect((await send()).status).toBe(409);
    t.entitlements = [];
    at("2026-12-24T00:00:00+01:00");
    expect((await send()).status).toBe(410);
    authUser = null;
    expect((await send()).status).toBe(401);
    expect(t.payment_requests).toEqual([]);
  });

  it("until the bank details and WhatsApp number are set: 'Payments open soon', nothing recorded", async () => {
    process.env.WHATSAPP_NUMBER = "";
    const res = await send();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "Payments open soon." });
    expect(t.payment_requests).toEqual([]);
  });
});

describe("helpers", () => {
  it("payment details come from the plans config; env overrides; any empty one closes payments", () => {
    expect(paymentDetails({})).toEqual({ bankName: "Opay", accountNumber: "8132265016", accountName: "Ilesanmi Oluwatimilehin", whatsapp: "2348132265016" });
    expect(paymentDetails({ ...ENV })?.whatsapp).toBe("2348000000000");
    for (const k of Object.keys(ENV)) expect(paymentDetails({ ...ENV, [k]: "" })).toBeNull();
  });

  it("encodes characters that would break the link (+, &, #)", () => {
    const url = whatsappUrl("2348000000000", whatsappText({ amount: 5000, email: "a+b&c#d@pau.edu.ng", reference: "AYS-7K3Q" }));
    expect(url).toContain("a%2Bb%26c%23d%40pau.edu.ng");
    expect(new URL(url).searchParams.get("text")).toContain("Email: a+b&c#d@pau.edu.ng.");
  });

  it("cleans referral codes", () => {
    expect(cleanReferral(" tolu ")).toBe("TOLU");
    expect(cleanReferral("x")).toBeNull();
    expect(cleanReferral("<script>")).toBeNull();
  });
});
