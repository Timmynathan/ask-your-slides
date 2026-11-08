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

async function signInCookies(email: string, opts: { fresh?: boolean } = {}) {
  await admin.auth.admin.createUser({ email, email_confirm: true });
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const res = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: data.properties!.email_otp }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
  if (!opts.fresh) {
    const { data: u } = await admin.from("profiles").select("id").eq("email", email).single();
    await admin.from("profiles").update({ onboarded: true, display_name: "Test Student", study_partner: "ada" }).eq("id", u!.id);
  }
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

    console.log("\nLanding page (signed out)");
    const visitor = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const lp = await visitor.newPage();
    lp.on("pageerror", (e) => consoleErrors.push(e.message));
    await lp.goto(`${BASE}/`);
    check(await lp.getByRole("heading", { level: 1, name: /^Stop uploading slides to ChatGPT\.$/ }).isVisible(), "landing hero: one headline");
    check(await lp.getByRole("link", { name: "Try for free" }).first().isVisible(), "landing hero: big 'Try for free' button");
    const brand = await lp.locator("nav").getByText("Ask Your Slides").evaluate((el) => {
      const c = getComputedStyle(el);
      return `${c.fontFamily.split(",")[0]} ${c.fontWeight} ${c.fontSize}/${c.lineHeight} ${c.color}`;
    });
    check(/Inter.* 400 16px\/24px rgb\(0, 0, 0\)/.test(brand), "brand name: Inter 400 16/24 black", brand);
    const icon = await (await fetch(`${BASE}/icon.svg`)).text();
    check(icon.includes('fill="#000"'), "favicon is the black mark");
    const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json().catch(() => null);
    check(manifest?.display === "standalone" && manifest?.icons?.length >= 2, "installable: web app manifest with icons");
    const { count: courseCount } = await admin.from("courses").select("*", { count: "exact", head: true });
    const chips = await lp.getByText("Your PAU courses are already here").locator("..").locator("span.rounded-full").filter({ hasText: /^[A-Z]{3} \d{3}$/ }).count();
    check(chips === courseCount, "landing shows every PAU course from the database", `${chips} chips, ${courseCount} courses`);
    check((await lp.getByRole("img", { name: /ChatGPT|Claude|Gemini/ }).count()) === 3, "comparison shows the ChatGPT, Claude and Gemini logos");
    const banner = lp.getByText("New: choose your study partner", { exact: false }).first();
    const bannerBg = await banner.evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor);
    check(bannerBg === "rgb(14, 22, 100)", "PAU navy #0E1664 banner across the top", bannerBg);
    const ctaBg = await lp.getByRole("link", { name: "Try for free" }).last().evaluate((el) => getComputedStyle(el).backgroundColor);
    check(ctaBg === "rgb(14, 22, 100)", "main button is PAU navy #0E1664", ctaBg);
    const pageBg = await lp.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(pageBg === "rgb(255, 255, 255)", "page background is white", pageBg);
    check((await lp.getByRole("img", { name: /Zara, your study partner/ }).count()) >= 1, "all four partners appear on the landing page, Zara included");
    const headingFont = await lp.locator("h1").evaluate((el) => getComputedStyle(el).fontFamily);
    check(/Bitter/i.test(headingFont), "headings use Bitter", headingFont.slice(0, 40));
    await shot(lp, "0-landing");
    // The demo waits until it is fully on screen; "See how it works" takes visitors there and starts it.
    await lp.evaluate(() => {
      const r = document.getElementById("demo")!.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + r.top - window.innerHeight + r.height / 2); // top half showing only
    });
    await lp.waitForTimeout(2500);
    const halfStarted = await lp.locator("#demo").getByText(/^What is a B\+/).count();
    check(halfStarted === 0, "demo stays still while only half of it is on screen");
    await lp.evaluate(() => window.scrollTo(0, 0));
    await lp.waitForTimeout(400);
    const typedBefore = await lp.locator("#demo").getByText(/^What is a B\+/).count();
    await lp.getByRole("link", { name: "See how it works", exact: true }).click();
    await lp.waitForTimeout(4800);
    const userBubble = await lp.locator("#demo").locator("div.bg-\\[\\#0e1664\\]").filter({ hasText: "What is a B+ tree index?" }).count();
    check(typedBefore === 0 && userBubble === 1, "'See how it works' scrolls to the demo, which then plays from the start", `before ${typedBefore}, sent ${userBubble}`);
    // It is a video: Pause stops it where it is, and it does not loop by itself.
    await lp.getByRole("button", { name: "Pause demo" }).click();
    const frozen = await lp.locator("#demo").innerText();
    await lp.waitForTimeout(1500);
    check(frozen === (await lp.locator("#demo").innerText()), "demo pauses when Pause is pressed");
    check(await lp.getByRole("button", { name: "Play demo" }).isVisible(), "paused demo shows a Play button");
    await lp.getByRole("button", { name: "Play demo" }).click();
    const endScreen = await lp.getByRole("button", { name: /Watch again/ }).waitFor({ timeout: 20000 }).then(() => true, () => false);
    check(endScreen, "when the demo ends it stops on a blurred end screen with a big replay button");
    await lp.goto(`${BASE}/`);
    await lp.getByRole("link", { name: "Try for free" }).first().click();
    await lp.waitForURL(/\/sign-in\?start=1/);
    const codeStep = await lp.getByRole("button", { name: "Send code" }).waitFor({ timeout: 10000 }).then(() => true, () => false);
    check(codeStep, "'Get started' opens the code step directly");
    await visitor.close();

    console.log("\nShared course link survives sign-in (email + password through the form)");
    const linkUser = `ui-link-${Date.now()}@pau.edu.ng`;
    try {
      await admin.auth.admin.createUser({ email: linkUser, password: "revise4exams!", email_confirm: true });
      const { data: lu } = await admin.from("profiles").select("id").eq("email", linkUser).single();
      await admin.from("profiles").update({ onboarded: true, study_partner: "zara" }).eq("id", lu!.id);
      const linkCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const lk = await linkCtx.newPage();
      await lk.goto(`${BASE}/study/CSC419?topic=1`);
      await lk.waitForURL(/\/sign-in\?next=/);
      check(new URL(lk.url()).searchParams.get("next") === "/study/CSC419?topic=1", "signed-out visitor keeps the link it came from", lk.url());
      await lk.locator("#email").fill(linkUser);
      await lk.locator("#password").fill("revise4exams!");
      await lk.getByRole("button", { name: "Sign in" }).click();
      await lk.waitForURL(/\/study\/CSC419/);
      check(new URL(lk.url()).pathname === "/study/CSC419", "after signing in, lands on the shared course", lk.url());
      const [popup] = await Promise.all([linkCtx.waitForEvent("page"), lk.getByRole("button", { name: "Invite coursemates" }).click()]);
      const shared = decodeURIComponent(popup.url());
      check(/wa\.me|whatsapp/.test(popup.url()) && shared.includes("/study/CSC419"), "'Invite coursemates' opens WhatsApp with a link to the course", shared.slice(0, 140));
      await linkCtx.close();
    } finally {
      await cleanup(linkUser);
    }

    console.log("\nOnboarding: name → choose your study partner → hello");
    const newbie = `ui-newbie-${Date.now()}@pau.edu.ng`;
    try {
      const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await fresh.addCookies(await signInCookies(newbie, { fresh: true }));
      const op = await fresh.newPage();
      op.on("pageerror", (e) => consoleErrors.push(e.message));
      await op.goto(`${BASE}/dashboard`);
      await op.waitForURL(/\/welcome/);
      check(true, "new student is sent to onboarding");
      await op.getByLabel("Your name").fill("Tolu");
      await op.getByRole("button", { name: "Continue" }).click();
      await op.getByRole("radiogroup", { name: "Study partners" }).waitFor();
      check(await op.getByText("Tolu, who do you want to study with?").isVisible(), "partner step greets the student by name");
      check((await op.getByRole("radio").count()) === 4, "four study partners to choose from");
      check((await op.getByText(/^Best for:/).count()) === 4, "each partner says what they're best for");
      await shot(op, "7-onboarding-choose");
      await op.getByRole("radio", { name: /Tobi/ }).click();
      check((await op.getByRole("radio", { name: /Tobi/ }).getAttribute("aria-checked")) === "true", "choosing a partner selects it");
      await op.getByRole("button", { name: "Study with Tobi" }).click();
      await op.getByRole("button", { name: "Start studying" }).waitFor();
      check(await op.getByText("I'm Tobi").isVisible(), "chosen partner introduces themselves");
      const hello = (await op.getByText("I'm Tobi").textContent()) ?? "";
      const { data: depts } = await admin.from("courses").select("department");
      const dept = [...new Set((depts ?? []).map((d) => d.department))];
      check(dept.length !== 1 || (hello.includes(`I know ${dept[0]}`) && hello.includes("school slides")),
        "welcome names the department (from the data) and says 'school slides'", hello.slice(0, 120));
      await shot(op, "8-onboarding-hello");
      await op.getByRole("button", { name: "Start studying" }).click();
      await op.waitForURL(/\/study\//);
      await op.getByText("Studying with").waitFor();
      check(await op.locator("nav").getByText("Tobi", { exact: true }).isVisible(), "Tobi is the partner in the study workspace");
      check(await op.getByText(/Tolu/).first().isVisible(), "partner greets the student by name in an empty chat");
      await shot(op, "9-study-empty-tobi");
      const { data: prof } = await admin.from("profiles").select("study_partner, onboarded, display_name").eq("email", newbie).single();
      check(prof?.study_partner === "tobi" && prof?.onboarded === true && prof?.display_name === "Tolu", "choices saved to the profile", JSON.stringify(prof));
      await fresh.close();
    } finally {
      await cleanup(newbie);
    }

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
    // Switching courses happens in the browser: no server round trip, sidebar never disappears.
    const sidebarHandle = await page.locator("aside:visible").first().elementHandle();
    let serverHits = 0;
    const countHits = (r: { url(): string }) => { if (/\/study\/|_rsc=/.test(r.url())) serverHits++; };
    page.on("request", countHits);
    const t0 = Date.now();
    await page.getByRole("button", { name: /CSC 409/ }).click();
    await page.getByRole("button", { name: "Foundations of research", exact: true }).waitFor();
    await page.getByRole("button", { name: /CSC 420/ }).click();
    await page.getByRole("button", { name: "Transactions and indexing", exact: true }).waitFor();
    const switchMs = Date.now() - t0;
    page.off("request", countHits);
    check(serverHits === 0, "switching courses makes no server request (no loading screen)", `${serverHits} requests`);
    check(await sidebarHandle!.evaluate((el) => el.isConnected), "sidebar stays on screen while switching");
    check(/\/study\/CSC420$/.test(new URL(page.url()).pathname), "URL follows the selected course", new URL(page.url()).pathname);
    check(switchMs < 1500, "two course switches feel instant", `${switchMs} ms incl. animations`);
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
    check(await page.getByRole("status").filter({ hasText: /Sending|Ada is/ }).first().isVisible().catch(() => false),
      "Send reacts at once (spinner, then Ada thinking)");
    await page.getByText("Searching your slides…").waitFor({ timeout: 5000, state: "attached" }).then(
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
    const restored = await page.locator("main li[data-message]:visible").count();
    check(restored === 2, "reloading restores the chat (question + answer, with chips)", `${restored} messages`);

    // Off-topic question in the topic chat: labelled fallback, chips name the other topic.
    await page.locator("textarea[aria-label='Your question']:visible").fill("What's the difference between a function and a stored procedure?");
    await page.keyboard.press("Enter");
    await page.getByText("Searching your slides…").waitFor({ timeout: 5000, state: "attached" }).catch(() => {});
    await page.getByRole("button", { name: "Send" }).waitFor({ timeout: 40000 });
    const label = page.locator("main p:visible", { hasText: "Not in Transactions and indexing" });
    check((await label.count()) === 1, "fallback label shown above the off-topic answer", (await label.first().textContent().catch(() => "")) ?? "");
    const otherChip = page.locator("li button[title^='Open Functions, Procedures and Triggers · Slide']:visible");
    check((await otherChip.count()) > 0, "off-topic chips name the other material, slide number never cut", (await otherChip.first().textContent().catch(() => "none")) ?? "");
    await page.locator("main li[data-message]:visible").last().scrollIntoViewIfNeeded();
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
