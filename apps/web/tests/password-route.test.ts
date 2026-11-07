import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { onboarded: true } }) }) }) }),
  }),
}));
const { POST } = await import("@/app/api/auth/password/route");
const req = (body: unknown) => new Request("http://localhost/api/auth/password", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/auth/password", () => {
  beforeEach(() => signInWithPassword.mockReset());
  it("rejects non-PAU emails without calling Supabase", async () => {
    const res = await POST(req({ email: "x@gmail.com", password: "whatever123" }));
    expect(res.status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it("gives one message for every failure, so it never reveals which accounts exist", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { status: 400, message: "Invalid login credentials" } });
    const res = await POST(req({ email: "student@pau.edu.ng", password: "wrongpass1" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/Wrong email or password/);
  });
  it("signs in and says where to go", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await POST(req({ email: " Student@PAU.edu.ng ", password: "revise4exams" }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "student@pau.edu.ng", password: "revise4exams" });
    expect(await res.json()).toEqual({ ok: true, next: "/dashboard" });
  });
});
