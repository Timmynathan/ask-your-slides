"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Logo } from "@/components/brand/logo";
import { Mascot } from "@/components/mascot/mascot";
import { BusyLabel } from "@/components/ui/spinner";
import { fill, PARTNERS, PARTNER_IDS, type PartnerId } from "@/lib/partners";
import { DEPARTMENTS } from "@/lib/departments";

const DEFAULT_PARTNER: PartnerId = "zara";
// The default first, so it is the first card a student sees (also on a phone).
const ORDER: PartnerId[] = [DEFAULT_PARTNER, ...PARTNER_IDS.filter((id) => id !== DEFAULT_PARTNER)];

type Step = "name" | "partner" | "hello";

// First words from the chosen partner. {department} comes from the courses' data, never hard-coded.
const HELLO: Record<PartnerId, string> = {
  tobi: "Nice one, {name}! I'm Tobi. I know {department} can be a lot, but we'll break it down together. Ask me anything and I'll give you the gist fast, straight from your school slides, plus a trick so it sticks.",
  ada: "Lovely to meet you, {name}. I'm Ada. I know {department} can feel like a lot at once, so we'll take it one step at a time, straight from your school slides.",
  musa: "Welcome, {name}. I'm Dr. Musa. I know {department} can be demanding, and the exams reward clear, well-structured answers. I'll show you how, straight from your school slides.",
  zara: "Hey {name}, I'm Zara! I know {department} can be hard, but I've got you. Quick answer or deep dive, straight from your school slides, with an exam tip when it helps.",
};
const STEPS: Step[] = ["name", "partner", "hello"];

interface Props {
  /** The student's department, from the courses data; null when it can't be told (several). */
  department: string | null;
  /** Where to go after onboarding (e.g. a course link shared in a class group). */
  next: string | null;
  initialName: string;
  initialDepartment: string | null;
  initialPartner: PartnerId | null;
  startAtPartner: boolean;
}

