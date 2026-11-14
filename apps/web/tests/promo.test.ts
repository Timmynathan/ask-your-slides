// Promo codes for course reps (PRD F12): code format, what students may type, and the redeem route's
// answers. The one-use rules themselves are proven in supabase/tests/promo.sql.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let user: { id: string; email: string } | null = { id: "u1", email: "rep@pau.edu.ng" };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ rpc }),
  must: <T,>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }));

const { cleanPromoCode, newPromoCode, REDEEM_MESSAGES } = await import("@/lib/plans/promo");
const { POST } = await import("@/app/api/promo/redeem/route");
const redeem = (code: unknown) => POST(new Request("http://localhost/api/promo/redeem", { method: "POST", body: JSON.stringify({ code }) }));

beforeEach(() => {
  rpc.mockReset();
  user = { id: "u1", email: "rep@pau.edu.ng" };
});

describe("promo codes", () => {
  it("look like REP-XXXX-XXXX with no 0/O/1/I/L, and are different each time", () => {
    const codes = Array.from({ length: 200 }, newPromoCode);
    for (const c of codes) expect(c).toMatch(/^REP-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(new Set(codes).size).toBe(200);
  });

  it("accept what students actually type", () => {
    expect(cleanPromoCode("rep-7kq2-m9xd")).toBe("REP-7KQ2-M9XD");
    expect(cleanPromoCode(" rep 7kq2 m9xd ")).toBe("REP-7KQ2-M9XD");
    expect(cleanPromoCode("REP7KQ2M9XD")).toBe("REP-7KQ2-M9XD");
  });

  it("redeem: the database's answer becomes the student's message", async () => {
    rpc.mockResolvedValueOnce({ data: [{ outcome: "redeemed", ends_at: "2026-11-23T10:00:00Z" }], error: null });
    const ok = await redeem("rep 7kq2 m9xd");
    expect(ok.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("redeem_promo_code", expect.objectContaining({ p_user: "u1", p_email: "rep@pau.edu.ng", p_code: "REP-7KQ2-M9XD" }));

    for (const [outcome, status] of [["used", 409], ["one_per_student", 409], ["already_finals", 409], ["not_found", 404]] as const) {
      rpc.mockResolvedValueOnce({ data: [{ outcome, ends_at: null }], error: null });
      const r = await redeem("REP-7KQ2-M9XD");
      expect(r.status).toBe(status);
      expect((await r.json()).error).toBe(REDEEM_MESSAGES[outcome]);
    }
  });

  it("signed out: refused, nothing checked", async () => {
    user = null;
    expect((await redeem("REP-7KQ2-M9XD")).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
