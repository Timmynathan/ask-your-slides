"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { BusyLabel } from "@/components/ui/spinner";
import { safeNext } from "@/lib/auth/next";

// Accounts (PRD F1). Two clear doors, as tabs at the top:
//   Create account:  PAU email → emailed code (proves the address) → create a password   (steps 1–3)
//   Log in:          email + password; "Forgot password?" runs the same code flow to set a new one
// "Try for free" opens Create account (/sign-up), so a new student never has to find a small link.
type Mode = "signup" | "login" | "reset";
type Step =
  | { kind: "password" }
  | { kind: "code-email" }
  | { kind: "code"; email: string }
  | { kind: "new-password"; email: string };

const MIN_PASSWORD = 8;
const MICROSOFT = process.env.NEXT_PUBLIC_MICROSOFT_LOGIN === "1";

/** One click with the PAU Microsoft 365 account (Outlook/Teams): no emailed code needed. */
function MicrosoftButton({ next }: { next: string | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <a
      href={`/auth/microsoft${next ? `?next=${encodeURIComponent(next)}` : ""}`}
      onClick={() => setBusy(true)}
      aria-busy={busy}
      className="flex w-full items-center justify-center gap-3 rounded-full bg-card px-4 py-3 text-base font-medium text-ink ring-1 ring-line-strong transition hover:bg-sunken active:scale-[0.98]"
    >
      <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden>
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
    setNotice(null);
    setShowPassword(false);
    setStep(next);
  }
  function switchMode(m: Mode) {
    setMode(m);
    go(m === "login" ? { kind: "password" } : { kind: "code-email" });
  }

  async function post(url: string, body: object) {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      lastCode.current = res.ok ? null : (data.code ?? null);
      if (!res.ok) setError(data.error ?? "Something went wrong. Try again.");
      return res.ok ? data : null;
    } catch {
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
    const target =
      serverNext === "/welcome" ? `/welcome${next ? `?next=${encodeURIComponent(next)}` : ""}` : (next ?? serverNext ?? "/dashboard");
    router.replace(target);
    router.refresh();
  }

  async function signIn(form: FormData) {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const data = await post("/api/auth/password", { email, password: String(form.get("password") ?? "") });
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
    const data = await post("/api/auth/otp", { email, intent: mode === "reset" ? "reset" : "signup" });
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
    go({ kind: "code", email });
  }

  async function verify(form: FormData) {
    if (step.kind !== "code") return;
    const data = await post("/api/auth/verify", { email: step.email, code: String(form.get("code") ?? "") });
    if (data) go({ kind: "new-password", email: step.email });
  }

  async function setPassword(form: FormData) {
    const password = String(form.get("password") ?? "");
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    const data = await post("/api/auth/set-password", { password });
    if (data) finish(data.next);
  }

  const input =
    "mt-1.5 w-full rounded-xl border border-line-strong bg-card px-4 py-3 text-base text-ink outline-none transition-shadow placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-pau-200";
  const button =
    "mt-5 w-full rounded-full bg-brand px-4 py-3 text-base font-medium text-brand-ink hover:opacity-90 disabled:opacity-60";
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
  const head =
    step.kind === "password"
      ? { title: "Welcome back", sub: "Log in with your PAU email and password." }
      : step.kind === "code-email"
        ? mode === "reset"
          ? { title: "Reset your password", sub: "We'll email a code to your PAU address, then you choose a new password." }
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
      {/* The two doors, always visible: no hunting for where to sign up. */}
      <div className="grid grid-cols-2 rounded-full bg-sunken p-1" role="tablist" aria-label="Account">
        {(
          [
            ["signup", "Create account"],
            ["login", "Log in"],
          ] as const
        ).map(([m, label]) => {
          const on = m === "signup" ? mode !== "login" : mode === "login";
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={on}
              disabled={busy}
              onClick={() => !on && switchMode(m)}
              className={`rounded-full py-2.5 text-[15px] transition active:scale-[0.98] ${on ? "bg-page font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <h1 className="mt-8 font-heading text-3xl font-semibold tracking-tight text-ink">{head.title}</h1>
      {head.sub && <p className="mt-2 text-[15px] text-muted">{head.sub}</p>}
      {mode === "signup" && !directSignup && (
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
          <MicrosoftButton next={next} />
          <p className="mt-2 text-center text-xs text-muted">Your PAU Outlook / Teams account. No code needed.</p>
          <div className="mt-6 flex items-center gap-3 text-xs text-muted" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            or use your email
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
          <button type="submit" disabled={busy} className={button}>
            <BusyLabel busy={busy} label={mode === "reset" ? "Send me a code" : "Get my code"} busyLabel="Sending…" />
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
          <p className="text-[15px] text-muted">
            We sent a 6-digit code to <span className="font-medium text-ink">{step.email}</span>. It can take a minute; check your
            spam folder too.
          </p>
          <label htmlFor="code" className="mt-4 block text-sm font-medium">
            Code
          </label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10}
            required autoFocus className={`${input} tracking-[0.3em]`} />
          <button type="submit" disabled={busy} className={button}>
            <BusyLabel busy={busy} label="Continue" busyLabel="Checking…" />
          </button>
          <button type="button" onClick={() => go({ kind: "code-email" })} disabled={busy} className={`${link} mt-4 block w-full text-center`}>
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
