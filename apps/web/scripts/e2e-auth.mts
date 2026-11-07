// Phase 3 end-to-end proof, against a real `next start` server and the real Supabase project.
//   npm run test:e2e:auth     (run `npm run build` first)
//
// No email is ever sent: the test user's code comes from the admin API (generateLink), and the
// blocked sign-up is rejected by the auth hook before any mail is attempted.
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import path from "node:path";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

loadEnvConfig(path.resolve(import.meta.dirname, "../../.."));
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
// E2E_BASE_URL=http://localhost:3000 tests an already-running server (e.g. your `npm run dev`).
const PORT = 3100 + Math.floor(Math.random() * 500);
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

class Jar {
  private cookies = new Map<string, string>();
  maxAges: number[] = [];
  take(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const [name, ...v] = pair.split("=");
      const maxAge = attrs.map((a) => a.trim()).find((a) => a.toLowerCase().startsWith("max-age="));
      const age = maxAge ? Number(maxAge.split("=")[1]) : undefined;
      if (age === 0 || v.join("=") === "") this.cookies.delete(name.trim());
      else {
        this.cookies.set(name.trim(), v.join("="));
        if (age !== undefined) this.maxAges.push(age);
      }
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  get size() {
    return this.cookies.size;
  }
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE}/sign-in`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("server did not start");
}

async function deleteUserByEmail(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = data?.users.find((x) => x.email === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
}

async function main() {
  // The server gets NO Supabase/model variables from this script: it must load .env itself,
  // exactly as `npm run dev` / `npm start` do. (Inheriting them once hid a dev-only env bug.)
  const serverEnv = { ...process.env };
  for (const k of Object.keys(serverEnv)) {
    if (/SUPABASE|ANTHROPIC|VOYAGE|DATABASE_URL|PRIVACY/.test(k)) delete serverEnv[k];
  }
  const server = process.env.E2E_BASE_URL ? null : spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore", env: serverEnv,
  });
  const testEmail = `e2e-${Date.now()}@pau.edu.ng`;
  try {
    await waitForServer();

    // 1. Signed-out visitors are sent to sign-in.
    let res = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
    check(res.status === 307 && res.headers.get("location")?.endsWith("/sign-in") === true, "signed-out /dashboard redirects to /sign-in", `${res.status} ${res.headers.get("location")}`);

    // 2. The app rejects gmail before asking Supabase for a code.
    res = await fetch(`${BASE}/api/auth/otp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "someone@gmail.com" }) });
    const body = await res.json();
    check(res.status === 400 && body.error === "Use your PAU email.", "app rejects someone@gmail.com with 'Use your PAU email.'", `${res.status} ${JSON.stringify(body)}`);

    // 3. Supabase itself refuses non-PAU sign-ups made with the public key, i.e. by someone
    //    bypassing the app (auth hook). The admin API is trusted and skips hooks, so this goes
    //    through the public path. The address is on .invalid, a domain that can never receive
    //    mail, so even a misconfigured hook can't email anyone.
    const blocked = `e2e-blocked-${Date.now()}@example.invalid`;
    const { error: hookError } = await anon.auth.signInWithOtp({ email: blocked, options: { shouldCreateUser: true } });
    const hookOn = !!hookError?.message?.includes("Use your PAU email.");
    check(hookOn, "Supabase refuses a non-PAU sign-up made with the public key (auth hook)", hookOn ? "" :
      `got: ${hookError?.message ?? "no error"} — enable it: Dashboard → Authentication → Hooks → Before User Created → public.hook_before_user_created`);
    await deleteUserByEmail(blocked);

    // 4. A PAU student signs in with a code.
    const { error: createErr } = await admin.auth.admin.createUser({ email: testEmail, email_confirm: true });
    check(!createErr, "create PAU test user", createErr?.message);
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: testEmail });
    const code = link?.properties?.email_otp;
    check(!!code && !linkErr, "get a sign-in code without sending email", linkErr?.message);

    const jar = new Jar();
    res = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: testEmail, code: "000000" }) });
    check(res.status === 401, "wrong code is refused", String(res.status));

    res = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: testEmail, code }) });
    jar.take(res);
    const verified = await res.json();
    check(res.status === 200 && verified.next === "/welcome", "correct code signs in; first sign-in goes to /welcome", JSON.stringify(verified));
    check(jar.size > 0, "session cookie set");

    // 4b. Right after the code: create a password (PRD F1: the code is a one-time step).
    res = await fetch(`${BASE}/api/auth/set-password`, { method: "POST", headers: { "Content-Type": "application/json", cookie: jar.header() }, body: JSON.stringify({ password: "short" }) });
    check(res.status === 400, "too-short password refused", String(res.status));
    res = await fetch(`${BASE}/api/auth/set-password`, { method: "POST", headers: { "Content-Type": "application/json", cookie: jar.header() }, body: JSON.stringify({ password: "revise4exams!" }) });
    jar.take(res);
    check(res.status === 200, "password created after the code", `${res.status} ${JSON.stringify(await res.json())}`);
    const thirtyDays = 60 * 60 * 24 * 30;
    check(jar.maxAges.length > 0 && jar.maxAges.every((a) => a === thirtyDays), "session cookie lasts 30 days", `max-age ${jar.maxAges.join(",")}`);

    // 5a. The display-name step renders for a first-time student.
    res = await fetch(`${BASE}/welcome`, { headers: { cookie: jar.header() }, redirect: "manual" });
    jar.take(res);
    const welcome = await res.text();
    check(res.status === 200 && welcome.includes("What should we call you"), "first-time student sees the display-name step", String(res.status));

    // 5. Signed in (after the welcome step): the study page shows the student and every course,
    //    read through RLS. (/dashboard forwards here.)
    const { data: prof } = await admin.from("profiles").select("id").eq("email", testEmail).single();
    await admin.from("profiles").update({ onboarded: true }).eq("id", prof!.id);
    res = await fetch(`${BASE}/study/CSC420`, { headers: { cookie: jar.header() }, redirect: "manual" });
    jar.take(res);
    const html = await res.text();
    check(res.status === 200 && html.includes(testEmail), "signed-in study page shows the student", String(res.status));
    const { data: allCourses } = await admin.from("courses").select("code");
    const missing = (allCourses ?? []).map((c) => c.code.replace(/^([A-Z]+)/, "$1 ")).filter((c) => !html.includes(c));
    check(!!allCourses?.length && missing.length === 0, `all ${allCourses?.length} courses visible to the student`, missing.join(", "));

    // 6. Signed in users are kept off /sign-in.
    res = await fetch(`${BASE}/sign-in`, { headers: { cookie: jar.header() }, redirect: "manual" });
    check(res.status === 307 && res.headers.get("location")?.endsWith("/dashboard") === true, "signed-in /sign-in redirects to /dashboard");

    // 6b. A second browser for the same student (e.g. phone), to check sign-out is per browser.
    const { data: link2 } = await admin.auth.admin.generateLink({ type: "magiclink", email: testEmail });
    const other = new Jar();
    res = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: testEmail, code: link2?.properties?.email_otp }) });
    other.take(res);
    check(res.status === 200, "same student signs in on a second browser");

    // 7. Sign out clears the session.
    res = await fetch(`${BASE}/api/auth/sign-out`, { method: "POST", headers: { cookie: jar.header() }, redirect: "manual" });
    jar.take(res);
    res = await fetch(`${BASE}/dashboard`, { headers: { cookie: jar.header() }, redirect: "manual" });
    check(res.status === 307, "after sign-out, /dashboard redirects to sign-in", String(res.status));
    res = await fetch(`${BASE}/dashboard`, { headers: { cookie: other.header() }, redirect: "manual" });
    check(res.status !== 307 || !res.headers.get("location")?.endsWith("/sign-in"), "the other browser stays signed in (sign-out is per browser)", `${res.status} ${res.headers.get("location") ?? ""}`);

    // 8. Next time: email + password, no code.
    const passwordSignIn = async (password: string) => {
      const r = await fetch(`${BASE}/api/auth/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: testEmail.toUpperCase(), password }) });
      const j = new Jar();
      j.take(r);
      return { status: r.status, body: await r.json(), jar: j };
    };
    let p = await passwordSignIn("revise4exams!");
    check(p.status === 200 && p.jar.size > 0, "signs in with email + password (no code)", `${p.status} ${JSON.stringify(p.body)}`);
    res = await fetch(`${BASE}/study/CSC420`, { headers: { cookie: p.jar.header() }, redirect: "manual" });
    check(res.status === 200, "password session opens the study page", String(res.status));
    p = await passwordSignIn("wrong-password");
    check(p.status === 401 && /Wrong email or password/.test(p.body.error), "wrong password refused with a neutral message", p.body.error);
    p = await (async () => {
      const r = await fetch(`${BASE}/api/auth/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `nobody-${Date.now()}@pau.edu.ng`, password: "revise4exams!" }) });
      return { status: r.status, body: await r.json(), jar: new Jar() };
    })();
    check(p.status === 401 && /Wrong email or password/.test(p.body.error), "unknown account gets the same message (no account probing)", p.body.error);

    // 9. Forgot password: code again → new password; the old one stops working.
    const { data: link3 } = await admin.auth.admin.generateLink({ type: "magiclink", email: testEmail });
    const reset = new Jar();
    res = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: testEmail, code: link3?.properties?.email_otp }) });
    reset.take(res);
    res = await fetch(`${BASE}/api/auth/set-password`, { method: "POST", headers: { "Content-Type": "application/json", cookie: reset.header() }, body: JSON.stringify({ password: "new-revision-pass" }) });
    check(res.status === 200, "forgot password: code then a new password", String(res.status));
    check((await passwordSignIn("revise4exams!")).status === 401, "old password no longer works");
    check((await passwordSignIn("new-revision-pass")).status === 200, "new password works");
  } finally {
    await deleteUserByEmail(testEmail);
    server?.kill();
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nPhase 3 end-to-end: all checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
