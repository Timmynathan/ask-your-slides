// Branded emails (owner, 24 Nov 2026): every email has the team sign-off and the logo PNG; update
// emails have an unsubscribe link and the tagged button link; sign-in emails have neither.
import { createHmac } from "node:crypto";
import { createElement } from "react";
import { render } from "@react-email/components";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
beforeAll(() => {
  process.env.SUPABASE_SECRET_KEY = "test-secret-key";
});

describe("email templates", () => {
  it("sign-in: code, logo, team sign-off, no unsubscribe", async () => {
    const { buildSignIn } = await import("@/lib/email/send");
    const e = await buildSignIn("482913");
    expect(e.subject).toContain("482913");
    expect(e.html).toContain("AskYour</span>");
    expect(e.html).toContain("— The AskYourSlides Team");
    expect(e.html).not.toContain("Unsubscribe");
    expect(e.text).toContain("482913");
    expect(e.unsubscribe).toBeUndefined();
    expect(e.html).not.toMatch(/Timmy from/);
  });

  it("update emails: one tagged button, unsubscribe link and header URLs, plain text", async () => {
    const { buildUpdate } = await import("@/lib/email/send");
    const course = { code: "CSC420", programme: "computer-science", title: "Data Management II" };
    const id = "11111111-2222-3333-4444-555555555555";
    for (const [type, path] of [["welcome", "/dashboard?ref=email-welcome"], ["pastq", "past=1&ref=email-pastq"], ["newslides", "ref=email-newslides"]] as const) {
      const e = await buildUpdate(type, { userId: id, name: "Tolu Ade", course });
      expect(e.html, type).toContain(path.replace(/&/g, "&amp;"));
      expect(e.html, type).toContain("Unsubscribe");
      expect(e.html, type).toContain("Hi Tolu,");
      expect(e.text, type).toContain("— The AskYourSlides Team");
      expect(e.unsubscribe?.endpoint, type).toContain("/api/email/unsubscribe?u=" + id);
      expect((e.html.match(/<a[^>]+background-color:#0e1664/g) ?? []).length, type).toBe(1);
    }
  });

  it("unsubscribe tokens are tied to the user", async () => {
    const { unsubscribeToken, validUnsubscribe } = await import("@/lib/email/send");
    const a = "11111111-2222-3333-4444-555555555555";
    const b = "11111111-2222-3333-4444-555555555556";
    expect(validUnsubscribe(a, unsubscribeToken(a))).toBe(true);
    expect(validUnsubscribe(b, unsubscribeToken(a))).toBe(false);
    expect(validUnsubscribe(a, "nope")).toBe(false);
  });

  it("the hourly job's token matches what the GitHub workflow computes (HMAC of 'email-cron')", async () => {
    const { cronToken } = await import("@/lib/email/send");
    expect(cronToken()).toBe(createHmac("sha256", "test-secret-key").update("email-cron").digest("hex"));
  });

  it("Lagos day starts at 23:00 UTC the day before", async () => {
    const { lagosDayStart } = await import("@/lib/email/queue");
    expect(lagosDayStart(new Date("2026-11-24T10:00:00Z"))).toBe("2026-11-23T23:00:00.000Z");
    expect(lagosDayStart(new Date("2026-11-24T23:30:00Z"))).toBe("2026-11-24T23:00:00.000Z");
  });

  it("templates render without the send helpers", async () => {
    const { SignInEmail } = await import("@/lib/email/templates");
    expect(await render(createElement(SignInEmail, { code: "1" }))).toContain("max-width:560px");
  });
});

describe("Supabase send-email hook signature", () => {
  it("accepts a correctly signed request and rejects a wrong one", async () => {
    const raw = Buffer.from("hook-secret-bytes").toString("base64");
    process.env.SEND_EMAIL_HOOK_SECRET = `v1,whsec_${raw}`;
    process.env.RESEND_API_KEY = "";
    const { POST } = await import("@/app/api/auth/email-hook/route");
    const body = JSON.stringify({ user: { id: "u", email: "a@pau.edu.ng" }, email_data: { token: "123456" } });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from(raw, "base64")).update(`msg_1.${ts}.${body}`).digest("base64");
    const req = (s: string) => new Request("http://x/api/auth/email-hook", { method: "POST", body, headers: { "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": `v1,${s}` } });
    expect((await POST(req("bad"))).status).toBe(401);
    // Signed correctly: passes the check and then fails only on sending (no Resend key in tests).
    expect((await POST(req(sig))).status).toBe(502);
  });
});
