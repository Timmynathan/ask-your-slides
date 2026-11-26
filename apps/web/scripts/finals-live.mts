// "You're on Finals" appears by itself when an admin approves (owner, 26 Nov 2026), against a running app
// (default http://localhost:3000). A temporary Free student has Chat, My courses and /pay open; Finals is
// granted in the database; within ~35 s each page must show the pop-up exactly once, and /pay must switch
// to "You're on Finals". Deletes the student afterwards. No model calls: costs nothing.
//
//   npm run dev   (in another terminal)   then   node scripts/finals-live.mts
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { PLAN_END_DATE } from "../lib/plans/config.ts";

const ROOT_ENV = path.resolve(import.meta.dirname, "../../../.env");
if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures++;
};

const email = `finals-live-test-${Date.now()}@pau.edu.ng`;
await admin.auth.admin.createUser({ email, email_confirm: true });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
const res = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: link.properties!.email_otp }) });
if (!res.ok) {
  const { data: u } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (u) await admin.auth.admin.deleteUser(u.id);
  throw new Error(`sign-in failed: ${res.status}`);
}
const { data: me } = await admin.from("profiles").select("id").eq("email", email).single();
const userId = me!.id as string;
await admin.from("profiles").update({ onboarded: true, display_name: "Finals Live", study_partner: "ada", programme: "computer-science", level: 400 }).eq("id", userId);
const cookies = res.headers.getSetCookie().map((c) => {
  const [pair] = c.split(";");
  const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: new URL(BASE).hostname, path: "/" };
});

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addCookies(cookies);
  const pages = { chat: await ctx.newPage(), dashboard: await ctx.newPage(), pay: await ctx.newPage() };
  for (const [name, page] of Object.entries(pages)) {
    await page.goto(`${BASE}/${name}`, { waitUntil: "load", timeout: 90_000 });
    await page.waitForTimeout(3000);
    await page.evaluate((id) => {
      for (const k of ["ays-laptop-tour-seen", "ays-study-tour-seen"]) localStorage.setItem(`${k}:${id.toLowerCase()}`, "1");
    }, userId);
  }
  const dialog = (name: keyof typeof pages) => pages[name].getByRole("dialog", { name: /You're on Finals/ });
  for (const name of Object.keys(pages) as (keyof typeof pages)[]) check((await dialog(name).count()) === 0, `${name}: no pop-up while on Free`);

  const { error } = await admin.from("entitlements").insert({ user_id: userId, plan: "finals", ends_at: PLAN_END_DATE.toISOString(), source: "comp", note: "finals-live test" });
  check(!error, "Finals granted in the database");
  const t0 = Date.now();
  // Each tab is in the background except the last one opened; bring each to the front in turn, as a student would.
  for (const name of Object.keys(pages) as (keyof typeof pages)[]) {
    await pages[name].bringToFront();
    const shown = await dialog(name).first().waitFor({ state: "visible", timeout: 40_000 }).then(() => true, () => false);
    check(shown, `${name}: pop-up appeared by itself (${Math.round((Date.now() - t0) / 1000)} s after approval)`);
    await pages[name].waitForTimeout(2500); // let the page refresh finish
    check((await dialog(name).count()) === 1, `${name}: exactly one pop-up`);
  }
  check(await pages.pay.getByText(/You're on Finals until/).isVisible(), "pay: switched to “You're on Finals until …”");
  await pages.chat.screenshot({ path: path.join(process.env.TMPDIR ?? "/tmp", "finals-live-chat.png") });
  await ctx.close();
} finally {
  await browser.close();
  await admin.from("entitlements").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
