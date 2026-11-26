// Sign-up when the send reply is lost (Anselm, 26 Nov 2026). Local only; no email is sent (the send is held).
// npx tsx scripts/signup-stuck-check.mts <screenshot dir>
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const SHOTS = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
let otpCalls = 0;
// Hold the send forever (like Anselm's lost reply). Nothing reaches Supabase.
await page.route("**/api/auth/otp", () => { otpCalls++; });
await page.route("**/api/auth/verify", (r) => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "That code is wrong or has expired. Request a new one." }) }));
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };

await page.goto(`${BASE}/sign-up`);
await page.evaluate(() => localStorage.clear());
await page.reload();
// 1. "I already have a code" without an email
await page.getByRole("button", { name: "I already have a code" }).click();
ok(await page.getByText("Type your PAU email above first").isVisible(), "asks for the email first");
// 2. Lost reply: moves on by itself
await page.getByLabel("PAU email").fill("test.student@pau.edu.ng");
const t0 = Date.now();
await page.getByRole("button", { name: "Email me a code" }).click();
ok(await page.getByText("Sending…").first().isVisible(), "shows Sending…");
await page.getByRole("heading", { name: "Check your email" }).waitFor({ timeout: 15000 });
ok(Date.now() - t0 < 13000, `code box after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
ok(await page.getByText("taking longer than usual").isVisible(), "slow note shown");
await page.screenshot({ path: `${SHOTS}/slow.png` });
// 3. Reload: still on the code box
await page.reload();
await page.getByRole("heading", { name: "Check your email" }).waitFor({ timeout: 5000 });
ok(await page.getByText("test.student@pau.edu.ng").isVisible(), "reload keeps the code box and email");
// 4. Wrong code shows error, stays
await page.getByLabel("Code").fill("12345678");
await page.getByRole("button", { name: "Continue" }).click();
ok(await page.getByText("wrong or has expired").isVisible({ timeout: 5000 }).catch(() => false) || await page.getByText("wrong or has expired").waitFor({ timeout: 5000 }).then(() => true, () => false), "wrong code error shown");
// 5. Use a different email clears it
await page.getByRole("button", { name: "Use a different email" }).click();
await page.reload();
ok(await page.getByRole("heading", { name: "Create your free account" }).isVisible(), "different email forgets the code step");
// 6. I already have a code with email
await page.getByLabel("PAU email").fill("test.student@pau.edu.ng");
await page.getByRole("button", { name: "I already have a code" }).click();
ok(await page.getByText("Enter the newest code").isVisible(), "I already have a code opens the box");
ok(await page.getByText(/Send a new code in 6[0-5]s/).isVisible(), "resend waits 65 s");
await page.screenshot({ path: `${SHOTS}/had-code.png` });
console.log("send requests held:", otpCalls);
await browser.close();
