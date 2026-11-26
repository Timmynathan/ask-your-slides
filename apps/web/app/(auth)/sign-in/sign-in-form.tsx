"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { BusyLabel } from "@/components/ui/spinner";
import { safeNext } from "@/lib/auth/next";
import { passwordHelpMailto, SUPPORT_EMAIL } from "@/lib/auth/support";

// Accounts (PRD F1). Two doors, linked to each other at the bottom of each form (no tabs: owner, 20 Nov 2026):
//   Create account:  Continue with Microsoft (proves the PAU address; owner, 17 Nov 2026), or as a
//                    fallback: PAU email → emailed code (proves it too) → create a password (steps 1–3)
//   Log in:          email + password; "Forgot password?" runs the same code flow to set a new one
// "Try for free" opens Create account (/sign-up), so a new student never has to find a small link.
type Mode = "signup" | "login" | "reset";
type Step =
  | { kind: "password" }
  | { kind: "code-email" }
  // note: "slow" = the send didn't answer in time (the code usually arrived anyway); "had-code" = "I already have a code".
  | { kind: "code"; email: string; note?: "slow" | "had-code" }
  | { kind: "new-password"; email: string };

const MIN_PASSWORD = 8;
// Owner, 26 Nov 2026 (Anselm): the code reached his phone but the page sat on "Sending…" because the reply
// never reached his laptop, so there was nowhere to type it. The page now never waits more than this, and
// remembers the code step for a while so a reload or a trip to Outlook comes back to the code box.
const SEND_TIMEOUT_MS = 10_000;
const CODE_STEP_KEY = "pau.codeStep";
const CODE_STEP_TTL_MS = 15 * 60_000;
const PAU_EMAIL = /^[^\s@]+@pau\.edu\.ng$/;

function saveCodeStep(email: string, mode: "signup" | "reset") {
  try {
    localStorage.setItem(CODE_STEP_KEY, JSON.stringify({ email, mode, at: Date.now() }));
  } catch {
    /* storage blocked */
  }
}
function clearCodeStep() {
  try {
    localStorage.removeItem(CODE_STEP_KEY);
  } catch {
    /* storage blocked */
  }
}
function readCodeStep(): { email: string; mode: "signup" | "reset" } | null {
  try {
    const v = JSON.parse(localStorage.getItem(CODE_STEP_KEY) ?? "null");
    if (!v || typeof v.email !== "string" || Date.now() - Number(v.at) > CODE_STEP_TTL_MS) return null;
    return { email: v.email, mode: v.mode === "reset" ? "reset" : "signup" };
  } catch {
    return null;
  }
}
/** fetch that gives up after `ms`: rejects with a TimeoutError instead of hanging. */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
const isTimeout = (e: unknown) => e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
// On for everyone since PAU IT approved the app (owner, 17 Nov 2026). Kill switch: NEXT_PUBLIC_MICROSOFT_LOGIN=0.
const MICROSOFT = process.env.NEXT_PUBLIC_MICROSOFT_LOGIN !== "0";

