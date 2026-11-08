import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOtp } }),
}));
const confirmedAccountExists = vi.fn();
vi.mock("@/lib/auth/account", () => ({ confirmedAccountExists: (e: string) => confirmedAccountExists(e) }));

const { POST } = await import("@/app/api/auth/otp/route");

function request(body: unknown) {
  return new Request("http://localhost/api/auth/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/otp", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    confirmedAccountExists.mockReset();
  });

  it("Create account with an email that already has an account: 409, no code sent", async () => {
    confirmedAccountExists.mockResolvedValue(true);
    const res = await POST(request({ email: "Student@pau.edu.ng", intent: "signup" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("account_exists");
    expect(confirmedAccountExists).toHaveBeenCalledWith("student@pau.edu.ng");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("Create account with a new email: sends the code", async () => {
    confirmedAccountExists.mockResolvedValue(false);
    signInWithOtp.mockResolvedValue({ error: null });
    const res = await POST(request({ email: "new@pau.edu.ng", intent: "signup" }));
    expect(res.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalled();
  });

  it("Forgot password for an email with no account: 404, no code sent", async () => {
    confirmedAccountExists.mockResolvedValue(false);
    const res = await POST(request({ email: "nobody@pau.edu.ng", intent: "reset" }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("no_account");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("if the account lookup fails, still sends the code (never blocks sign-up)", async () => {
    confirmedAccountExists.mockRejectedValue(new Error("down"));
    signInWithOtp.mockResolvedValue({ error: null });
    const res = await POST(request({ email: "x@pau.edu.ng", intent: "signup" }));
    expect(res.status).toBe(200);
  });

  it("rejects gmail with 'Use your PAU email.' and never calls Supabase (no email sent)", async () => {
    const res = await POST(request({ email: "someone@gmail.com" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Use your PAU email." });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed body the same way", async () => {
    const res = await POST(new Request("http://localhost/api/auth/otp", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends a code to a PAU address, normalized", async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    const res = await POST(request({ email: "  Student@PAU.edu.ng " }));
    expect(res.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "student@pau.edu.ng", options: { shouldCreateUser: true } });
  });

  it("passes on Supabase's rate limit as 429", async () => {
    signInWithOtp.mockResolvedValue({ error: { status: 429, message: "rate limit" } });
    const res = await POST(request({ email: "student@pau.edu.ng" }));
    expect(res.status).toBe(429);
  });

  it("shows the PAU message if the database hook blocks the address", async () => {
    signInWithOtp.mockResolvedValue({ error: { status: 403, message: "Use your PAU email." } });
    const res = await POST(request({ email: "student@pau.edu.ng" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Use your PAU email.");
  });
});
