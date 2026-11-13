import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Banner } from "@/components/landing/banner";
import { ChatDemo } from "@/components/landing/chat-demo";
import { FeatureDeck } from "@/components/landing/feature-deck";
import { CoursePills } from "@/components/landing/course-pills";
import { StretchNav } from "@/components/landing/stretch-nav";
import { PlansSection } from "@/components/landing/plans-section";
import { landingOffer } from "@/lib/plans/landing-offer";
import { ScrollCue, SeeHowItWorks } from "@/components/landing/see-how";
import { BooksDoodle, StudyDeskDoodle } from "@/components/landing/doodles";
import { Mascot } from "@/components/mascot/mascot";
import { directSignupEnabled } from "@/lib/auth/signup-mode";
import { getCatalog } from "@/lib/catalog";
import { PARTNERS, PARTNER_IDS } from "@/lib/partners";

export const metadata: Metadata = {
  title: "Ask Your Slides: stop uploading slides to ChatGPT",
};

// Landing page for signed-out visitors (signed-in students are sent to their courses by proxy.ts).
// Structure follows studyfetch.com: banner, nav, hero, PAU courses, why us, how it works (demo), steps, partners,
// closing call to action, footer. Sections with no honest content for us (user counts, research
// claims, testimonials, pricing) are left out.

const pill = "inline-flex items-center justify-center rounded-full px-6 py-3 text-[15px] font-medium";

