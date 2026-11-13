// Plans in a real browser (PRD F12, phase 3), against a running app (default http://localhost:3000).
// Signs in a temporary Computer Science student (no email sent), checks the Premium badge and
// counts, the quiz lock and the premium-course cap (pricing sheet), the pricing page, /pay (bank
// transfer + WhatsApp handoff, pending state, nothing granted), and a comp grant; then deletes the student. No model calls: costs nothing.
//
//   npm run dev   (in another terminal)   then   node scripts/plans-ui.mts
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { FINALS_PRICE, FINALS_PRICE_EARLY, PLAN_END_DATE, PREMIUM_FREE_FIRST_DAY, PRICE_CHANGE_DATE } from "../lib/plans/config.ts";

const ROOT_ENV = path.resolve(import.meta.dirname, "../../../.env");
if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.UI_SMOKE_SHOTS ?? path.join(tmpdir(), "pau-plans-ui");
mkdirSync(SHOTS, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const shot = async (page: Page, name: string, full = false) => {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  console.log(`  shot ${file}`);
};
const lagosDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

const email = `plans-ui-${Date.now()}@pau.edu.ng`;
await admin.auth.admin.createUser({ email, email_confirm: true });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
const res = await fetch(`${BASE}/api/auth/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, code: link.properties!.email_otp }),
});
if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
const { data: me } = await admin.from("profiles").select("id").eq("email", email).single();
const userId = me!.id as string;
await admin.from("profiles").update({ onboarded: true, display_name: "Plans Test", study_partner: "ada", programme: "computer-science", level: 400 }).eq("id", userId);
const cookies = res.headers.getSetCookie().map((c) => {
  const [pair] = c.split(";");
  const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: new URL(BASE).hostname, path: "/" };
});
const { data: csc402 } = await admin.from("courses").select("id, premium").eq("programme", "computer-science").eq("code", "CSC402").single();

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [["laptop", { width: 1280, height: 860 }], ["phone", { width: 375, height: 812 }]] as const) {
    console.log(`\n${label}`);
    const ctx = await browser.newContext({ viewport });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();

    // My courses: CSC402 is premium in Computer Science; a new account is on its first day.
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    const card = page.locator("li:visible", { hasText: "CSC 402" }).first();
    check(csc402?.premium === true, "CSC402 is premium in Computer Science (database)");
    check(await card.getByText("Premium", { exact: true }).isVisible(), "dashboard: Premium badge on CSC402");
    check(await card.getByText(`${PREMIUM_FREE_FIRST_DAY} free questions left today`).isVisible(), `dashboard: ${PREMIUM_FREE_FIRST_DAY} free questions left today (first day)`);
    await shot(page, `${label}-dashboard`);

    // The course: badge and count; Quiz me → pricing sheet, nothing counted.
    await page.goto(`${BASE}/study/CSC402`, { waitUntil: "networkidle" });
    check(await page.getByText("Premium", { exact: true }).first().isVisible(), "workspace: Premium badge");
    check((await page.getByText(`${PREMIUM_FREE_FIRST_DAY} free questions left today`).filter({ visible: true }).count()) > 0, "workspace: free questions left");
    await page.getByRole("button", { name: "Quiz me", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await sheet.waitFor({ timeout: 15000 });
    check(await sheet.getByText("Quiz mode comes with Finals").isVisible(), "Quiz me → pricing sheet");
    const closed = await sheet.getByRole("button", { name: "Payments open soon" }).isVisible();
    check(closed || (await sheet.getByRole("link", { name: /Get Finals · ₦/ }).getAttribute("href")) === "/pay", closed ? "sheet: Payments open soon (bank details not set)" : "sheet: Get Finals → /pay");
    await shot(page, `${label}-sheet-quiz`);
    await sheet.getByRole("button", { name: "Maybe later" }).click();
    const { data: used } = await admin.from("usage_daily").select("message_count").eq("user_id", userId).maybeSingle();
    check(!used || used.message_count === 0, "quiz refusal counted nothing");

    // Premium cap reached: the box says so and Get Finals opens the sheet with the reset time.
    await admin.from("usage_course_daily").upsert({ user_id: userId, day: lagosDay(), course_id: csc402!.id, message_count: PREMIUM_FREE_FIRST_DAY });
    await admin.from("usage_daily").upsert({ user_id: userId, day: lagosDay(), message_count: PREMIUM_FREE_FIRST_DAY });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Get Finals", exact: true }).click();
    await sheet.waitFor();
    check(await sheet.getByText("That's today's free questions for this course").isVisible(), "premium cap → sheet");
    check(await sheet.getByText(/come back at midnight \(in \d/).isVisible(), "sheet shows the reset time");
    await shot(page, `${label}-sheet-premium`);
    await admin.from("usage_course_daily").delete().eq("user_id", userId);
    await admin.from("usage_daily").delete().eq("user_id", userId);

    // Pricing page → /pay.
    await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
    if (await page.getByRole("button", { name: "Payments open soon" }).isVisible()) {
      check(await page.getByRole("button", { name: "Payments open soon" }).isDisabled(), "pricing: Payments open soon (bank details not set), disabled");
      await shot(page, `${label}-pricing`, true);
      await ctx.close();
      continue;
    }
    await shot(page, `${label}-pricing`, true);
    await page.getByRole("link", { name: /Get Finals · ₦/ }).click();
    await page.waitForURL(/\/pay$/);

    // /pay: bank details, the student's reference, then "I've sent it" → pending row + WhatsApp.
    const ref = (await page.locator("span.font-mono", { hasText: /^AYS-/ }).first().textContent())?.trim() ?? "";
    check(/^AYS-[2-9A-HJKMNP-Z]{4}$/.test(ref), "pay: the student's reference", ref);
    check(await page.getByRole("button", { name: "Copy account number" }).isVisible(), "pay: copy account number");
    check(await page.getByRole("button", { name: "Copy reference" }).isVisible(), "pay: copy reference");
    await shot(page, `${label}-pay`, true);
    await page.getByRole("button", { name: "Have a referral code?" }).click();
    await page.getByLabel("Referral code (optional)").fill("tolu");
    let wa = "";
    await page.route("https://wa.me/**", (r) => ((wa = r.request().url()), r.fulfill({ body: "whatsapp" })));
    await page.getByRole("button", { name: /I've sent it/ }).click();
    await page.waitForURL(/wa\.me/);
    const price = new Date() < PRICE_CHANGE_DATE ? FINALS_PRICE_EARLY : FINALS_PRICE;
    const text = new URL(wa).searchParams.get("text") ?? "";
    check(text === `Hi, I've paid ₦${price.toLocaleString("en-NG")} for AskYourSlides Finals. Email: ${email}. Reference: ${ref}. Receipt attached.`, "WhatsApp opens with the receipt message", text);
    const { data: reqs } = await admin.from("payment_requests").select("status, amount_naira, reference, referral_code, email").eq("user_id", userId);
    check(reqs?.length === 1 && reqs[0].status === "pending" && reqs[0].amount_naira === price && reqs[0].reference === ref && reqs[0].referral_code === "TOLU" && reqs[0].email === email, "one pending request, server price, reference, referral", JSON.stringify(reqs));
    const { count: ents } = await admin.from("entitlements").select("id", { count: "exact", head: true }).eq("user_id", userId);
    check(ents === 0, "a request alone grants nothing");
    await page.goto(`${BASE}/pay`, { waitUntil: "networkidle" });
    check(await page.getByText("Payment pending", { exact: true }).isVisible(), "pay: pending state after the handoff");
    await shot(page, `${label}-pay-pending`, true);
    await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
    check(await page.getByRole("link", { name: /Payment pending/ }).isVisible(), "pricing: Payment pending");
    await admin.from("payment_requests").delete().eq("user_id", userId);
    await ctx.close();
  }

  // A comp plan: Finals, no Premium limit.
  const { error } = await admin.from("entitlements").insert({ user_id: userId, plan: "finals", ends_at: PLAN_END_DATE.toISOString(), source: "comp", note: "plans-ui test" });
  check(!error, "comp grant");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
  check(await page.getByText(/You're on Finals until/).isVisible(), "pricing: on Finals");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  check((await page.getByText("Premium", { exact: true }).count()) === 0, "Finals: no Premium badges");
  await ctx.close();
} finally {
  await browser.close();
  await admin.from("traces").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll plan UI checks passed");
process.exit(failures ? 1 : 0);
