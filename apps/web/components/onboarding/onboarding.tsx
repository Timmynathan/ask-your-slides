"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Logo } from "@/components/brand/logo";
import { Mascot } from "@/components/mascot/mascot";
import { BusyLabel } from "@/components/ui/spinner";
import { fill, PARTNERS, PARTNER_IDS, type PartnerId } from "@/lib/partners";
import type { ProgrammeChoice } from "@/lib/programmes";
import type { PlanOffer } from "@/lib/plans/offer";
import { FREE_PAST_PROGRAMMES } from "@/lib/plans/config";
import { PromoCodeForm } from "@/components/plans/promo-code-form";
import { PlanStep } from "./plan-step";
import { ProgrammePicker, type ProgrammeValue } from "./programme-picker";
import type { HeardFrom } from "@/lib/heard-from";
import { HeardFromStep } from "./heard-from-step";

const DEFAULT_PARTNER: PartnerId = "zara";
// The default first, so it is the first card a student sees (also on a phone).
const ORDER: PartnerId[] = [DEFAULT_PARTNER, ...PARTNER_IDS.filter((id) => id !== DEFAULT_PARTNER)];

type Step = "name" | "heard" | "partner" | "hello" | "plan";

// First words from the chosen partner. {department} comes from the courses' data, never hard-coded.
const HELLO: Record<PartnerId, string> = {
  tobi: "Nice one, {name}! I'm Tobi. I know {department} can be a lot, but we'll break it down together. Ask me anything and I'll give you the gist fast, straight from your school slides, plus a trick so it sticks.",
  ada: "Lovely to meet you, {name}. I'm Ada. I know {department} can feel like a lot at once, so we'll take it one step at a time, straight from your school slides.",
  musa: "Welcome, {name}. I'm Dr. Musa. I know {department} can be demanding, and the exams reward clear, well-structured answers. I'll show you how, straight from your school slides.",
  zara: "Hey {name}, I'm Zara! I know {department} can be hard, but I've got you. Quick answer or deep dive, straight from your school slides, with an exam tip when it helps.",
};
const STEPS: Step[] = ["name", "heard", "partner", "hello", "plan"];

interface Props {
  /** Programmes + levels in the catalog ("What do you study?"). */
  choices: ProgrammeChoice[];
  /** Where to go after onboarding (e.g. a course link shared in a class group). */
  next: string | null;
  initialName: string;
  initialProgramme: { programme: string; level: number } | null;
  initialPartner: PartnerId | null;
  startAtPartner: boolean;
  offer: PlanOffer;
}

