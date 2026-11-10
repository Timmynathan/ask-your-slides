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
// Temporary pilot mode: Create account is email + password (no code) when AUTH_DIRECT_SIGNUP=1.
const DIRECT = process.env.AUTH_DIRECT_SIGNUP === "1";
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
    await admin.from("profiles").update({ onboarded: true, display_name: "Test Student", study_partner: "ada", programme: "computer-science", level: 400 }).eq("id", u!.id);
  }
  return res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const url = new URL(BASE); // localhost, or the live site when E2E_BASE_URL is set
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: url.hostname, path: "/", secure: url.protocol === "https:" };
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
  // A throwaway admin for the /admin checks (only on the local server: the live site's ADMIN_EMAILS is the owner's).
  const adminEmail = `ui-admin-${Date.now()}@pau.edu.ng`;
  env.ADMIN_EMAILS = adminEmail;
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
    const signInBtn = sp.getByRole("button", { name: "Log in", exact: true });
    check((await signInBtn.evaluate((el) => getComputedStyle(el).cursor)) === "pointer", "buttons show the hand cursor");
    await sp.locator("#email").fill("someone@pau.edu.ng");
    await sp.locator("#password").fill("not-the-password");
    await signInBtn.dblclick();
    const busyBtn = sp.getByRole("button", { name: /Logging in/ });
    check(await busyBtn.isVisible(), "pressed button shows a spinner and 'Logging in…' at once");
    check(await busyBtn.isDisabled(), "button is locked while it works");
    await sp.getByRole("alert").waitFor({ timeout: 10000 });
    check(passwordRequests === 1, "a double click sends one request", `${passwordRequests} requests`);
    // Two clear doors: tabs at the top, and a big "Create a free account" on the log-in form.
    check((await sp.getByRole("tab", { name: "Create account" }).isVisible()) && (await sp.getByRole("tab", { name: "Log in" }).getAttribute("aria-selected")) === "true",
      "sign-in shows Create account / Log in tabs");
    await sp.getByRole("button", { name: "Create a free account" }).click();
    const signupButton = DIRECT ? "Create account" : "Get my code";
    check(await sp.getByRole("heading", { name: "Create your free account" }).isVisible() && await sp.getByRole("button", { name: signupButton, exact: true }).isVisible(),
      `'Create a free account' switches to sign-up ('${signupButton}')`);
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
    const { data: codeRows } = await admin.from("courses").select("code");
    const courseCount = new Set((codeRows ?? []).map((c) => c.code)).size; // one chip per code, even if several programmes share it
    // Light only: a device in dark mode still gets the light site.
    {
      const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
      const dp = await dctx.newPage();
      await dp.goto(`${BASE}/`);
      const bg = await dp.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const ink = await dp.evaluate(() => getComputedStyle(document.querySelector("h1")!).color);
      const scheme = await dp.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
      check(bg === "rgb(255, 255, 255)" && ink === "rgb(25, 25, 25)" && scheme === "light",
        "a device in dark mode gets the same light site (white page, dark text)", `${bg} / ${ink} / ${scheme}`);
      await dp.goto(`${BASE}/sign-in`);
      const card = await dp.evaluate(() => getComputedStyle(document.body).backgroundColor);
      check(card === "rgb(255, 255, 255)", "sign-in is light in dark mode too", card);
      await dctx.close();
    }
    // Six pills that take turns through every course (CSC, INS, ISM… mixed from the start).
    const band = lp.locator("[data-course-count]");
    const pills = band.locator(":scope > span");
    const before = (await pills.allInnerTexts()).join(",");
    check((await pills.count()) === 6 && Number(await band.getAttribute("data-course-count")) === courseCount,
      "landing shows 6 course pills drawn from every PAU course in the database", `${before} of ${courseCount}`);
    check(/CSC \d{3}/.test(before) && /ISM \d{3}/.test(before), "the first pills mix programmes (CSC and ISM)", before);
    await lp.mouse.wheel(0, 120); // the pills start as soon as the visitor scrolls
    await lp.waitForFunction((b) => [...document.querySelectorAll("[data-course-count] > span")].map((e) => (e as HTMLElement).innerText).join(",") !== b, before, { timeout: 3000 }).catch(() => null);
    const after = (await pills.allInnerTexts()).join(",");
    check(after !== before && new Set(after.split(",")).size === 6, "a pill switches to another course within a second or two, no repeats", after);
    check((await lp.getByRole("img", { name: /ChatGPT|Claude|Gemini/ }).count()) === 3, "comparison shows the ChatGPT, Claude and Gemini logos");
    const banner = lp.getByText("Every PAU course slide, ready to chat with.", { exact: false }).first();
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
    const halfStarted = await lp.locator("#demo").getByText(/^What do my CSC 420/).count();
    check(halfStarted === 0, "demo stays still while only half of it is on screen");
    await lp.evaluate(() => window.scrollTo(0, 0));
    await lp.waitForTimeout(400);
    // No autoplay: scrolled fully into view, it waits on its Watch poster.
    await lp.locator("#demo").scrollIntoViewIfNeeded();
    await lp.waitForTimeout(2500);
    check(await lp.getByRole("button", { name: /^Watch the demo, \d+:\d\d$/ }).isVisible(), "scrolling to the demo doesn't play it; the poster shows Watch and its length");
    await lp.evaluate(() => window.scrollTo(0, 0));
    await lp.waitForTimeout(400);
    const typedBefore = await lp.locator("#demo").getByText(/^What do my CSC 420/).count();
    await lp.getByRole("link", { name: "See how it works", exact: true }).click();
    await lp.waitForTimeout(1800); // scroll, then the courses scene
    check(await lp.locator("#demo").getByText("No uploads. Your slides are already here.").isVisible(), "the demo opens on the courses with caption 1 (no uploads)");
    check(await lp.locator("#demo").getByText("4 decks · 147 slides").isVisible(), "the courses scene shows CSC 420 with its slides already there");
    check(await lp.getByRole("button", { name: "Mute" }).isVisible(), "the playing demo has a Mute button (it has music)");
    await lp.waitForTimeout(8000); // tap, chat opens, zoom in, type, send
    const userBubble = await lp.locator("#demo").locator("div.bg-\\[\\#0e1664\\]").filter({ hasText: "What do my CSC 420 slides say about B+ tree indexes?" }).count();
    check(typedBefore === 0 && userBubble === 1, "'See how it works' scrolls to the demo, which then plays from the start", `before ${typedBefore}, sent ${userBubble}`);
    // It is a video: Pause stops it where it is, and it does not loop by itself.
    await lp.getByRole("button", { name: "Pause demo" }).click();
    const frozen = await lp.locator("#demo").innerText();
    await lp.waitForTimeout(1500);
    check(frozen === (await lp.locator("#demo").innerText()), "demo pauses when Pause is pressed");
    check(await lp.getByRole("button", { name: "Play demo" }).isVisible(), "paused demo shows a Play button");
    await lp.getByRole("button", { name: "Play demo" }).click();
    const endScreen = await lp.getByRole("button", { name: /Watch again/ }).waitFor({ timeout: 20000 }).then(() => true, () => false);
    check(endScreen, "when the demo ends it stops on an end card with Watch again");
    check(await lp.locator("#demo").getByRole("link", { name: "Try it free" }).getAttribute("href") === "/sign-up", "the end card's 'Try it free' goes to sign-up");
    await lp.goto(`${BASE}/`);
    await lp.getByRole("link", { name: "Try for free" }).first().click();
    await lp.waitForURL(/\/sign-up$/);
    const signUp = await lp.getByRole("heading", { name: "Create your free account" }).waitFor({ timeout: 10000 }).then(() => true, () => false);
    if (DIRECT) {
      check(signUp && (await lp.getByRole("button", { name: "Create account", exact: true }).isVisible()) && (await lp.locator("#new-password").count()) === 1,
        "'Try for free' opens sign-up: email + password, no code (temporary direct sign-up)");
      // ?code=1: the owner can test the emailed-code sign-up without changing it for students.
      const cp = await browser.newPage();
      await cp.goto(`${BASE}/sign-up?code=1`);
      await cp.getByRole("button", { name: "Get my code", exact: true }).waitFor({ timeout: 10000 }).catch(() => null);
      check((await cp.getByRole("button", { name: "Get my code", exact: true }).isVisible()) && (await cp.locator("#new-password").count()) === 0,
        "/sign-up?code=1 shows the emailed-code sign-up even while direct sign-up is on");
      await cp.close();
      // A real direct sign-up: lands on onboarding, account confirmed.
      const direct = `ui-direct-${Date.now()}@pau.edu.ng`;
      try {
        await lp.locator("#email").fill(direct);
        await lp.locator("#new-password").fill("revise4exams!");
        await lp.getByRole("button", { name: "Create account", exact: true }).click();
        await lp.waitForURL(/\/welcome/, { timeout: 20000 });
        const { data: du } = await admin.auth.admin.listUsers({ perPage: 1000 });
        check(!!du?.users.find((u) => u.email === direct)?.email_confirmed_at, "direct sign-up creates a confirmed account and opens onboarding");
      } finally {
        await cleanup(direct);
      }
    } else {
      check(signUp && (await lp.getByRole("button", { name: "Get my code" }).isVisible()) && (await lp.locator("#password").count()) === 0,
        "'Try for free' opens a clear sign-up page: email and 'Get my code', no password box");
    }
    await visitor.close();

    console.log("\nShared course link survives sign-in (email + password through the form)");
    const linkUser = `ui-link-${Date.now()}@pau.edu.ng`;
    try {
      await admin.auth.admin.createUser({ email: linkUser, password: "revise4exams!", email_confirm: true });
      const { data: lu } = await admin.from("profiles").select("id").eq("email", linkUser).single();
      await admin.from("profiles").update({ onboarded: true, study_partner: "zara", programme: "computer-science", level: 400 }).eq("id", lu!.id);
      const linkCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const lk = await linkCtx.newPage();
      await lk.goto(`${BASE}/study/CSC419?topic=1`);
      await lk.waitForURL(/\/sign-in\?next=/);
      check(new URL(lk.url()).searchParams.get("next") === "/study/CSC419?topic=1", "signed-out visitor keeps the link it came from", lk.url());
      await lk.locator("#email").fill(linkUser);
      await lk.locator("#password").fill("revise4exams!");
      await lk.getByRole("button", { name: "Log in", exact: true }).click();
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
      // PRD F11: "What do you study?" offers the catalog's programmes; this student picks ISMS.
      const studying = op.getByRole("combobox", { name: "What do you study?" });
      check(await op.getByRole("button", { name: "Continue" }).isDisabled(), "Continue waits until a programme is chosen");
      const { data: progs } = await admin.from("programmes").select("id, name, short_name");
      const offered = (await studying.locator("option:not([disabled])").allTextContents()).join(" | ");
      const values = await studying.locator("option:not([disabled])").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
      check((progs ?? []).every((p) => values.includes(p.id)) && (await studying.locator("option").allTextContents()).every((t) => t.length <= 24),
        "every programme in the catalog is offered, with short labels (e.g. 'BSc ISMS')", offered);
      const isms = (progs ?? []).find((p) => p.id !== "computer-science")!;
      await studying.selectOption(isms.id);
      check(await op.getByText((isms.name as string).replace(/^BSc\s+/, ""), { exact: true }).isVisible(), "the full programme name shows under a short label");
      check((await op.getByRole("combobox", { name: "Level" }).inputValue()) === "400", "a programme with one level picks it for the student");
      await op.getByRole("button", { name: "Continue" }).click();
      await op.getByRole("radiogroup", { name: "Study partners" }).waitFor();
      check(await op.getByText("Tolu, who do you want to study with?").isVisible(), "partner step greets the student by name");
      check((await op.getByRole("radio").count()) === 4, "four study partners to choose from");
      check((await op.getByText(/^Best for:/).count()) === 4, "each partner says what they're best for");
      check((await op.getByRole("radio", { name: /Zara/ }).getAttribute("aria-checked")) === "true" && (await op.getByText("Picked for you").isVisible()),
        "Zara is picked by default and marked 'Picked for you'");
      check(await op.getByRole("button", { name: "Study with Zara" }).isEnabled(), "the student can continue straight away with Zara");
      await shot(op, "7-onboarding-choose");
      await op.getByRole("radio", { name: /Tobi/ }).click();
      check((await op.getByRole("radio", { name: /Tobi/ }).getAttribute("aria-checked")) === "true", "choosing a partner selects it");
      await op.getByRole("button", { name: "Study with Tobi" }).click();
      await op.getByRole("button", { name: "Start studying" }).waitFor();
      check(await op.getByText("I'm Tobi").isVisible(), "chosen partner introduces themselves");
      const hello = (await op.getByText("I'm Tobi").textContent()) ?? "";
      const { data: chosen } = await admin.from("programmes").select("department").eq("id", isms.id).single();
      check(hello.includes(`I know ${chosen!.department}`) && hello.includes("school slides"),
        "the partner names the chosen programme's department (from the data) and says 'school slides'", hello.slice(0, 120));
      await shot(op, "8-onboarding-hello");
      await op.getByRole("button", { name: "Start studying" }).click();
      await op.getByRole("heading", { name: "My courses" }).waitFor();
      check(new URL(op.url()).pathname === "/dashboard", "after onboarding the student lands on their courses");
      // Isolation in the browser: only the programme's courses; another programme's course is not found.
      const { data: theirs } = await admin.from("courses").select("code, materials(count)").eq("programme", isms.id);
      const expectCodes = (theirs ?? []).filter((c: any) => (c.materials?.[0]?.count ?? 0) > 0).map((c) => c.code).sort();
      const shownText = await op.getByRole("list", { name: "Courses" }).innerText();
      check(expectCodes.every((c) => shownText.includes(c.replace(/^([A-Z]+)/, "$1 "))) && !/CSC \d{3}|INS 401/.test(shownText),
        "My courses lists only the chosen programme's courses", expectCodes.join(","));
      // The page streams, so the status can already be 200; what matters is that nothing of the course shows.
      await op.goto(`${BASE}/study/CSC420`);
      await op.getByRole("heading", { name: "Page not found" }).waitFor({ timeout: 15000 });
      check(!(await op.getByText("Data Management II").count()), "another programme's course page shows 'Page not found' and none of its content");
      await op.waitForTimeout(300);
      for (let i = consoleErrors.length - 1; i >= 0; i--) if (/status of 404/.test(consoleErrors[i])) consoleErrors.splice(i, 1);
      await op.goto(`${BASE}/dashboard`);
      await op.getByRole("heading", { name: "My courses" }).waitFor();
      await op.getByRole("list", { name: "Courses" }).getByRole("link").first().click();
      await op.waitForURL(/\/study\//);
      await op.getByRole("button", { name: /Studying with/ }).waitFor();
      check(await op.getByRole("button", { name: /Studying with Tobi/ }).isVisible(), "Tobi is the partner in the study workspace");
      // Switching partner is easy to find: a labelled pill, a first-visit hint, and the account menu.
      const pill = op.getByRole("button", { name: /Studying with Tobi/ });
      check((await pill.innerText()).includes("Tobi"), "the partner button names the partner (not just a face)", await pill.innerText());
      // Only what's on screen: Next keeps the previous page (My courses) mounted, hidden.
      const tip = op.locator("div[role=status]:visible", { hasText: "Tap here to switch study partners any time" });
      check(await tip.isVisible(), "a first-visit hint says the partner can be switched");
      await op.locator("button:visible", { hasText: "Got it" }).click();
      check(!(await tip.count()), "'Got it' dismisses the hint");
      await op.reload();
      await pill.waitFor();
      check(!(await tip.count()), "the hint doesn't come back after a reload");
      // Same browser, a different (new) account: the hint is per account, so it shows again.
      const second = `ui-second-${Date.now()}@pau.edu.ng`;
      const newbieCookies = await op.context().cookies();
      const backTo = op.url();
      try {
        await op.context().clearCookies();
        await op.context().addCookies(await signInCookies(second, { fresh: true }));
        const { data: sp2 } = await admin.from("profiles").select("id").eq("email", second).single();
        await admin.from("profiles").update({ onboarded: true, study_partner: "zara", programme: "computer-science", level: 400 }).eq("id", sp2!.id);
        await op.goto(`${BASE}/dashboard`);
        await op.getByRole("heading", { name: "My courses" }).waitFor();
        check(await tip.isVisible(), "a new account on the same browser sees the partner hint too");
      } finally {
        await cleanup(second);
        await op.context().clearCookies();
        await op.context().addCookies(newbieCookies);
        await op.goto(backTo);
        await op.getByRole("button", { name: /Studying with/ }).waitFor();
      }
      await op.getByRole("button", { name: "Account" }).click();
      await op.getByRole("button", { name: "Change study partner", exact: true }).click();
      await op.getByRole("dialog").getByText(/Ada/).first().waitFor({ timeout: 5000 });
      check(true, "the account menu has 'Change study partner'");
      const veil = await op.getByRole("dialog").locator("xpath=..").boundingBox();
      const vp = op.viewportSize()!;
      check(!!veil && veil.width >= vp.width - 1 && veil.height >= vp.height - 1,
        "the partner picker dims the whole page, not just the top bar", JSON.stringify(veil));
      await op.keyboard.press("Escape");
      check(await op.getByText(/Tolu/).first().isVisible(), "partner greets the student by name in an empty chat");
      await shot(op, "9-study-empty-tobi");
      const { data: prof } = await admin.from("profiles").select("study_partner, onboarded, display_name, programme, level, department").eq("email", newbie).single();
      check(prof?.study_partner === "tobi" && prof?.onboarded === true && prof?.display_name === "Tolu" && prof?.programme === isms.id && prof?.level === 400 &&
        prof?.department === chosen!.department, "choices saved to the profile (programme, level, department)", JSON.stringify(prof));
      // Change programme (account menu) → back to CS: the course list follows.
      await op.goto(`${BASE}/dashboard`);
      await op.getByRole("button", { name: "Account" }).click();
      await op.getByRole("button", { name: "Change programme" }).click();
      const dialog = op.getByRole("dialog", { name: "Change programme" });
      await dialog.getByRole("combobox", { name: "What do you study?" }).selectOption("computer-science");
      await dialog.getByRole("button", { name: "Save" }).click();
      await op.getByText(/CSC \d{3}/).first().waitFor({ timeout: 15000 });
      const afterText = await op.getByRole("list", { name: "Courses" }).innerText();
      check(!expectCodes.some((c) => afterText.includes(c.replace(/^([A-Z]+)/, "$1 "))), "after 'Change programme' My courses shows the new programme only");
      await shot(op, "9b-changed-programme");
      await fresh.close();
    } finally {
      await cleanup(newbie);
    }

    // Delete account: everything about the student goes (profile, chats, ratings, answer logs).
    console.log("\nDelete account");
    const leaver = `ui-smoke-leaver-${Date.now()}@pau.edu.ng`;
    try {
      const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await dctx.addCookies(await signInCookies(leaver));
      const { data: lv } = await admin.from("profiles").select("id").eq("email", leaver).single();
      const { data: anyCourse } = await admin.from("courses").select("id").limit(1).single();
      const { data: lconv } = await admin.from("conversations").insert({ user_id: lv!.id, course_id: anyCourse!.id, title: "To be deleted" }).select("id").single();
      await admin.from("messages").insert({ conversation_id: lconv!.id, user_id: lv!.id, role: "user", content: "hello" });
      await admin.from("traces").insert({ user_id: lv!.id, conversation_id: lconv!.id, user_message: "hello", model: "test" });
      const dp = await dctx.newPage();
      dp.on("pageerror", (e) => consoleErrors.push(e.message));
      await dp.goto(`${BASE}/dashboard`);
      const refused = await dp.evaluate(async () => (await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
      check(refused === 400, "deleting without typing DELETE is refused by the server", String(refused));
      await dp.getByRole("button", { name: "Account" }).click();
      await dp.getByRole("button", { name: "Delete account" }).click();
      const dialog = dp.getByRole("dialog", { name: "Delete your account" });
      check(await dialog.getByRole("button", { name: "Delete my account" }).isDisabled(), "the delete button stays off until DELETE is typed");
      await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
      await dialog.getByRole("button", { name: "Delete my account" }).click();
      await dp.waitForURL(/\/sign-in\?deleted=1/, { timeout: 20000 });
      // The notice comes from the query string, read in the browser once the page is up.
      const gone = await dp.getByText("Your account has been deleted.").waitFor({ timeout: 5000 }).then(() => true, () => false);
      check(gone, "after deleting, sign-in says the account is gone", gone ? "" : (await dp.locator("main").innerText()).slice(0, 160).replace(/\n/g, " | "));
      const [{ data: users }, { count: profs }, { count: convs }, { count: trs }] = await Promise.all([
        admin.auth.admin.listUsers({ perPage: 1000 }),
        admin.from("profiles").select("id", { count: "exact", head: true }).eq("id", lv!.id),
        admin.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", lv!.id),
        admin.from("traces").select("id", { count: "exact", head: true }).eq("conversation_id", lconv!.id),
      ]);
      check(!users?.users.some((u) => u.email === leaver) && profs === 0 && convs === 0 && trs === 0,
        "account, profile, chats and answer logs are all deleted", JSON.stringify({ profs, convs, trs }));
      await dp.goto(`${BASE}/dashboard`);
      await dp.waitForURL(/\/sign-in/);
      check(true, "the deleted student is signed out");
      await dctx.close();
    } finally {
      await cleanup(leaver);
    }

    const cookies = await signInCookies(email);

    // Create account with an email that already has an account: no code, a clear "Log in" instead.
    {
      const ectx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const ep = await ectx.newPage();
      await ep.goto(`${BASE}/sign-up`);
      await ep.locator("#email").fill(email);
      if (DIRECT) await ep.locator("#new-password").fill("another-password");
      const otp = ep.waitForResponse((r) => /\/api\/auth\/(otp|signup)$/.test(r.url()));
      await ep.getByRole("button", { name: DIRECT ? "Create account" : "Get my code", exact: true }).click();
      const otpStatus = (await otp).status();
      await ep.getByText("You already have an account.").waitFor({ timeout: 10000 });
      check(otpStatus === 409, "Create account with an existing email is refused (no code, no new account)", String(otpStatus));
      await ep.getByRole("status").getByRole("button", { name: "Log in" }).click();
      check((await ep.getByRole("tab", { name: "Log in" }).getAttribute("aria-selected")) === "true" && (await ep.locator("#email").inputValue()) === email,
        "'You already have an account' → Log in, with the email filled in");
      await ectx.close();
    }
    // Nine earlier questions (in another course), so the first question below is the 10th and
    // "Is this helping you study?" comes due.
    const { data: me } = await admin.from("profiles").select("id").eq("email", email).single();
    const { data: other } = await admin.from("courses").select("id").eq("code", "CSC409").single();
    const { data: warm } = await admin.from("conversations").insert({ user_id: me!.id, course_id: other!.id, title: "Warm-up" }).select("id").single();
    await admin.from("messages").insert(Array.from({ length: 9 }, (_, i) => ({ conversation_id: warm!.id, user_id: me!.id, role: "user", content: `Warm-up question ${i + 1}` })));

    console.log("\nLaptop 1440×900");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    // Voice typing: a stand-in for the browser's speech recognition (headless Chrome can't listen).
    await page.addInitScript(() => {
      class FakeRecognition {
        onresult: any = null; onend: any = null; onerror: any = null; lang = ""; continuous = false; interimResults = false;
        start() { setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: "what is a B tree index" }], { isFinal: true })] }), 200); }
        stop() { setTimeout(() => this.onend?.(), 50); }
        abort() { this.onend?.(); }
      }
      (window as any).SpeechRecognition = FakeRecognition;
    });
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(e.message));

    // Dashboard: every course as a card, like a notebook library; a card opens the course.
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("heading", { name: "My courses" }).waitFor();
    const cards = page.getByRole("list", { name: "Courses" }).getByRole("listitem");
    const { data: withMaterial } = await admin.from("courses").select("id, materials(count)").eq("programme", "computer-science").eq("level", 400);
    const expected = (withMaterial ?? []).filter((c: any) => (c.materials?.[0]?.count ?? 0) > 0).length;
    check((await cards.count()) === expected, "dashboard shows a card for every course with material", `${await cards.count()} cards, ${expected} courses`);
    await shot(page, "1a-dashboard");
    await page.getByRole("searchbox", { name: "Search courses" }).first().fill("zzzz-nothing");
    check(await page.getByText(/No courses match/).isVisible(), "dashboard search filters courses");
    await page.getByRole("searchbox", { name: "Search courses" }).first().fill("");
    await page.getByRole("button", { name: "List view" }).click();
    check((await cards.count()) === expected, "list view shows the same courses");
    await page.getByRole("button", { name: "Grid view" }).click();
    await cards.first().getByRole("link").first().click();
    await page.waitForURL(/\/study\/[A-Z]{3}\d{3}/);
    check(true, "a course card opens that course", new URL(page.url()).pathname);
    // Inside a course the left panel lists only that course's topics (other courses live on My courses).
    await page.goto(`${BASE}/study/CSC420`);
    const topicsPanel = page.getByRole("navigation", { name: "Topics and chats" });
    await topicsPanel.getByRole("button", { name: "Transactions and indexing", exact: true }).waitFor();
    check(
      (await topicsPanel.getByRole("button", { name: "Foundations of research", exact: true }).count()) === 0 &&
        (await page.getByRole("button", { name: /^CSC 409/ }).count()) === 0,
      "course page lists only this course's topics, no other courses",
    );
    check(await page.getByRole("heading", { level: 1, name: "Data Management II" }).isVisible(), "top bar names the course");
    check(await page.getByRole("link", { name: "All courses" }).first().isVisible(), "logo goes back to My courses");
    await page.getByRole("button", { name: "Transactions and indexing", exact: true }).click();
    await page.getByRole("heading", { name: "Transactions and indexing" }).waitFor();
    check(await page.getByRole("button", { name: "Summarize this topic" }).isVisible(), "topic empty state shows the three starters");
    await page.getByRole("button", { name: "Speak your question" }).click();
    await page.getByRole("status").filter({ hasText: "Listening" }).waitFor({ timeout: 3000 });
    await page.waitForFunction(() => (document.querySelector("textarea[aria-label='Your question']") as HTMLTextAreaElement)?.value.includes("B tree"), null, { timeout: 3000 });
    await page.getByRole("button", { name: "Stop voice typing" }).click();
    await page.getByRole("button", { name: "Speak your question" }).waitFor({ timeout: 3000 });
    check((await page.locator("textarea[aria-label='Your question']:visible").inputValue()) === "what is a B tree index", "voice typing writes the spoken question into the box (student still presses Send)");
    await page.locator("textarea[aria-label='Your question']:visible").fill("");
    // Sources: the materials behind this topic, on the right; a source opens in the slide viewer.
    const sources = page.getByRole("complementary", { name: "Sources" });
    const { data: topicMats } = await admin.from("materials").select("title, topics!inner(title), courses!inner(code)").eq("courses.code", "CSC420").eq("topics.title", "Transactions and indexing");
    const srcCount = await sources.getByRole("listitem").count();
    check(srcCount === (topicMats ?? []).length && srcCount > 0, "Sources lists this topic's materials", `${srcCount} shown, ${(topicMats ?? []).length} in the topic`);
    await topicsPanel.getByRole("button", { name: "Whole course", exact: true }).click();
    const { count: courseMats } = await admin.from("materials").select("id, courses!inner(code)", { count: "exact", head: true }).eq("courses.code", "CSC420");
    await page.waitForTimeout(300);
    check((await sources.getByRole("listitem").count()) === courseMats, "Whole course lists every material in the course", `${await sources.getByRole("listitem").count()} vs ${courseMats}`);
    await sources.getByRole("button").filter({ hasText: /Slides/ }).first().click();
    const viewer = page.getByRole("dialog", { name: "Slide preview" });
    await viewer.locator("img").waitFor({ timeout: 15000 });
    await viewer.getByRole("button", { name: "Next slide" }).click();
    await viewer.getByText(/Slide 2 of \d+/).waitFor({ timeout: 15000 });
    check(true, "a source opens in the viewer and pages can be flipped");
    await shot(page, "1b-laptop-sources");
    await viewer.getByRole("button", { name: "Close preview" }).click();
    // Search the web: a separate box that hands the question to the student's own chatbot.
    await page.evaluate(() => { (window as any).__opened = null; window.open = ((u: string) => { (window as any).__opened = u; return null; }) as any; });
    await page.getByRole("radio", { name: "Claude" }).click();
    check(await page.getByRole("radio", { name: "Claude" }).getAttribute("aria-checked") === "true", "web search engine is a clear one-tap switch");
    await page.getByRole("textbox", { name: "Search the web" }).fill("latest PostgreSQL version");
    await page.keyboard.press("Enter");
    const webUrl = await page.evaluate(() => (window as any).__opened as string | null);
    check(!!webUrl && /^https:\/\/(chatgpt\.com|claude\.ai|www\.google\.com)\//.test(webUrl) && webUrl.includes("PostgreSQL"), "Search the web opens the student's own chatbot with the question", (webUrl ?? "").slice(0, 80));
    check(!!webUrl && webUrl.startsWith("https://claude.ai/new?q="), "the chosen engine (Claude) gets the question");
    await topicsPanel.getByRole("button", { name: "Transactions and indexing", exact: true }).click();
    await page.getByRole("heading", { name: "Transactions and indexing" }).waitFor();
    const sidebarBox = await page.locator("aside:visible").first().boundingBox();
    check(!!sidebarBox && sidebarBox.x <= 16 && sidebarBox.width >= 280, "Topics is a fixed panel on laptop", JSON.stringify(sidebarBox));
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

    // Feedback (F7): thumbs on the answer, a reason on thumbs down, saved per answer.
    const answerLi = page.locator("main li[data-message='assistant']:visible").last();
    await answerLi.getByRole("button", { name: "Good answer" }).click();
    await page.waitForTimeout(600);
    let { data: fbRows } = await admin.from("feedback").select("rating, reason").eq("user_id", me!.id);
    check(fbRows?.length === 1 && fbRows[0].rating === 1, "thumbs up is saved", JSON.stringify(fbRows));
    await answerLi.getByRole("button", { name: "Bad answer" }).click();
    await answerLi.getByRole("button", { name: "Not in my slides" }).click();
    await answerLi.getByText("Thanks, that helps.").waitFor();
    await page.waitForTimeout(600);
    ({ data: fbRows } = await admin.from("feedback").select("rating, reason").eq("user_id", me!.id));
    check(fbRows?.length === 1 && fbRows[0].rating === -1 && fbRows[0].reason === "not_in_slides", "thumbs down replaces it, with the reason", JSON.stringify(fbRows));

    // "Is this helping you study?" after the 10th question, answered once.
    const pulse = page.getByRole("group", { name: "Is this helping you study?" });
    check(await pulse.isVisible(), "after the 10th question the partner asks 'Is this helping you study?'");
    await shot(page, "2a-laptop-feedback-pulse");
    await pulse.getByRole("button", { name: "4 out of 5" }).click();
    await pulse.getByText(/Thank you/).waitFor();
    await page.waitForTimeout(400);
    const { data: pulseRows } = await admin.from("pulse_responses").select("score").eq("user_id", me!.id);
    check(pulseRows?.length === 1 && pulseRows[0].score === 4, "the 1–5 answer is saved", JSON.stringify(pulseRows));
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
    check(await page.locator("main li[data-message='assistant']:visible").last().getByRole("button", { name: "Bad answer" }).getAttribute("aria-pressed") === "true", "the rating is still shown after a reload");
    check(!(await page.getByRole("group", { name: "Is this helping you study?" }).isVisible()), "the helping question is not asked again once answered");

    // Off-topic question in the topic chat: labelled fallback, chips name the other topic.
    await page.locator("textarea[aria-label='Your question']:visible").fill("What's the difference between a function and a stored procedure?");
    await page.keyboard.press("Enter");
    await page.getByText("Searching your slides…").waitFor({ timeout: 5000, state: "attached" }).catch(() => {});
    // Scrolling up while the answer streams: the chat stays put (it used to snap back down).
    {
      const box = page.locator("main div.overflow-y-auto:visible").first();
      await page.waitForFunction(() => [...document.querySelectorAll("main li[data-message='assistant']")].at(-1)?.textContent?.length! > 200, null, { timeout: 30000 }).catch(() => null);
      const streaming = await page.getByRole("button", { name: "Send" }).count() === 0;
      if (streaming) {
        await box.hover();
        await page.mouse.wheel(0, -1500);
        await page.waitForTimeout(1500);
        const away = await box.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
        check(away > 200, "scrolling up while an answer streams keeps you where you scrolled", `${Math.round(away)}px from the bottom`);
        const jump = page.getByRole("button", { name: "Jump to latest ↓" });
        if (await page.getByRole("button", { name: "Send" }).count() === 0) {
          check(await jump.isVisible(), "'Jump to latest' appears while you read further up");
          await jump.click();
          await page.waitForTimeout(800);
          const after = await box.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
          check(after < 80, "'Jump to latest' goes back to the answer and follows it", `${Math.round(after)}px from the bottom`);
        }
      } else {
        console.log("  note the answer finished before the scroll check could run");
      }
    }
    await page.getByRole("button", { name: "Send" }).waitFor({ timeout: 40000 });
    const label = page.locator("main p:visible", { hasText: "Not in Transactions and indexing" });
    check((await label.count()) === 1, "fallback label shown above the off-topic answer", (await label.first().textContent().catch(() => "")) ?? "");
    const otherChip = page.locator("li button[title^='Open Functions, Procedures and Triggers · Slide']:visible");
    check((await otherChip.count()) > 0, "off-topic chips name the other material, slide number never cut", (await otherChip.first().textContent().catch(() => "none")) ?? "");
    await page.locator("main li[data-message]:visible").last().scrollIntoViewIfNeeded();
    await shot(page, "3b-laptop-fallback");

    // Edit a sent question (like ChatGPT/Claude): it and its answer are replaced, the rest stays.
    const lastQuestion = page.locator("main li[data-message='user']:visible").last();
    await lastQuestion.hover();
    await lastQuestion.getByRole("button", { name: "Edit question" }).click();
    const editBox = page.getByRole("textbox", { name: "Edit your question" });
    check(await editBox.inputValue() === "What's the difference between a function and a stored procedure?", "Edit opens the question in a box, text kept");
    await editBox.fill("What does the D in ACID mean?");
    await page.locator("main").getByRole("button", { name: "Send", exact: true }).first().click();
    await page.getByText("Searching your slides…").waitFor({ timeout: 5000, state: "attached" }).catch(() => {});
    await page.locator("form").getByRole("button", { name: "Send" }).last().waitFor({ timeout: 40000 });
    await page.locator("main li[data-message='assistant']:visible").nth(1).waitFor({ timeout: 40000 });
    await page.waitForTimeout(1500); // the answer is saved when it finishes
    const shown = await page.locator("main li[data-message]:visible").count();
    check(shown === 4, "after the edit the chat still has 4 messages (edited question + new answer)", `${shown}`);
    check(await page.locator("main li[data-message='user']:visible").last().innerText().then((t) => t.includes("What does the D in ACID mean?")), "the edited wording is shown");
    const editedChat = new URL(page.url()).searchParams.get("chat")!;
    const { data: rows } = await admin.from("messages").select("role, content").eq("conversation_id", editedChat).order("created_at");
    check(
      rows?.length === 4 && rows[2].content === "What does the D in ACID mean?" && !rows.some((r) => r.content.includes("stored procedure?")),
      "the database holds the edited question and its new answer; the old one is gone",
      JSON.stringify(rows?.map((r) => `${r.role}:${r.content.slice(0, 30)}`)),
    );
    await page.reload();
    await page.locator("main li[data-message]:visible").first().waitFor({ timeout: 15000 });
    check(await page.locator("main li[data-message='user']:visible").last().innerText().then((t) => t.includes("What does the D in ACID mean?")), "the edit survives a reload");

    // Past questions (PRD F10): Exam map, practice, marking, the topic chip.
    console.log("\nPast questions");
    if (process.env.NEXT_PUBLIC_PAST_QUESTIONS === "1") {
      const { data: me } = await admin.from("profiles").select("id").eq("email", email).single();
      const userId = me!.id as string;
      const pq = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await pq.context().addCookies(await page.context().cookies());
      pq.on("pageerror", (e) => consoleErrors.push(e.message));
      await pq.goto(`${BASE}/study/INS401?past=1`);
      await pq.getByText("Based on past papers, not a prediction.").waitFor({ timeout: 15000 });
      check(new URL(pq.url()).searchParams.get("past") === "1", "Past questions opens from the Topics panel (URL ?past=1)");
      check(await pq.getByText(/Asked in \d+ of 2/).first().isVisible(), "the Exam map says 'Asked in N of 2 papers', no percentages", "");
      check(!(await pq.locator("main").innerText()).includes("%"), "the Exam map shows no percentages");
      await shot(pq, "past-1-map");

      await pq.getByRole("tab", { name: "Practice" }).click();
      await pq.getByRole("button", { name: /2025\/26 exam/ }).click();
      await pq.getByText("Describe the following forms of project development life cycle", { exact: false }).waitFor();
      check(!(await pq.getByText("Model answer").count()), "the model answer is not on the page before an attempt");
      check(await pq.getByText(/2025\/26 exam · Q1a · 9 marks|· Q1a/).first().isVisible(), "a question shows its paper, number and marks");
      await pq.getByRole("button", { name: "Show answer" }).click();
      await pq.getByText("Model answer").waitFor({ timeout: 15000 });
      check((await pq.locator("article button[title^='Open']").count()) > 0, "'Show answer' reveals the model answer with slide chips");
      await shot(pq, "past-2-revealed");

      await pq.getByRole("button", { name: "Next question →" }).click();
      await pq.getByPlaceholder(/Write your answer/).fill("Conflict sources: scarce resources, schedules, priorities, personalities, and technical opinions.");
      await pq.getByRole("button", { name: "Mark my answer" }).click();
      await pq.getByText("estimated score").waitFor({ timeout: 45000 });
      const scoreText = await pq.getByText(/≈ [\d.]+\/5/).first().innerText().catch(() => "");
      check(/≈ [\d.]+\/5/.test(scoreText), "a written answer is marked: '≈ n/5' with feedback, then the model answer", scoreText);
      await shot(pq, "past-3-marked");
      const { data: attempts } = await admin.from("practice_attempts").select("score, max_score, revealed_only").eq("user_id", userId);
      const { data: mtraces } = await admin.from("traces").select("kind, model").eq("user_id", userId).eq("kind", "marking");
      check(attempts?.length === 2 && attempts.some((a) => a.revealed_only) && attempts.some((a) => Number(a.max_score) === 5), "attempts are saved (one reveal, one marked)", JSON.stringify(attempts));
      check(mtraces?.length === 1, "the marking call is logged as a trace (kind = marking)");

      // Multiple choice: instant right/wrong.
      await pq.getByRole("button", { name: "← All" }).click();
      await pq.getByRole("button", { name: /2025\/26 test/ }).click();
      await pq.locator("article button:has-text('A.')").first().click();
      await pq.getByText(/^(Correct\.|Not quite: the answer is [A-Da-d]\.)$/).waitFor({ timeout: 15000 });
      check(true, "a multiple-choice question is checked instantly");

      // Topic chip in a topic chat → practice for that topic, then back to the chat.
      const chip = pq.getByRole("button", { name: /^\d+ past questions?$/ });
      await pq.goto(`${BASE}/study/INS401?topic=1`);
      await chip.or(pq.getByText("Whole course")).first().waitFor();
      if (!(await chip.count())) await pq.goto(`${BASE}/study/INS401?topic=2`);
      await chip.waitFor({ timeout: 10000 });
      await chip.click();
      await pq.getByRole("button", { name: "← Back to chat" }).waitFor();
      const counter = await pq.locator("main span.tabular-nums").filter({ hasText: /^\d+ of \d+$/ }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
      check(counter, "a topic chat's 'N past questions' chip opens practice for that topic");
      await shot(pq, "past-4-topic-chip");
      await pq.getByRole("button", { name: "← Back to chat" }).click();
      check(!(await pq.getByRole("button", { name: "← Back to chat" }).count()), "'Back to chat' returns to the chat");

      // A course with one paper: no map.
      await pq.goto(`${BASE}/study/CSC402?past=1`);
      await pq.getByText("Few past papers for this course.").waitFor({ timeout: 15000 });
      check(true, "a course with fewer than 2 papers says 'Few past papers for this course.'");

      // Signed out: nothing.
      const anon = await fetch(`${BASE}/api/past?course=00000000-0000-0000-0000-000000000000`);
      const anonAttempt = await fetch(`${BASE}/api/past/attempt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question_id: "00000000-0000-0000-0000-000000000000", reveal: true }) });
      check(anon.status === 401 && anonAttempt.status === 401, "signed-out requests to past questions get 401", `${anon.status}/${anonAttempt.status}`);
      await pq.close();
    }
    else {
      // Not launched yet (lib/past/feature.ts): every course shows "Past questions · Soon" → "Coming soon".
      const pq = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await pq.context().addCookies(await page.context().cookies());
      const { data: meP } = await admin.from("profiles").select("id").eq("email", email).single();
      const asProgramme = (programme: string) => admin.from("profiles").update({ programme, level: 400 }).eq("id", meP!.id);
      for (const [code, programme] of [["INS401", "computer-science"], ["ISM413", "information-science-and-media-studies"]]) {
        await asProgramme(programme); // ISM413 is only visible to an ISMS student (PRD F11)
        await pq.goto(`${BASE}/study/${code}`);
        const nav = pq.getByRole("navigation", { name: "Topics and chats" });
        await nav.getByRole("button", { name: "Whole course" }).waitFor({ timeout: 15000 });
        check(!(await nav.getByRole("button", { name: /Past questions/ }).count()), `${code}: no Past questions entry in the sidebar (owner: it took too much room)`);
        await pq.goto(`${BASE}/study/${code}?past=1`);
        await pq.getByText("Coming soon", { exact: true }).waitFor({ timeout: 10000 });
        check(!(await pq.getByText(/Exam map|Mark my answer|Asked in/).count()), `${code}: the Past questions page still only says 'Coming soon'`);
        await shot(pq, `past-soon-${code}`);
      }
      await asProgramme("computer-science");
      await pq.goto(`${BASE}/study/INS401?topic=2`);
      await pq.getByRole("navigation", { name: "Topics and chats" }).waitFor();
      check(!(await pq.getByRole("button", { name: /past questions?$/ }).count()), "topic chats show no past-question chips before launch");
      const api = await pq.request.get(`${BASE}/api/past?course=00000000-0000-0000-0000-000000000000`);
      check(api.status() === 404, "the past-questions data route is closed before launch", String(api.status()));
      await pq.close();
    }

    // Word notes (PRD F11): an ISM413 answer cites a Word section, and the viewer shows that page.
    console.log("\nWord notes (ISM413)");
    {
      const { data: meW } = await admin.from("profiles").select("id").eq("email", email).single();
      await admin.from("profiles").update({ programme: "information-science-and-media-studies", level: 400 }).eq("id", meW!.id);
      const wp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await wp.context().addCookies(await page.context().cookies());
      await wp.goto(`${BASE}/study/ISM413`);
      const box = wp.getByRole("textbox").last();
      await box.waitFor();
      await box.fill("What are the four privacy torts in Nigerian law?");
      await box.press("Enter");
      const chip = wp.locator("main button[title^='Open LAW OF PRIVACY']").first();
      await chip.waitFor({ timeout: 60000 });
      const chipText = await chip.innerText();
      check(!/Slide \d|p\. \d/.test(chipText), "a Word-notes citation names the section, not a page number", chipText.replace(/\s+/g, " "));
      await chip.click();
      const img = wp.locator("aside[role='dialog'] img").first();
      await img.waitFor({ timeout: 15000 });
      const loaded = await img.evaluate((el: HTMLImageElement) => new Promise<boolean>((resolve) => {
        const ok = () => resolve(el.complete && el.naturalWidth > 500);
        if (el.complete) ok(); else { el.addEventListener("load", ok, { once: true }); el.addEventListener("error", () => resolve(false), { once: true }); setTimeout(ok, 20000); }
      }));
      check(loaded, "the viewer shows the real page of the Word document");
      check(await wp.locator("aside[role='dialog']").getByText(/Lecture notes ·/).isVisible(), "the viewer's header names the section");
      await shot(wp, "word-notes-viewer");
      await wp.close();
      await admin.from("profiles").update({ programme: "computer-science", level: 400 }).eq("id", meW!.id);
    }

    // Admin dashboard: hidden from students; the owner sees the pilot, including this test's activity.
    console.log("\nAdmin dashboard");
    const chatUrl = page.url(); // the phone checks below reopen this chat
    const adminRes = await page.goto(`${BASE}/admin`);
    check(adminRes?.status() === 404, "a student opening /admin gets 'not found'", String(adminRes?.status()));
    // That 404 is deliberate; the browser logs it as a console error, so don't count it.
    await page.waitForTimeout(300);
    for (let i = consoleErrors.length - 1; i >= 0; i--) if (/status of 404/.test(consoleErrors[i])) consoleErrors.splice(i, 1);
    if (!process.env.E2E_BASE_URL) {
      try {
        const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await actx.addCookies(await signInCookies(adminEmail));
        const ap = await actx.newPage();
        ap.on("pageerror", (e) => consoleErrors.push(e.message));
        const r = await ap.goto(`${BASE}/admin?range=7d`);
        await ap.getByRole("heading", { name: "Pilot dashboard" }).waitFor();
        check(r?.status() === 200, "the owner sees the admin dashboard");
        // Password resets: "Escalate to admin" (student) → the owner sets a temporary password here.
        const resetFor = `ui-reset-${Date.now()}@pau.edu.ng`;
        try {
          await signInCookies(resetFor, { fresh: true });
          const sp = await browser.newPage();
          await sp.goto(`${BASE}/sign-in`);
          await sp.locator("#email").fill(resetFor);
          await sp.locator("#password").fill("not-the-password-1");
          await sp.getByRole("button", { name: "Log in", exact: true }).click();
          const esc = sp.getByRole("link", { name: "Escalate to admin" });
          await esc.waitFor({ timeout: 10000 });
          const href = (await esc.getAttribute("href")) ?? "";
          check(href.startsWith("mailto:hello@askyourslides.com?") && decodeURIComponent(href).includes(resetFor) && /forgot my password/i.test(decodeURIComponent(href)),
            "a wrong password on a real account offers 'Escalate to admin': a prefilled email to the owner", decodeURIComponent(href).slice(0, 90));
          await sp.locator("#email").fill(`nobody-${Date.now()}@pau.edu.ng`);
          await sp.getByRole("button", { name: "Log in", exact: true }).click();
          await sp.getByText(/no account with this email/i).waitFor({ timeout: 10000 });
          check(!(await esc.count()), "an email with no account gets no escalate button");
          await sp.close();
          await ap.locator("#support input[name=email]").fill(resetFor);
          await ap.locator("#support input[minlength]").fill("temp-pass-4321");
          await ap.getByRole("button", { name: "Set password" }).click();
          await ap.getByText(/Done\. Reply to/).waitFor({ timeout: 10000 });
          const login = await fetch(`${BASE}/api/auth/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: resetFor, password: "temp-pass-4321" }) });
          check(login.ok, "the owner's 'Reset a student's password' sets a password the student can log in with", String(login.status));
        } finally {
          await cleanup(resetFor);
        }
        const questionsTile = await ap.getByText("Questions", { exact: true }).first().locator("..").locator("p").nth(1).textContent();
        check(Number((questionsTile ?? "0").replace(/,/g, "")) >= 11, "headline numbers include this test's questions", `questions tile: ${questionsTile}`);
        const feedback = ap.locator("#feedback");
        check((await feedback.getByText("What does ACID stand for?").count()) >= 1, "the thumbs down from this test is in the feedback feed");
        check((await ap.locator("#students").getByText(email).count()) === 1, "the test student is in the students table");
        await feedback.getByText("What does ACID stand for?").first().click();
        check(await feedback.locator("details[open] pre").first().isVisible(), "a feedback item opens to show the full answer");
        await shot(ap, "10-admin");
        await ap.locator("#answers").scrollIntoViewIfNeeded();
        await shot(ap, "11-admin-answers");
        await actx.close();
      } finally {
        await cleanup(adminEmail);
      }
    }

    console.log("\nPhone 375×812");
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await phone.addCookies(cookies);
    const p2 = await phone.newPage();
    p2.on("pageerror", (e) => consoleErrors.push(e.message));
    await p2.goto(chatUrl);
    await p2.locator("li button[title^='Open ']:visible").first().waitFor({ timeout: 15000 });
    const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, "no sideways scrolling at 375px", `${overflow}px`);
    const drawer = await p2.locator("aside").first().boundingBox();
    check(!!drawer && drawer.x < 0, "sidebar is hidden off-screen on phone", JSON.stringify(drawer));
    await shot(p2, "4-phone-chat");
    await p2.getByRole("button", { name: "Open topics" }).click();
    // Wait for the slide-in to finish rather than a fixed delay (slower on a real network).
    await p2.waitForFunction(() => Math.round(document.querySelector("aside")!.getBoundingClientRect().x) === 0, null, { timeout: 3000 }).catch(() => {});
    const opened = await p2.locator("aside").first().boundingBox();
    check(!!opened && Math.abs(opened.x) < 1, "menu button opens the drawer", JSON.stringify(opened));
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