export function Onboarding({ department: courseDepartment, next, initialName, initialDepartment, initialPartner, startAtPartner }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(startAtPartner ? "partner" : "name");
  const [name, setName] = useState(initialName);
  const [studying, setStudying] = useState(initialDepartment ?? "");
  // The partner names what the student chose; before that, the department from the courses data.
  const department = studying || courseDepartment;
  // Zara (the all-rounder) is pre-selected so a student can just continue: least friction.
  const [partner, setPartner] = useState<PartnerId | null>(initialPartner ?? DEFAULT_PARTNER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function save(update: object): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't save. Try again.");
      return res.ok;
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function submitName(e: FormEvent) {
    e.preventDefault();
    if (!studying) return;
    if (await save({ display_name: name.trim() || null, department: studying })) setStep("partner");
  }

  async function submitPartner() {
    if (!partner) return;
    if (await save({ study_partner: partner, onboarded: true })) setStep("hello");
  }

  const index = STEPS.indexOf(step);
  const chosen = partner ? PARTNERS[partner] : null;
  const firstName = name.trim().split(/\s+/)[0] || null;

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>
            Step {index + 1} of {STEPS.length}
          </span>
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-1.5 rounded-full transition-all duration-300 ${i <= index ? "w-8 bg-brand" : "w-4 bg-line-strong"}`} />
            ))}
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        {step === "name" && (
          <form key="name" onSubmit={submitName} className="panel-in w-full max-w-md text-center">
            <div className="flex justify-center -space-x-3" aria-hidden>
              {PARTNER_IDS.map((id) => (
                <Mascot key={id} partner={id} size={64} />
              ))}
            </div>
            <h1 className="mt-6 font-heading text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Tell us about you</h1>
            <p className="mt-2 text-muted">So your study partner knows what to call you and which slides are yours.</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
              autoComplete="given-name"
              placeholder="e.g. Tolu"
              aria-label="Your name"
              className="mt-8 w-full rounded-full border border-line-strong bg-card px-6 py-3.5 text-center text-lg text-ink outline-none placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-pau-200"
            />
            <label className="relative mt-3 block">
              <span className="sr-only">What are you studying?</span>
              <select
                value={studying}
                onChange={(e) => setStudying(e.target.value)}
                required
                aria-label="What are you studying?"
                className={`w-full appearance-none rounded-full border border-line-strong bg-card px-6 py-3.5 text-center text-lg outline-none focus:border-brand focus:ring-4 focus:ring-pau-200 ${studying ? "text-ink" : "text-muted/60"}`}
              >
                <option value="" disabled>
                  What are you studying?
                </option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.name} value={d.name} disabled={!d.available}>
                    {d.available ? d.name : `${d.name} (coming soon)`}
                  </option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="m3 5 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </label>
            <p className="mt-2 text-xs text-muted">More departments are coming soon.</p>
            <button type="submit" disabled={busy || !studying} className="mt-5 w-full rounded-full bg-brand px-4 py-3.5 text-base font-medium text-brand-ink hover:opacity-90 disabled:opacity-60">
              <BusyLabel busy={busy} label="Continue" busyLabel="Saving…" />
            </button>
          </form>
        )}

        {step === "partner" && (
          <div key="partner" className="panel-in w-full max-w-5xl text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-pau-800 dark:text-pau-400">Choose your study partner</p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {firstName ? `${firstName}, who do you want to study with?` : "Who do you want to study with?"}
            </h1>

            <div role="radiogroup" aria-label="Study partners" className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {ORDER.map((id) => {
                const p = PARTNERS[id];
                const selected = partner === id;
                const isDefault = id === DEFAULT_PARTNER;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPartner(id)}
                    className={`group relative flex flex-col items-center rounded-[25px] bg-card p-6 text-center ring-1 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                      selected ? `ring-[3px] ${p.accent.ring} shadow-lg` : "ring-line"
                    }`}
                  >
                    <span className={`absolute right-4 top-4 grid h-6 w-6 place-items-center rounded-full border-2 transition-colors ${selected ? "border-brand bg-brand" : "border-line-strong"}`} aria-hidden>
                      {selected && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--page)" strokeWidth="2">
                          <path d="M2.5 6.2l2.3 2.3 4.7-4.9" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {isDefault && (
                      <span className="absolute -top-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-brand px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-ink shadow-md">
                        ✦ Picked for you
                      </span>
                    )}
                    <span className={selected ? "pop-in" : ""} key={selected ? "on" : "off"}>
                      <Mascot partner={id} size={108} mood={selected ? "happy" : "idle"} />
                    </span>
                    <span className="mt-4 font-heading text-2xl font-semibold text-ink">{p.name}</span>
                    <span className="text-sm text-muted">{p.role}</span>
                    <span className={`mt-3 rounded-full px-3 py-1 text-xs font-semibold ${p.accent.bg} ${p.accent.text}`}>Best for: {p.bestFor}</span>
                    <span className="mt-3 text-[15px] leading-snug text-ink">{p.tagline}</span>
                    <span className="mt-3 flex flex-wrap justify-center gap-1.5">
                      {p.traits.map((t) => (
                        <span key={t} className="rounded-full bg-page px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-line">{t}</span>
                      ))}
                    </span>
                    <span
                      className={`grid w-full transition-[grid-template-rows,opacity,margin] duration-300 ${selected ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                    >
                      <span className="overflow-hidden">
                        <span className={`block rounded-2xl px-4 py-3 text-left text-sm leading-relaxed text-ink ${p.accent.soft}`}>“{p.sample}”</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mx-auto mt-6 max-w-xl text-sm text-muted">You can change your study partner any time.</p>
            {/* Pinned to the bottom on phones, so continuing is always one tap away. */}
            <div className="sticky bottom-4 z-10 mt-8 flex justify-center sm:static">
              <button
                onClick={submitPartner}
                disabled={!partner || busy}
                className="rounded-full bg-brand px-10 py-3.5 text-base font-medium text-brand-ink shadow-lg transition hover:opacity-90 active:scale-95 disabled:opacity-40 sm:shadow-none"
              >
                <BusyLabel busy={busy} label={chosen ? `Study with ${chosen.name}` : "Pick a partner"} busyLabel="Saving…" />
              </button>
            </div>
          </div>
        )}

        {step === "hello" && chosen && (
          <div key="hello" className="panel-in flex w-full max-w-lg flex-col items-center text-center">
            <div className="pop-in relative rounded-[22px] bg-card px-6 py-4 text-left text-[17px] leading-relaxed text-ink shadow-lg ring-1 ring-line">
              {fill(
                HELLO[chosen.id],
                firstName,
                department,
              )}
              <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 bg-card" />
            </div>
            <div className="mt-6">
              <Mascot partner={chosen.id} size={200} mood="happy" />
            </div>
            <button
              onClick={() => {
                router.replace(next ?? "/dashboard");
                router.refresh();
              }}
              className="mt-8 rounded-full bg-brand px-10 py-3.5 text-base font-medium text-brand-ink hover:opacity-90"
            >
              Start studying
            </button>
            <button onClick={() => setStep("partner")} className="mt-3 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
              Choose someone else
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