export function Onboarding({ choices, next, initialName, initialProgramme, initialPartner, startAtPartner, offer }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(startAtPartner ? "partner" : "name");
  const [name, setName] = useState(initialName);
  const [studying, setStudying] = useState<ProgrammeValue>(initialProgramme ?? { programme: "", level: null });
  // The partner names the chosen programme's department (from the data, never hard-coded).
  const department = choices.find((c) => c.programme === studying.programme)?.department ?? null;
  const [heardFrom, setHeardFrom] = useState<HeardFrom | null>(null);
  // A name is required (owner, 22 Nov 2026): it greets the student and shows on the leaderboard.
  const ready = name.trim().length > 0 && !!studying.programme && !!studying.level;
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
    if (!ready) return;
    if (await save({ display_name: name.trim(), programme: studying.programme, level: studying.level })) setStep("heard");
  }

  function pickHeardFrom(id: HeardFrom) {
    setHeardFrom(id);
    // Saved on its own and never awaited: a failure here must not stop anyone signing up.
    fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heard_from: id }) }).catch(() => {});
    setTimeout(() => setStep("partner"), 180); // the tap shows before the next step slides in
  }

  async function submitPartner() {
    if (!partner) return;
    if (await save({ study_partner: partner, onboarded: true })) setStep("hello");
  }

  // Coming from the landing page's "Lock in Finals" (next=/pay): no need to ask which plan.
  const steps = next === "/pay" ? STEPS.filter((s) => s !== "plan") : STEPS;
  const index = steps.indexOf(step);
  const finish = () => {
    router.replace(next ?? "/dashboard");
    router.refresh();
  };
  const chosen = partner ? PARTNERS[partner] : null;
  const firstName = name.trim().split(/\s+/)[0] || null;

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="hidden sm:inline">
            Step {index + 1} of {steps.length}
          </span>
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((s, i) => (
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
                <Mascot key={id} partner={id} size={64} animated={false} />
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
              required
              className="mt-8 w-full rounded-full border border-line-strong bg-card px-6 py-3.5 text-center text-lg text-ink outline-none placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-pau-200"
            />
            <div className="mt-3">
              <ProgrammePicker choices={choices} value={studying} onChange={setStudying} />
            </div>
            <button type="submit" disabled={busy || !ready} className="mt-5 w-full rounded-full bg-brand px-4 py-3.5 text-base font-medium text-brand-ink hover:opacity-90 disabled:opacity-60">
              <BusyLabel busy={busy} label="Continue" busyLabel="Saving…" />
            </button>
          </form>
        )}

        {step === "heard" && <HeardFromStep value={heardFrom} onPick={pickHeardFrom} onBack={() => setStep("name")} />}

        {step === "partner" && (
          <div key="partner" className="panel-in w-full max-w-5xl text-center">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {firstName ? `${firstName}, who do you want to study with?` : "Who do you want to study with?"}
            </h1>

            <div role="radiogroup" aria-label="Study partners" className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4 xl:grid-cols-4">
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
                    className={`group relative flex flex-col items-center rounded-[25px] bg-card px-3 pb-5 pt-6 text-center sm:p-6 ring-1 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
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
                      <span className="sm:hidden">
                        <Mascot partner={id} size={76} mood={selected ? "happy" : "idle"} animated={false} />
                      </span>
                      <span className="hidden sm:inline">
                        <Mascot partner={id} size={108} mood={selected ? "happy" : "idle"} animated={false} />
                      </span>
                    </span>
                    <span className="mt-3 font-heading text-xl font-semibold text-ink sm:mt-4 sm:text-2xl">{p.name}</span>
                    {/* One line and the trait pills (owner, 20 Nov 2026). */}
                    <span className="mt-1 text-[13px] leading-snug text-muted sm:text-[15px]">{p.bestFor}</span>
                    {/* Two pills on top, one below, on every card (owner, 22 Nov 2026). Phones may wrap the pair. */}
                    <span className="mt-3 flex flex-col items-center gap-1.5">
                      {[p.traits.slice(0, 2), p.traits.slice(2)].filter((row) => row.length).map((row, i) => (
                        <span key={i} className="flex flex-wrap justify-center gap-1.5 sm:flex-nowrap">
                          {row.map((t) => (
                            <span key={t} className="whitespace-nowrap rounded-full bg-page px-2 py-1 text-[11px] font-medium text-muted ring-1 ring-line sm:px-2.5 sm:text-xs xl:px-2 xl:text-[11.5px]">{t}</span>
                          ))}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

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
              onClick={() => (steps.includes("plan") ? setStep("plan") : finish())}
              className="mt-8 rounded-full bg-brand px-10 py-3.5 text-base font-medium text-brand-ink hover:opacity-90"
            >
              {steps.includes("plan") ? "Continue" : "Start studying"}
            </button>
          </div>
        )}

        {step === "plan" && (
          <PlanStep
            offer={offer}
            partner={partner ?? DEFAULT_PARTNER}
            freePast={FREE_PAST_PROGRAMMES.includes(studying.programme ?? "")}
            onBack={() => setStep("hello")}
            onFree={finish}
            promo={<PromoCodeForm onRedeemed={finish} />}
          />
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