/** One click with the PAU Microsoft 365 account (Outlook/Teams): no emailed code needed. */
function MicrosoftButton({ next, primary = false }: { next: string | null; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <a
      href={`/auth/microsoft${next ? `?next=${encodeURIComponent(next)}` : ""}`}
      onClick={() => setBusy(true)}
      aria-busy={busy}
      className={`flex w-full items-center justify-center gap-3 rounded-full px-4 py-3 text-base font-medium transition active:scale-[0.98] ${
        primary ? "bg-brand text-brand-ink shadow-sm hover:opacity-90" : "bg-card text-ink ring-1 ring-line-strong hover:bg-sunken"
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden className={primary ? "rounded-[3px] bg-white p-[2px]" : undefined}>
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
      {busy ? "Opening Microsoft…" : "Continue with Microsoft"}
    </a>
  );
}

const SIGN_IN_ERRORS: Record<string, string> = {
  microsoft: "Microsoft sign-in didn't finish. Try again, or use your email below.",
  not_pau: "That Microsoft account isn't a PAU account. Use your @pau.edu.ng account.",
};

export function SignInForm({
  startWithCode = false,
  directSignup: directSignupSetting = false,
}: {
  startWithCode?: boolean;
  /** TEMPORARY (AUTH_DIRECT_SIGNUP=1): Create account is email + password, no emailed code. */
  directSignup?: boolean;
}) {
  // The query string (?next=, ?ms=1, ?deleted=1, ?error=) is read in the browser after the first
  // paint, so the page itself can be prebuilt and appears the instant a link is clicked.
  const [next, setNext] = useState<string | null>(null);
  const [microsoft, setMicrosoft] = useState(false);
  // ?code=1: the emailed-code sign-up even while direct sign-up is on (owner testing email delivery).
  const [forceCode, setForceCode] = useState(false);
  const directSignup = directSignupSetting && !forceCode;
  const [banner, setBanner] = useState<{ kind: "deleted" | "error"; text: string } | null>(null);
  // On for everyone with NEXT_PUBLIC_MICROSOFT_LOGIN=1; before that, ?ms=1 shows it for testing.
  const showMicrosoft = MICROSOFT || microsoft;
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(startWithCode ? "signup" : "login");
  const [step, setStep] = useState<Step>(startWithCode ? { kind: "code-email" } : { kind: "password" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Guards repeat presses even before React has re-rendered the disabled button.
  const inFlight = useRef(false);
  const lastCode = useRef<string | null>(null); // machine-readable error code from the last request
  // "You already have an account" / "No account yet": a notice with the right next step, not an error.
  const [notice, setNotice] = useState<{ kind: "exists" | "none"; email: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // Wrong password on an account that exists: offer "Escalate to admin" (a prefilled email to the
  // owner), since reset codes sent by email don't reach PAU inboxes.
  const [helpEmail, setHelpEmail] = useState<string | null>(null);
  // Remember the email on this browser.
  const [savedEmail, setSavedEmail] = useState("");
  // Rendered in its own Suspense boundary (see QueryReader), so the rest of the form stays prebuilt.
  function applyQuery(q: URLSearchParams) {
    setNext(safeNext(q.get("next")));
    setMicrosoft(q.get("ms") === "1");
    setForceCode(q.get("code") === "1");
    if (q.get("start") === "1" && !startWithCode) {
      setMode("signup");
      setStep({ kind: "code-email" });
    }
    const err = q.get("error");
    if (q.get("deleted") === "1") setBanner({ kind: "deleted", text: "Your account has been deleted. You can sign up again any time." });
    else if (err && SIGN_IN_ERRORS[err]) setBanner({ kind: "error", text: SIGN_IN_ERRORS[err] });
    else setBanner(null);
  }
  useEffect(() => {
    try {
      const v = localStorage.getItem("pau.email");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
      if (v) setSavedEmail(v);
    } catch {
      /* storage blocked: just don't prefill */
    }
    const pending = readCodeStep();
    if (pending) {
      setMode(pending.mode);
      setStep({ kind: "code", email: pending.email, note: "had-code" });
    }
  }, []);

  function remember(email: string) {
    try {
      localStorage.setItem("pau.email", email);
    } catch {
      /* storage blocked */
    }
  }

  function go(next: Step) {
    setError(null);
    setHelpEmail(null);
    setNotice(null);
    setShowPassword(false);
    setStep(next);
  }
  function switchMode(m: Mode) {
    setMode(m);
    go(m === "login" ? { kind: "password" } : { kind: "code-email" });
  }

  const timedOut = useRef(false);
  async function post(url: string, body: object, timeoutMs?: number) {
    if (inFlight.current) return null;
    timedOut.current = false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
      const res = timeoutMs ? await fetchWithTimeout(url, init, timeoutMs) : await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      lastCode.current = res.ok ? null : (data.code ?? null);
      if (!res.ok) setError(data.error ?? "Something went wrong. Try again.");
      return res.ok ? data : null;
    } catch (e) {
      if (timeoutMs && isTimeout(e)) {
        timedOut.current = true;
        return null;
      }
      setError("Couldn't reach the server. Check your connection.");
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Plain submit handlers, not React form actions: state set inside an action is deferred until the
  // action finishes, so the button showed no busy state and a double click submitted twice.
  function run(e: FormEvent<HTMLFormElement>, handler: (form: FormData) => Promise<unknown>) {
    e.preventDefault();
    if (inFlight.current) return;
    void handler(new FormData(e.currentTarget));
  }

  // The server says /welcome (onboarding) or /dashboard; a link the student came from wins, and
  // survives onboarding too.
  function finish(serverNext: string | undefined) {
    clearCodeStep();
    const target =
      serverNext === "/welcome" ? `/welcome${next ? `?next=${encodeURIComponent(next)}` : ""}` : (next ?? serverNext ?? "/dashboard");
    router.replace(target);
    router.refresh();
  }

  async function signIn(form: FormData) {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const data = await post("/api/auth/password", { email, password: String(form.get("password") ?? "") });
    setHelpEmail(!data && lastCode.current === "wrong_password" ? email : null);
    if (!data) return;
    remember(email);
    finish(data.next);
  }

  async function signUpDirect(form: FormData) {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    setNotice(null);
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
    const data = await post("/api/auth/signup", { email, password });
    if (!data) {
      if (lastCode.current === "account_exists") {
        setError(null);
        remember(email);
        setSavedEmail(email);
        setNotice({ kind: "exists", email });
      }
      return;
    }
    remember(email);
    finish(data.next);
  }

  async function sendCode(form: FormData) {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    setNotice(null);
    const intent = mode === "reset" ? "reset" : "signup";
    const data = await post("/api/auth/otp", { email, intent }, SEND_TIMEOUT_MS);
    if (!data && timedOut.current && PAU_EMAIL.test(email)) {
      // No answer in time: the code has usually been sent anyway, so show the box for it.
      remember(email);
      setSavedEmail(email);
      saveCodeStep(email, intent);
      go({ kind: "code", email, note: "slow" });
      return;
    }
    if (!data) {
      if (lastCode.current === "account_exists" || lastCode.current === "no_account") {
        setError(null);
        remember(email);
        setSavedEmail(email);
        setNotice({ kind: lastCode.current === "account_exists" ? "exists" : "none", email });
      }
      return;
    }
    remember(email);
    setSavedEmail(email);
    saveCodeStep(email, intent);
    go({ kind: "code", email });
  }

  /** "I already have a code": straight to the code box for the email typed above. */
  function haveCode(form: HTMLFormElement | null) {
    const email = String(new FormData(form ?? undefined).get("email") ?? "").trim().toLowerCase();
    if (!PAU_EMAIL.test(email)) return setError("Type your PAU email above first, then enter the code.");
    remember(email);
    setSavedEmail(email);
    saveCodeStep(email, mode === "reset" ? "reset" : "signup");
    go({ kind: "code", email, note: "had-code" });
  }

  async function verify(form: FormData) {
    if (step.kind !== "code") return;
    const data = await post("/api/auth/verify", { email: step.email, code: String(form.get("code") ?? "") });
    if (!data) return;
    clearCodeStep();
    go({ kind: "new-password", email: step.email });
  }

  async function setPassword(form: FormData) {
    const password = String(form.get("password") ?? "");
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    const data = await post("/api/auth/set-password", { password });
    if (data) finish(data.next);
  }

  const input =
    "mt-1.5 w-full rounded-xl border border-line-strong bg-white px-4 shadow-[0_1px_2px_rgba(14,22,100,0.06)] py-3 text-base text-ink outline-none transition-shadow placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-pau-200";
  const button =
    "mt-5 w-full rounded-full bg-brand px-4 py-3 text-base font-medium text-brand-ink hover:opacity-90 disabled:opacity-60";
  const secondaryButton =
    "mt-5 w-full rounded-full bg-card px-4 py-3 text-base font-medium text-brand ring-1 ring-line-strong transition hover:bg-sunken disabled:opacity-60";
  const link = "rounded text-sm font-medium text-ink underline decoration-pau-400 decoration-2 underline-offset-4 hover:decoration-pau-800 disabled:opacity-50";
  const emailField = (
    <>
      <label htmlFor="email" className="text-sm font-medium">
        PAU email
      </label>
      <input id="email" name="email" type="email" inputMode="email" autoComplete="username" required
        key={savedEmail} defaultValue={savedEmail} placeholder="you@pau.edu.ng" className={input} />
    </>
  );
  const passwordField = (id: string, label: string, autoComplete: string, hint?: string) => (
    <>
      <div className="mt-4 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <button type="button" onClick={() => setShowPassword((v) => !v)} className="rounded px-1 text-xs text-muted hover:text-ink">
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      <input id={id} name="password" type={showPassword ? "text" : "password"} autoComplete={autoComplete} required
        minLength={autoComplete === "new-password" ? MIN_PASSWORD : undefined} className={input} />
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </>
  );

  const signupStep = step.kind === "code-email" ? 1 : step.kind === "code" ? 2 : 3;
  // Create account shows both verified ways side by side (owner, 17 Nov 2026: the code emails now
  // arrive): Continue with Microsoft, or email → code. The 1-2-3 steps appear once the code is sent.
  const microsoftSignup = mode === "signup" && step.kind === "code-email" && showMicrosoft && !directSignup;
  const head =
    step.kind === "password"
      ? { title: "Welcome back", sub: "Log in with your PAU email and password." }
      : step.kind === "code-email"
        ? mode === "reset"
          ? { title: "Reset your password", sub: "We'll email a code to your PAU address, then you choose a new password." }
          : microsoftSignup
            ? { title: "Create your free account", sub: "" }
            : directSignup
            ? { title: "Create your free account", sub: "Your PAU email and a password. That's it." }
            : { title: "Create your free account", sub: "Just your PAU email. We'll send you a code to confirm it's you." }
        : step.kind === "code"
          ? { title: "Check your email", sub: null }
          : { title: mode === "reset" ? "Choose a new password" : "Create a password", sub: null };

  return (
    <div>
      <Suspense fallback={null}>
        <QueryReader onQuery={applyQuery} />
      </Suspense>
      {banner?.kind === "deleted" && (
        <p role="status" className="mb-6 rounded-2xl bg-sunken px-4 py-3 text-sm text-ink">
          {banner.text}
        </p>
      )}
      {banner?.kind === "error" && (
        <p role="alert" className="mb-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-400/10 dark:text-red-300">
          {banner.text}
        </p>
      )}

      <h1 className="font-heading text-3xl font-semibold tracking-tight text-ink">{head.title}</h1>
      {head.sub && <p className="mt-2 text-[15px] text-muted">{head.sub}</p>}
      {mode === "signup" && !directSignup && !microsoftSignup && (
        <ol className="mt-4 flex items-center gap-2 text-xs text-muted" aria-label={`Step ${signupStep} of 3`}>
          {["Email", "Code", "Password"].map((l, i) => (
            <li key={l} className="flex items-center gap-2">
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold ${i + 1 <= signupStep ? "bg-brand text-brand-ink" : "bg-sunken text-muted"}`}>
                {i + 1}
              </span>
              <span className={i + 1 === signupStep ? "font-medium text-ink" : ""}>{l}</span>
              {i < 2 && <span className="h-px w-5 bg-line-strong" aria-hidden />}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6">
      {showMicrosoft && (step.kind === "password" || (step.kind === "code-email" && mode !== "reset")) && (
        <div className="mb-6">
          {/* Create account: Microsoft is the main way (owner, 26 Nov 2026: 14 of 14 Microsoft sign-ups got in, but
              half of one day's emailed-code sign-ups never did, though every code was delivered). */}
          <MicrosoftButton next={next} primary={microsoftSignup} />
          {microsoftSignup && <p className="mt-2.5 text-center text-sm text-muted">Use your PAU Outlook account. No code to wait for.</p>}
          <div className="mt-6 flex items-center gap-3 text-xs text-muted" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            {microsoftSignup ? "or get a code by email" : "or"}
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}
      {step.kind === "password" && (
        <form onSubmit={(e) => run(e, signIn)} noValidate>
          {emailField}
          {passwordField("password", "Password", "current-password")}
          <button type="submit" disabled={busy} className={button}>
            <BusyLabel busy={busy} label="Log in" busyLabel="Logging in…" />
          </button>
          <button type="button" onClick={() => switchMode("reset")} disabled={busy} className={`${link} mt-4 block w-full text-center`}>
            Forgot password?
          </button>
          <div className="mt-8 border-t border-line pt-6 text-center">
            <p className="text-sm text-muted">New to Ask Your Slides?</p>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              disabled={busy}
              className="mt-3 w-full rounded-full px-4 py-3 text-base font-medium text-brand ring-2 ring-brand transition hover:bg-pau-50 active:scale-[0.98]"
            >
              Create a free account
            </button>
          </div>
        </form>
      )}

      {step.kind === "code-email" && notice && (
        <div role="status" className="mb-5 rounded-2xl bg-pau-50 p-4 ring-1 ring-pau-100">
          {notice.kind === "exists" ? (
            <>
              <p className="font-medium text-ink">You already have an account.</p>
              <p className="mt-1 text-sm text-muted">
                <span className="font-medium text-ink">{notice.email}</span> is already signed up. Log in with your password.
              </p>
              <button type="button" onClick={() => switchMode("login")} className="mt-4 w-full rounded-full bg-brand px-4 py-3 text-base font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98]">
                Log in
              </button>
              <button type="button" onClick={() => switchMode("reset")} className={`${link} mt-3 block w-full text-center`}>
                Forgot your password?
              </button>
            </>
          ) : (
            <>
              <p className="font-medium text-ink">There&apos;s no account for this email yet.</p>
              <p className="mt-1 text-sm text-muted">
                Create one with <span className="font-medium text-ink">{notice.email}</span>: it takes a minute.
              </p>
              <button type="button" onClick={() => switchMode("signup")} className="mt-4 w-full rounded-full bg-brand px-4 py-3 text-base font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98]">
                Create account
              </button>
            </>
          )}
        </div>
      )}

      {step.kind === "code-email" && mode === "signup" && directSignup && (
        <form onSubmit={(e) => run(e, signUpDirect)} noValidate>
          {emailField}
          {passwordField("new-password", "Create a password", "new-password", `At least ${MIN_PASSWORD} characters.`)}
          <button type="submit" disabled={busy} className={button}>
            <BusyLabel busy={busy} label="Create account" busyLabel="Creating your account…" />
          </button>
          <p className="mt-5 text-center text-sm text-muted">
            Already have an account?{" "}
            <button type="button" onClick={() => switchMode("login")} disabled={busy} className={link}>
              Log in
            </button>
          </p>
        </form>
      )}

      {step.kind === "code-email" && !(mode === "signup" && directSignup) && (
        <form onSubmit={(e) => run(e, sendCode)} noValidate>
          {emailField}
          <button type="submit" disabled={busy} className={microsoftSignup ? secondaryButton : button}>
            <BusyLabel
              busy={busy}
              label={mode === "reset" ? "Send me a code" : microsoftSignup ? "Email me a code" : "Continue"}
              busyLabel="Sending…"
              arrow={mode !== "reset" && !microsoftSignup}
            />
          </button>
          <button type="button" onClick={(e) => haveCode(e.currentTarget.form)} disabled={busy} className={`${link} mt-4 block w-full text-center`}>
            I already have a code
          </button>
          <p className="mt-5 text-center text-sm text-muted">
            {mode === "reset" ? "Remembered it? " : "Already have an account? "}
            <button type="button" onClick={() => switchMode("login")} disabled={busy} className={link}>
              Log in
            </button>
          </p>
        </form>
      )}
      {step.kind === "code" && (
        <form onSubmit={(e) => run(e, verify)} noValidate>
          {/* Owner, 26 Nov 2026: every code was delivered, yet students asked for up to 3 and half never entered one.
              The page said "6-digit" (the codes have 8), said "spam" (Outlook says Junk Email) and had no resend. */}
          <p className="text-[15px] text-muted">
            {step.note === "slow" ? (
              <>
                We&apos;re sending a code to <span className="font-medium text-ink">{step.email}</span>. This is taking longer than usual, but
                the code usually arrives anyway. Look for the subject <span className="font-medium text-ink">Your AskYourSlides code</span>.
              </>
            ) : step.note === "had-code" ? (
              <>
                Enter the newest code we emailed to <span className="font-medium text-ink">{step.email}</span>, subject{" "}
                <span className="font-medium text-ink">Your AskYourSlides code</span>.
              </>
            ) : (
              <>
                We emailed a code to <span className="font-medium text-ink">{step.email}</span>. It usually arrives within a minute, with the
                subject <span className="font-medium text-ink">Your AskYourSlides code</span>.
              </>
            )}
          </p>
          <p className="mt-3 rounded-2xl bg-sunken px-4 py-3 text-sm text-ink">
            Not in your inbox? In Outlook, check <span className="font-medium">Junk Email</span> and the <span className="font-medium">Other</span> tab.
          </p>
          <label htmlFor="code" className="mt-4 block text-sm font-medium">
            Code
          </label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10}
            required autoFocus className={`${input} tracking-[0.3em]`} />
          <button type="submit" disabled={busy} className={button}>
            <BusyLabel busy={busy} label="Continue" busyLabel="Checking…" />
          </button>
          <ResendCode email={step.email} intent={mode === "reset" ? "reset" : "signup"} />
          <button type="button" onClick={() => { clearCodeStep(); go({ kind: "code-email" }); }} disabled={busy} className={`${link} mt-3 block w-full text-center`}>
            Use a different email
          </button>
        </form>
      )}

      {step.kind === "new-password" && (
        <form onSubmit={(e) => run(e, setPassword)} noValidate>
          <p className="mb-2 text-[15px] text-muted">
            Email confirmed. Choose a password so you can log in with{" "}
            <span className="font-medium text-ink">{step.email}</span> next time, without a code.
          </p>
          {/* Lets password managers save the pair. */}
          <input type="email" name="username" autoComplete="username" value={step.email} readOnly hidden />
          {passwordField("new-password", "New password", "new-password", `At least ${MIN_PASSWORD} characters.`)}
          <button type="submit" disabled={busy} className={button}>
            <BusyLabel busy={busy} label="Save password and continue" busyLabel="Saving…" />
          </button>
        </form>
      )}

      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {helpEmail && step.kind === "password" && (
        <div className="pop-in mt-4 rounded-2xl bg-sunken/70 p-4 text-left">
          <p className="text-sm font-medium text-ink">Forgot your password?</p>
          <p className="mt-1 text-[13.5px] text-muted">Ask us to reset it. This opens an email to the Ask Your Slides team, already written; we&apos;ll reply with a new password.</p>
          <a href={passwordHelpMailto(helpEmail)} className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:opacity-90">
            Escalate to admin
          </a>
          <p className="mt-2 text-[12px] text-muted">
            No email app? Write to <span className="font-medium text-ink">{SUPPORT_EMAIL}</span> from your PAU email.
          </p>
        </div>
      )}
    </div>
  );
}

