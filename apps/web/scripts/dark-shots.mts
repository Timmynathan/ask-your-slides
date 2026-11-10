// Screenshots of every page and key state in dark mode (and light, with --light), for a visual
// check. Signs a temporary student in, seeds one chat with an answer (citations + a beyond-the-slides
// box), shoots, then deletes the student. Uses a running server: BASE=http://localhost:3123.
//
//   BASE=http://localhost:3123 node scripts/dark-shots.mts <out-dir> [--light]
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import nextEnv from "@next/env";
import { chromium, type Page } from "playwright";

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, "../../.."));
const BASE = process.env.BASE ?? "http://localhost:3123";
const out = process.argv[2];
const scheme = process.argv.includes("--light") ? "light" : "dark";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const email = `dark-shots-${Date.now()}@pau.edu.ng`;

async function cookiesFor(addr: string, onboarded: boolean) {
  await admin.auth.admin.createUser({ email: addr, email_confirm: true });
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: addr });
  const res = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: addr, code: data.properties!.email_otp }) });
  if (onboarded) {
    const { data: u } = await admin.from("profiles").select("id").eq("email", addr).single();
    await admin.from("profiles").update({ onboarded: true, display_name: "Dami", study_partner: "zara", department: "Computer Science", programme: "computer-science", level: 400 }).eq("id", u!.id);
  }
  const url = new URL(BASE);
  return res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: url.hostname, path: "/" };
  });
}

const shot = (p: Page, name: string) => p.screenshot({ path: `${out}/${scheme}-${name}.png` });

const browser = await chromium.launch();
try {
  for (const [w, h, tag] of [[1440, 900, "lap"], [390, 844, "phone"]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`); await p.waitForTimeout(700); await shot(p, `${tag}-landing`);
    if (tag === "lap") { await p.screenshot({ path: `${out}/${scheme}-lap-landing-full.png`, fullPage: true }); }
    await p.goto(`${BASE}/sign-up`); await p.waitForTimeout(400); await shot(p, `${tag}-signup`);
    await p.goto(`${BASE}/sign-in`); await p.waitForTimeout(400); await shot(p, `${tag}-signin`);
    await ctx.close();
  }

  // Onboarding (fresh student)
  const fresh = `dark-shots-new-${Date.now()}@pau.edu.ng`;
  try {
    const octx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    await octx.addCookies(await cookiesFor(fresh, false));
    const op = await octx.newPage();
    await op.goto(`${BASE}/welcome`); await op.waitForTimeout(500); await shot(op, "lap-onboard-name");
    await op.getByLabel("Your name").fill("Dami");
    await op.getByRole("combobox", { name: "What do you study?" }).selectOption("computer-science");
    await op.getByRole("button", { name: "Continue" }).click();
    await op.getByRole("radiogroup", { name: "Study partners" }).waitFor(); await op.waitForTimeout(500); await shot(op, "lap-onboard-partner");
    await octx.close();
  } finally {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const u = data?.users.find((x) => x.email === fresh);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }

  // Signed-in student with a seeded chat
  const cookies = await cookiesFor(email, true);
  const { data: me } = await admin.from("profiles").select("id").eq("email", email).single();
  const { data: course } = await admin.from("courses").select("id").eq("code", "CSC420").single();
  const { data: topic } = await admin.from("topics").select("id").eq("course_id", course!.id).eq("title", "Transactions and indexing").single();
  const { data: conv, error: convErr } = await admin.from("conversations").insert({ user_id: me!.id, course_id: course!.id, topic_id: topic!.id, title: "What does ACID stand for?" }).select("id").single();
  if (convErr) throw convErr;
  const cite = (n: number) => ({ slide_key: `CSC420-02-${n}`, material_title: "Transactions and Indexing", material_kind: "slides", slide_number: n, topic_title: "Transactions and indexing" });
  const { error: msgErr } = await admin.from("messages").insert([
    { conversation_id: conv!.id, user_id: me!.id, role: "user", content: "What does ACID stand for?", citations: [] },
    {
      conversation_id: conv!.id, user_id: me!.id, role: "assistant", citations: [cite(5), cite(6)],
      content: "ACID stands for **Atomicity, Consistency, Isolation and Durability**. [[s:CSC420-02-5]]\n\nYour slides define each one briefly. [[s:CSC420-02-6]]\n<general>\nThink of a bank transfer: either both the debit and the credit happen, or neither does.\n\n**Exam tip:** define each letter with a one-line example.\n</general>",
    },
  ]);
  if (msgErr) throw msgErr;

  for (const [w, h, tag] of [[1440, 900, "lap"], [390, 844, "phone"]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    await ctx.addCookies(cookies);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/dashboard`); await p.getByRole("heading", { name: "My courses" }).waitFor(); await p.waitForTimeout(400); await shot(p, `${tag}-dashboard`);
    if (tag === "lap") {
      await p.getByRole("button", { name: "Account" }).click(); await p.waitForTimeout(300); await shot(p, "lap-account-menu");
      await p.getByRole("button", { name: "Delete account" }).click(); await p.waitForTimeout(300); await shot(p, "lap-delete-dialog");
      await p.keyboard.press("Escape");
      await p.getByRole("button", { name: "List view" }).click(); await p.waitForTimeout(300); await shot(p, "lap-dashboard-list");
      await p.getByRole("button", { name: "Grid view" }).click();
    }
    await p.goto(`${BASE}/study/CSC420?topic=1&chat=${conv!.id}`);
    await p.locator("main li[data-message]").first().waitFor({ timeout: 15000 }); await p.waitForTimeout(600); await shot(p, `${tag}-chat`);
    if (tag === "lap") {
      await p.locator("li button[title^='Open ']").first().click();
      await p.getByRole("dialog", { name: "Slide preview" }).locator("img").waitFor({ timeout: 15000 }); await p.waitForTimeout(600); await shot(p, "lap-slide");
      await p.getByRole("button", { name: "Close preview" }).click();
      await p.getByRole("button", { name: "Bad answer" }).click(); await p.waitForTimeout(300); await shot(p, "lap-feedback");
      await p.goto(`${BASE}/study/CSC420?topic=1`); await p.waitForTimeout(800); await shot(p, "lap-empty-topic");
      await p.getByRole("button", { name: /Studying with/ }).click(); await p.waitForTimeout(400); await shot(p, "lap-partner-picker");
    } else {
      await p.getByRole("button", { name: "Open topics" }).click(); await p.waitForTimeout(400); await shot(p, "phone-drawer");
    }
    await ctx.close();
  }
  // Admin dashboard (the server must list ADMIN_SHOT_EMAIL in ADMIN_EMAILS).
  const adminShot = process.env.ADMIN_SHOT_EMAIL;
  if (adminShot) {
    try {
      const actx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
      await actx.addCookies(await cookiesFor(adminShot, true));
      const ap = await actx.newPage();
      await ap.goto(`${BASE}/admin?range=all`); await ap.getByRole("heading", { name: "Pilot dashboard" }).waitFor(); await ap.waitForTimeout(500);
      await ap.screenshot({ path: `${out}/${scheme}-lap-admin-full.png`, fullPage: true });
      await actx.close();
    } finally {
      const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const u = data?.users.find((x) => x.email === adminShot);
      if (u) await admin.auth.admin.deleteUser(u.id);
    }
  }
} finally {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = data?.users.find((x) => x.email === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
  await browser.close();
}
console.log(`${scheme} screenshots in ${out}`);
