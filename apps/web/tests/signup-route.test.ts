import { afterEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ auth: { admin: { createUser } } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithPassword: vi.fn() } }) }));

const { POST } = await import("@/app/api/auth/signup/route");
const req = (body: unknown) => new Request("http://localhost/api/auth/signup", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/auth/signup (temporary direct sign-up)", () => {
  afterEach(() => {
    delete process.env.AUTH_DIRECT_SIGNUP;
    createUser.mockReset();
  });

  it("doesn't exist unless AUTH_DIRECT_SIGNUP=1", async () => {
    const res = await POST(req({ email: "a@pau.edu.ng", password: "longenough" }));
    expect(res.status).toBe(404);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("refuses non-PAU emails and short passwords before creating anything", async () => {
    process.env.AUTH_DIRECT_SIGNUP = "1";
    expect((await POST(req({ email: "a@gmail.com", password: "longenough" }))).status).toBe(400);
    expect((await POST(req({ email: "a@pau.edu.ng", password: "short" }))).status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });
});