/** Hands the query string (?next=, ?ms=1, ?deleted=1, ?error=) to the form. useSearchParams is right
 *  after client-side navigations too (unlike window.location during the first effects). */
function QueryReader({ onQuery }: { onQuery(q: URLSearchParams): void }) {
  const params = useSearchParams();
  const query = params.toString();
  const latest = useRef(onQuery);
  useEffect(() => {
    latest.current = onQuery;
  });
  useEffect(() => {
    latest.current(new URLSearchParams(query));
  }, [query]);
  return null;
}

/** "Send a new code", after a wait: Supabase allows one code a minute per address. Sends to the same address,
 *  so a student never has to retype it (they used "Use a different email" to get a new code, up to 3 times). */
// 65, not 60: Supabase allows one code a minute per address and refused a press at 59 s (26 Nov 2026).
const RESEND_WAIT_S = 65;
function ResendCode({ email, intent }: { email: string; intent: "signup" | "reset" }) {
  const [wait, setWait] = useState(RESEND_WAIT_S);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  async function resend() {
    setState("sending");
    setMessage(null);
    try {
      const res = await fetchWithTimeout("/api/auth/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, intent }) }, SEND_TIMEOUT_MS);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't send a new code. Try again in a minute.");
      setState("sent");
      setMessage("New code sent. Use the newest one.");
    } catch (e) {
      if (isTimeout(e)) {
        // Like the first send: no answer in time, but the code has usually gone.
        setState("sent");
        setMessage("Sending a new code. If it arrives, use the newest one.");
        setWait(RESEND_WAIT_S);
        return;
      }
      setState("error");
      setMessage(e instanceof Error ? e.message : "Couldn't send a new code. Try again in a minute.");
    }
    setWait(RESEND_WAIT_S);
  }
  return (
    <div className="mt-4 text-center">
      <button
        type="button"
        onClick={resend}
        disabled={wait > 0 || state === "sending"}
        className="rounded text-sm font-medium text-ink underline decoration-pau-400 decoration-2 underline-offset-4 hover:decoration-pau-800 disabled:cursor-default disabled:text-muted disabled:no-underline"
      >
        {state === "sending" ? "Sending…" : wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
      </button>
      {message && (
        <p role={state === "error" ? "alert" : "status"} className={`mt-2 text-sm ${state === "error" ? "text-red-700" : "text-muted"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
