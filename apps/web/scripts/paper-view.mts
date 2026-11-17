// The original past paper beside the questions (PRD F10), in a real browser: laptop and phone.
// Signs in a temporary Computer Science student on Finals (a comp plan), opens INS401's past
// questions, checks the cleaned pages load and open full screen, then deletes the student. No model calls.
//
//   npm run dev   (in another terminal)   then   node scripts/paper-view.mts
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { PLAN_END_DATE } from "../lib/plans/config.ts";

const ROOT_ENV = path.resolve(import.meta.dirname, "../../../.env");
if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.UI_SMOKE_SHOTS ?? path.join(tmpdir(), "pau-paper-view");
mkdirSync(SHOTS, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const email = `paper-view-${Date.now()}@pau.edu.ng`;
await admin.auth.admin.createUser({ email, email_confirm: true });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
const res = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: link.properties!.email_otp }) });
if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
const { data: me } = await admin.from("profiles").select("id").eq("email", email).single();
const userId = me!.id as string;
await admin.from("profiles").update({ onboarded: true, display_name: "Paper Test", study_partner: "ada", programme: "computer-science", level: 400 }).eq("id", userId);
await admin.from("entitlements").insert({ user_id: userId, plan: "finals", ends_at: PLAN_END_DATE.toISOString(), source: "comp", note: "paper-view test" });
const cookies = res.headers.getSetCookie().map((c) => {
  const [pair] = c.split(";");
  const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: new URL(BASE).hostname, path: "/" };
});

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [["laptop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    console.log(`\n${label}`);
    const ctx = await browser.newContext({ viewport });
    await ctx.addCookies(cookies);
    await ctx.addInitScript(() => Object.keys(localStorage).length || localStorage.setItem("ays:finals-welcome:seen-in-test", "1"));
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`${BASE}/study/INS401?past=1`);
    const welcome = page.getByRole("dialog", { name: /You're on Finals/ });
    if (await welcome.waitFor({ timeout: 8000 }).then(() => true, () => false)) await welcome.getByRole("button", { name: /Start studying/ }).click();
    const view = page.getByRole("region", { name: /^Original paper: 2025\/26 exam/ });
    const img = view.locator("img").first();
    await img.waitFor({ timeout: 15000 });
    await page.waitForFunction((el) => (el as HTMLImageElement).complete, await img.elementHandle(), { timeout: 15000 }).catch(() => null);
    const box = await img.boundingBox();
    const natural = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    check(natural > 500 && !!box && box.height > 200, "the latest paper's first page is shown, readable size", `${natural}px image, shown ${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)}`);
    await page.screenshot({ path: path.join(SHOTS, `paper-${label}-map.png`) });
    // Practising a paper shows that paper.
    await page.locator("main").getByRole("button", { name: /^2025\/26 test/ }).click();
    check(await page.getByRole("region", { name: /^Original paper: 2025\/26 test/ }).waitFor({ timeout: 10000 }).then(() => true, () => false), "practising the 2025/26 test shows that paper");
    await page.waitForFunction(() => { const imgs = [...document.querySelectorAll("section[aria-label^='Original paper'] img")] as HTMLImageElement[]; return imgs.length > 0 && imgs.slice(0, 2).every((i) => i.complete && i.naturalWidth > 0); }, null, { timeout: 15000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, `paper-${label}-practice.png`) });
    await page.getByRole("region", { name: /^Original paper: 2025\/26 test/ }).getByRole("button", { name: /^Page 1/ }).click();
    const full = page.getByRole("dialog", { name: /page 1 of/ });
    check(await full.isVisible(), "tapping a page opens it full screen");
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, `paper-${label}-full.png`) });
    await page.keyboard.press("Escape");
    check(errors.length === 0, "no errors in the browser console", errors.join(" | ").slice(0, 200));
    await ctx.close();
  }
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(userId);
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll paper viewer checks passed");
process.exit(failures ? 1 : 0);
