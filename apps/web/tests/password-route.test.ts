import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { onboarded: true } }) }) }) }),
  }),
}));
const accountExists = vi.fn();
vi.mock("@/lib/auth/account", () => ({ confirmedAccountExists: (...a: unknown[]) => accountExists(...a) }));
const { POST } = await import("@/app/api/auth/password/route");
const req = (body: unknown) => new Request("http://localhost/api/auth/password", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/auth/password", () => {
  beforeEach(() => signInWithPassword.mockReset());
  it("rejects non-PAU emails without calling Supabase", async () => {
    const res = await POST(req({ email: "x@gmail.com", password: "whatever123" }));
    expect(res.status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it("says the password is wrong when the account exists, so the page can offer 'Escalate to admin'", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { status: 400, message: "Invalid login credentials" } });
    accountExists.mockResolvedValue(true);
    const res = await POST(req({ email: "student@pau.edu.ng", password: "wrongpass1" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "wrong_password" });
  });
  it("says there's no account when there isn't one", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { status: 400, message: "Invalid login credentials" } });
    accountExists.mockResolvedValue(false);
    const res = await POST(req({ email: "nobody@pau.edu.ng", password: "wrongpass1" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "no_account" });
  });
  it("signs in and says where to go", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await POST(req({ email: " Student@PAU.edu.ng ", password: "revise4exams" }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "student@pau.edu.ng", password: "revise4exams" });
    expect(await res.json()).toEqual({ ok: true, next: "/dashboard" });
  });
});
