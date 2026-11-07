// Note: Next 16 keeps recently visited pages mounted but hidden (UI state preservation), so the
// DOM can hold a hidden copy of another course's workspace. Locators target :visible elements.
//
// Phase 5 proof: the study UI in a real browser, laptop first (1440×900), then phone (375×812).
// Signs in a temporary student (no email), asks one real question (~$0.001), opens a citation,
// reloads the chat, checks the phone layout, then deletes the student. Screenshots go to
// UI_SMOKE_SHOTS (default: the OS temp dir).
//
//   npm run build && npm run check:ui
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Page } from "playwright";

const ROOT_ENV = path.resolve(import.meta.dirname, "../../../.env");
if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const SHOTS = process.env.UI_SMOKE_SHOTS ?? path.join(tmpdir(), "pau-ui-smoke");
mkdirSync(SHOTS, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function shot(page: Page, name: string) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  shot ${file}`);
}

async function signInCookies(email: string) {
  await admin.auth.admin.createUser({ email, email_confirm: true });
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const res = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: data.properties!.email_otp }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
  const { data: u } = await admin.from("profiles").select("id").eq("email", email).single();
  await admin.from("profiles").update({ onboarded: true, display_name: "Test Student" }).eq("id", u!.id);
  return res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "localhost", path: "/" };
  });
}

async function cleanup(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = data?.users.find((x) => x.email === email);
  if (!u) return;
  await admin.from("traces").delete().eq("user_id", u.id);
  await admin.auth.admin.deleteUser(u.id);
}

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try { await fetch(`${BASE}/sign-in`); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error("server did not start");
}

async function main() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/SUPABASE|ANTHROPIC|VOYAGE|DATABASE_URL|PRIVACY/.test(k)) delete env[k];
  const server = process.env.E2E_BASE_URL ? null : spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore", env,
  });
  const email = `ui-smoke-${Date.now()}@pau.edu.ng`;
  const browser = await chromium.launch();
  const consoleErrors: string[] = [];
  try {
    await waitForServer();
    // 0. Press feedback on the sign-in page (signed out). The network is slowed so the busy state
    //    can be observed; a double click must still send one request.
    console.log("\nPress feedback (sign-in page)");
    const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const sp = await anon.newPage();
    let passwordRequests = 0;
    await sp.route("**/api/auth/password", async (route) => {
      passwordRequests++;
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await sp.goto(`${BASE}/sign-in`);
    const signInBtn = sp.getByRole("button", { name: "Sign in" });
    check((await signInBtn.evaluate((el) => getComputedStyle(el).cursor)) === "pointer", "buttons show the hand cursor");
    await sp.locator("#email").fill("someone@pau.edu.ng");
    await sp.locator("#password").fill("not-the-password");
    await signInBtn.dblclick();
    const busyBtn = sp.getByRole("button", { name: /Signing in/ });
    check(await busyBtn.isVisible(), "pressed button shows a spinner and 'Signing in…' at once");
    check(await busyBtn.isDisabled(), "button is locked while it works");
    await sp.getByRole("alert").waitFor({ timeout: 10000 });
    check(passwordRequests === 1, "a double click sends one request", `${passwordRequests} requests`);
    await anon.close();

    const cookies = await signInCookies(email);

    console.log("\nLaptop 1440×900");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(e.message));

    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(/\/study\/[A-Z]{3}\d{3}/);
    check(true, "dashboard opens the first course", new URL(page.url()).pathname);
    await page.getByRole("link", { name: /CSC 420/ }).click();
    await page.waitForURL(/\/study\/CSC420/);
    await page.getByRole("button", { name: "Transactions and indexing", exact: true }).click();
    await page.getByRole("heading", { name: "Transactions and indexing" }).waitFor();
    check(await page.getByRole("button", { name: "Summarize this topic" }).isVisible(), "topic empty state shows the three starters");
    const sidebarBox = await page.locator("aside:visible").first().boundingBox();
    check(!!sidebarBox && sidebarBox.x === 0 && sidebarBox.width > 250, "sidebar is a fixed column on laptop", JSON.stringify(sidebarBox));
    await shot(page, "1-laptop-empty-topic");

    let chatRequests = 0;
    page.on("request", (r) => r.url().endsWith("/api/chat") && r.method() === "POST" && chatRequests++);
    await page.locator("textarea[aria-label='Your question']:visible").fill("What does ACID stand for?");
    await page.getByRole("button", { name: "Send" }).dblclick();
    check(await page.getByRole("status").filter({ hasText: "Sending" }).first().isVisible().catch(() => false)
      || await page.getByText("Searching your slides…").isVisible(), "Send reacts at once (spinner, then 'Searching your slides…')");
    await page.getByText("Searching your slides…").waitFor({ timeout: 5000 }).then(
      () => check(true, "shows 'Searching your slides…' while waiting"),
      () => check(false, "shows 'Searching your slides…' while waiting"),
    );
    const chip = page.locator("li button[title^='Open ']:visible").first();
    await chip.waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Send" }).waitFor({ timeout: 30000 }); // answer finished
    check(chatRequests === 1, "double-clicking Send asks the question once", `${chatRequests} requests`);
    const chipText = (await chip.textContent()) ?? "";
    check(/· Slide \d+/.test(chipText), "citation chips show material · slide (after the answer finishes)", chipText);
    check(!(await page.content()).includes("[[s:"), "no raw citation markers on screen");
    check(/[?&]chat=/.test(page.url()), "URL now points at the saved chat", page.url());
    const chatLink = page.locator("nav button[aria-current='true']:visible");
    check((await chatLink.count()) === 1, "new chat appears in the sidebar");
    await shot(page, "2-laptop-answer");

    await chip.click();
    const preview = page.getByRole("dialog", { name: "Slide preview" });
    await preview.locator("img").waitFor({ timeout: 15000 });
    const img = preview.locator("img");
    await img.evaluate((el: HTMLImageElement) => el.complete || new Promise((r) => (el.onload = r)));
    const natural = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    check(natural > 0, "slide image loads from a signed URL", `${natural}px wide`);
    const pbox = await preview.boundingBox();
    check(!!pbox && pbox.x > 900 && pbox.height > 800, "preview is a side panel on laptop", JSON.stringify(pbox));
    await shot(page, "3-laptop-preview");
    await page.getByRole("button", { name: /Ask about this slide/ }).click();
    const prefilled = await page.locator("textarea[aria-label='Your question']:visible").inputValue();
    check(prefilled.startsWith("Explain slide"), "'Ask about this slide' fills the question box", prefilled);

    await page.reload();
    await page.locator("li button[title^='Open ']:visible").first().waitFor({ timeout: 15000 });
    const restored = await page.locator("main ol > li:visible").count();
    check(restored === 2, "reloading restores the chat (question + answer, with chips)", `${restored} messages`);

    // Off-topic question in the topic chat: labelled fallback, chips name the other topic.
    await page.locator("textarea[aria-label='Your question']:visible").fill("What's the difference between a function and a stored procedure?");
    await page.keyboard.press("Enter");
    await page.getByText("Searching your slides…").waitFor({ timeout: 5000 }).catch(() => {});
    await page.getByRole("button", { name: "Send" }).waitFor({ timeout: 40000 });
    const label = page.locator("main p:visible", { hasText: "Not in Transactions and indexing" });
    check((await label.count()) === 1, "fallback label shown above the off-topic answer", (await label.first().textContent().catch(() => "")) ?? "");
    const otherChip = page.locator("li button[title^='Open Functions, Procedures and Triggers · Slide']:visible");
    check((await otherChip.count()) > 0, "off-topic chips name the other material, slide number never cut", (await otherChip.first().textContent().catch(() => "none")) ?? "");
    await page.locator("main ol > li:visible").last().scrollIntoViewIfNeeded();
    await shot(page, "3b-laptop-fallback");

    console.log("\nPhone 375×812");
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await phone.addCookies(cookies);
    const p2 = await phone.newPage();
    p2.on("pageerror", (e) => consoleErrors.push(e.message));
    await p2.goto(page.url());
    await p2.locator("li button[title^='Open ']:visible").first().waitFor({ timeout: 15000 });
    const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, "no sideways scrolling at 375px", `${overflow}px`);
    const drawer = await p2.locator("aside").first().boundingBox();
    check(!!drawer && drawer.x < 0, "sidebar is hidden off-screen on phone", JSON.stringify(drawer));
    await shot(p2, "4-phone-chat");
    await p2.getByRole("button", { name: "Open course list" }).click();
    await p2.waitForTimeout(400);
    const opened = await p2.locator("aside").first().boundingBox();
    check(!!opened && opened.x === 0, "menu button opens the drawer", JSON.stringify(opened));
    await shot(p2, "5-phone-drawer");
    await p2.mouse.click(360, 400); // tap the dimmed area
    await p2.waitForTimeout(400);
    await p2.locator("li button[title^='Open ']:visible").first().click();
    const sheet = p2.getByRole("dialog", { name: "Slide preview" });
    await sheet.locator("img").waitFor({ timeout: 15000 });
    await sheet.locator("img").evaluate((el: HTMLImageElement) => el.complete || new Promise((r) => (el.onload = r)));
    const sbox = await sheet.boundingBox();
    check(!!sbox && sbox.y > 100 && Math.round(sbox.width) === 375 && sbox.height > 500, "preview is a bottom sheet on phone (75% of the screen)", JSON.stringify(sbox));
    await shot(p2, "6-phone-preview");

    check(consoleErrors.length === 0, "no errors in the browser console", consoleErrors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    await cleanup(email);
    server?.kill();
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nPhase 5 UI smoke: all checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