export default async function Landing() {
  // Departments, courses and counts come from the database (cached hourly), not from the copy.
  const [catalog, offer] = await Promise.all([getCatalog(), landingOffer()]);
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <Banner text="Every PAU course slide, ready to chat with." linkText="Start studying" href="/sign-up" />

      <StretchNav>
        <Link href="/" aria-label="Ask Your Slides home">
          <Logo />
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <a href="#why" className="type-menu hover:opacity-70">Why us</a>
          <a href="#demo" className="type-menu hover:opacity-70">How it works</a>
          <a href="#partners" className="type-menu hover:opacity-70">Study partners</a>
          <a href="#plans" className="type-menu hover:opacity-70">Pricing</a>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sign-in" className="type-menu hidden rounded-full border border-line-strong px-5 py-2.5 hover:bg-sunken sm:inline-flex">
            Log in
          </Link>
          <Link href="/sign-up" className="type-menu rounded-full bg-brand px-5 py-2.5 !text-brand-ink hover:opacity-90">
            Try for free
          </Link>
        </div>
      </StretchNav>

      <main className="flex-1">
        {/* Hero: the value in one line (no more uploading slides to a chatbot), one button. */}
        <section className="relative flex min-h-[calc(100dvh-7.5rem)] flex-col items-center justify-center overflow-hidden px-5 pb-40 pt-16 text-center sm:pb-48">
          <h1 className="max-w-6xl font-heading text-[2.4rem] font-semibold leading-[1.08] tracking-tight text-ink sm:text-6xl lg:text-[4.25rem]">
            Stop uploading slides to ChatGPT.
          </h1>
          <p className="mt-6 max-w-4xl text-balance text-lg leading-relaxed text-muted sm:text-xl">
            All your course slides are already here, so there&apos;s nothing to upload. Ask a question and get the answer straight
            from your slides, with the exact slide shown.
          </p>
          <Link
            href="/sign-up"
            className="mt-10 inline-flex items-center justify-center rounded-full bg-brand px-12 py-5 text-lg font-medium text-brand-ink hover:opacity-90"
          >
            Try for free
          </Link>
          <SeeHowItWorks />
          <p className="mt-2 text-sm text-muted">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-ink underline underline-offset-4">
              Log in
            </Link>
          </p>
          <ScrollCue />
          <BooksDoodle className="pointer-events-none absolute bottom-6 left-[4%] w-40 text-black sm:w-56 lg:left-[12%] lg:w-64 dark:text-[#faf9f5]" />
          <StudyDeskDoodle className="pointer-events-none absolute -right-6 bottom-4 w-56 text-black sm:right-0 sm:w-80 lg:right-[8%] lg:w-[400px] dark:text-[#faf9f5]" />
        </section>

        {/* Made for PAU: the student's own course codes, read from the database. */}
        <section className="relative overflow-hidden bg-navy text-white">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-pau-400/30 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-28 right-0 h-80 w-80 rounded-full bg-[#2a3591] blur-3xl" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-5 py-12 text-center">
            <p className="font-heading text-2xl font-semibold sm:text-3xl">Your PAU courses are already here</p>
            <p className="mt-2 text-white/75">Same slides as on the e-learning portal. No downloading.</p>
            <CoursePills codes={catalog.courseCodes} />
          </div>
        </section>

        {/* Why not a general chatbot? Kept to the one point that matters. */}
        <section id="why" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-20">
          <h2 className="text-center font-heading text-4xl font-semibold tracking-tight text-ink">Why not just ChatGPT, Claude or Gemini?</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-lg text-muted">They don&apos;t have your slides. We do.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-[25px] bg-tint p-7 ring-1 ring-line">
              {/* Third-party logos are their owners' trademarks, used here only to name the products compared. */}
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/chatgpt.svg" alt="ChatGPT" width={32} height={32} className="h-8 w-8" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/claude.svg" alt="Claude" width={32} height={32} className="h-8 w-8" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/gemini.svg" alt="Gemini" width={32} height={32} className="h-8 w-8" />
              </div>
              <ul className="mt-5 space-y-3 text-[16px] text-ink">
                {["You upload your slides, every time", "Answers don't show which slide", "Not built for your courses"].map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sunken text-xs text-muted" aria-hidden>✕</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[25px] bg-navy p-7 text-white">
              <span className="inline-flex rounded-full bg-page px-3.5 py-1.5">
                <Logo size={24} />
              </span>
              <ul className="mt-5 space-y-3 text-[16px]">
                {["All your slides are already here", "Every answer shows the exact slide", "Built for your PAU courses"].map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-[#0e1664]" aria-hidden>✓</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* The demo, framed as a full-screen video player. "See how it works" brings it here and plays it. */}
        <ChatDemo />

        {/* Features: a deck of cards with tabs (drag a card, or pick a tab), below the demo. */}
        <section id="features" className="scroll-mt-20 overflow-hidden bg-tint py-20">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-center font-heading text-4xl font-semibold tracking-tight text-ink">Everything in your slides, on demand</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted">Built around what your lecturers actually taught.</p>
            <div className="mt-10">
              <FeatureDeck />
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-center font-heading text-4xl font-semibold tracking-tight text-ink">Start studying in seconds</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted">No downloading decks, no uploading files, no starting over in a new chat.</p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              directSignupEnabled()
                ? ["1", "Sign up with your PAU email", "Your PAU email and a password. That's it: it takes seconds."]
                : ["1", "Sign in with your PAU email", "One code to confirm it's you, then a password for next time."],
              ["2", "Choose your study partner", "Tobi, Ada, Dr. Musa or Zara: same slides, four ways of explaining."],
              ["3", "Ask, summarise, quiz", "Pick a course or a topic and ask anything. Every point links to its slide."],
            ].map(([n, title, body]) => (
              <div key={n} className="rounded-[25px] bg-card p-7 ring-1 ring-line">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-pau-100 font-heading text-lg font-semibold text-pau-800 dark:text-pau-400">{n}</span>
                <h3 className="mt-5 font-heading text-xl font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Partners */}
        <section id="partners" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
          <h2 className="text-center font-heading text-4xl font-semibold tracking-tight text-ink">Meet your study partners</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted">
            Pick the style you enjoy and switch any time. Every partner answers from your school slides and cites every point.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PARTNER_IDS.map((id) => {
              const p = PARTNERS[id];
              return (
                <div key={id} className="flex flex-col items-center rounded-[25px] bg-card p-7 text-center ring-1 ring-line">
                  <Mascot partner={id} size={104} mood="happy" />
                  <h3 className="mt-4 font-heading text-2xl font-semibold text-ink">{p.name}</h3>
                  <p className="text-sm text-muted">{p.role}</p>
                  <p className={`mt-3 rounded-full px-3 py-1 text-xs font-semibold ${p.accent.bg} ${p.accent.text}`}>Best for: {p.bestFor}</p>
                  <p className={`mt-4 rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${p.accent.soft} text-ink`}>“{p.sample}”</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                    {p.traits.map((t) => (
                      <span key={t} className="rounded-full bg-page px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-line">{t}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Plans (PRD F12): figures from the plans config the server enforces. */}
        <PlansSection offer={offer} />

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="flex flex-col items-center gap-8 rounded-[25px] bg-pau-100 px-6 py-14 text-center md:flex-row md:justify-between md:px-14 md:text-left">
            <div>
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-pau-900 dark:text-ink md:text-4xl">
                Exams are coming<span className="dots-seq" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
              </h2>
              <p className="mt-3 text-pau-900/80 dark:text-ink/80">Pick a partner and ask your first question in under a minute.</p>
              <Link href="/sign-up" className={`${pill} mt-6 bg-brand text-brand-ink hover:opacity-90`}>
                Get started free
              </Link>
            </div>
            <div className="flex -space-x-4">
              {PARTNER_IDS.map((id) => (
                <span key={id} className="rounded-full ring-4 ring-pau-100">
                  <Mascot partner={id} size={84} />
                </span>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm text-muted">
              Ask Your Slides is an independent study tool for PAU students. It is not affiliated with or endorsed by
              Pan-Atlantic University.
            </p>
          </div>
          <div className="flex gap-10 text-sm">
            <div className="space-y-2">
              <p className="font-medium text-ink">Product</p>
              <a href="#demo" className="block text-muted hover:text-ink">How it works</a>
              <a href="#partners" className="block text-muted hover:text-ink">Study partners</a>
              <a href="#plans" className="block text-muted hover:text-ink">Pricing</a>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-ink">Account</p>
              <Link href="/sign-in" className="block text-muted hover:text-ink">Sign in</Link>
              <Link href="/sign-up" className="block text-muted hover:text-ink">Get started</Link>
            </div>
          </div>
        </div>
        <p className="border-t border-line py-5 text-center text-xs text-muted">© 2026 Ask Your Slides</p>
      </footer>
    </div>
  );
}


