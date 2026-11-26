// Sign-up when the send reply is lost (Anselm, 26 Nov 2026). Local only; no email is sent (the send is held or faked).
// npx tsx scripts/signup-stuck-check.mts <screenshot dir>
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const SHOTS = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
let otpMode: "hold" | "exists" = "hold";
await page.route("**/api/auth/otp", (r) => {
  if (otpMode === "exists") return r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "You already have an account with this email.", code: "account_exists" }) });
  // hold: never answer, like Anselm's lost reply. Nothing reaches Supabase.
});
await page.route("**/api/auth/verify", (r) => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "That code is wrong or has expired. Request a new one." }) }));
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };
const heading = (name: string) => page.getByRole("heading", { name });

await page.goto(`${BASE}/sign-up`);
await page.evaluate(() => localStorage.clear());
await page.reload();
ok((await page.getByText("I already have a code").count()) === 0, "no 'I already have a code' link");
// 1. Not a PAU email: stays, says why
await page.getByLabel("PAU email").fill("someone@gmail.com");
await page.getByRole("button", { name: "Email me a code" }).click();
ok(await page.getByText("Use your PAU email.").isVisible(), "non-PAU email stays on the email step");
// 2. Code box opens at once, even though the send never answers
await page.getByLabel("PAU email").fill("test.student@pau.edu.ng");
const t0 = Date.now();
await page.getByRole("button", { name: "Email me a code" }).click();
await heading("Check your email").waitFor({ timeout: 3000 });
ok(Date.now() - t0 < 1500, `code box after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
ok((await page.getByText(/longer than usual/).count()) === 0, "no 'taking longer' text");
await page.screenshot({ path: `${SHOTS}/instant.png` });
// 3. Reload: still on the code box
await page.reload();
await heading("Check your email").waitFor({ timeout: 5000 });
ok(await page.getByText("test.student@pau.edu.ng").isVisible(), "reload keeps the code box and email");
// 4. Wrong code
await page.getByLabel("Code").fill("12345678");
await page.getByRole("button", { name: "Continue" }).click();
ok(await page.getByText("wrong or has expired").waitFor({ timeout: 5000 }).then(() => true, () => false), "wrong code error shown");
ok(await page.getByText(/Send a new code in 6[0-5]s/).isVisible(), "resend waits 65 s");
// 5. Different email forgets it
await page.getByRole("button", { name: "Use a different email" }).click();
await page.reload();
ok(await heading("Create your free account").isVisible(), "different email forgets the code step");
// 6. Refused send (account exists): back to the email step with the notice
otpMode = "exists";
await page.getByLabel("PAU email").fill("test.student@pau.edu.ng");
await page.getByRole("button", { name: "Email me a code" }).click();
ok(await page.getByText(/already have an account/i).first().waitFor({ timeout: 5000 }).then(() => true, () => false), "refused send returns with 'already have an account'");
await page.reload();
ok(!(await heading("Check your email").isVisible()), "refused send isn't remembered");
await browser.close();
