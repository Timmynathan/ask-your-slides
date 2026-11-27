import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, MessageSquareText, UsersRound } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Banner } from "@/components/landing/banner";
import { ChatDemo } from "@/components/landing/chat-demo";
import { FeatureDeck } from "@/components/landing/feature-deck";
import { CoursePills } from "@/components/landing/course-pills";
import { StretchNav } from "@/components/landing/stretch-nav";
import { HeroActions, NavActions } from "@/components/landing/auth-actions";
import { Testimonials } from "@/components/landing/testimonials";
import { StatsSection } from "@/components/landing/stats-section";
import { ScrollCue, SeeHowItWorks } from "@/components/landing/see-how";
import { BooksDoodle, DeskSceneDoodle, StudyDeskDoodle } from "@/components/landing/doodles";
import { directSignupEnabled } from "@/lib/auth/signup-mode";
import { getCatalog } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Ask Your Slides: stop uploading slides to ChatGPT",
};

// Landing page, for visitors and signed-in students alike (owner, 17 Nov 2026: signed in, the
// buttons lead to the dashboard instead of sign-up; see auth-actions.tsx).
// Structure follows studyfetch.com: banner, nav, hero, PAU courses, numbers, why us, how it works (demo), steps, partners, closing call to action, footer. Sections with
// no honest content for us (ratings, research claims) are left out.


export default async function Landing() {
  // Departments, courses and counts come from the database (cached hourly), not from the copy.
  const catalog = await getCatalog();
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
          <a href="#reviews" className="type-menu hover:opacity-70">Reviews</a>
        </div>
        <NavActions />
      </StretchNav>

      <main className="flex-1">
        {/* Hero: the value in one line (no more uploading slides to a chatbot), one button. */}
        <section className="relative flex min-h-[calc(100dvh-7.5rem)] flex-col items-center justify-center overflow-hidden px-5 pb-40 pt-16 text-center sm:pb-48">
          <h1 className="max-w-6xl font-heading text-[2.4rem] font-normal leading-[1.08] tracking-tight text-ink sm:text-6xl lg:text-[4.25rem]">
            Stop uploading slides to ChatGPT.
          </h1>
          {/* Phones get a shorter line (owner, 19 Nov 2026: two lines under the headline from 360px). */}
          <p className="mt-4 max-w-2xl text-balance text-[14px] leading-relaxed text-muted sm:mt-6 sm:text-[17px]">
            All your <strong className="font-bold text-brand underline decoration-pau-400 decoration-2 underline-offset-[5px] dark:text-pau-400">PAU</strong> course slides are already here
            <span className="sm:hidden">. Ask anything and see the exact slide it comes from.</span>
            <span className="hidden sm:inline">
              , so there&apos;s nothing to upload. Ask a question and get the answer straight from your slides, with the exact slide shown.
            </span>
          </p>
          <HeroActions seeHow={<SeeHowItWorks />} />
          <ScrollCue />
          <BooksDoodle className="pointer-events-none absolute bottom-6 left-[4%] w-40 text-black sm:w-56 lg:left-[12%] lg:w-64 dark:text-[#faf9f5]" />
          <StudyDeskDoodle className="pointer-events-none absolute -right-6 bottom-4 w-56 text-black sm:right-0 sm:w-80 lg:right-[8%] lg:w-[400px] dark:text-[#faf9f5]" />
        </section>

        {/* Made for PAU: the student's own course codes, read from the database. */}
        <section className="relative overflow-hidden bg-navy text-white">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-pau-400/30 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-28 right-0 h-80 w-80 rounded-full bg-[#2a3591] blur-3xl" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-5 py-8 text-center sm:py-12">
            <p className="font-heading text-xl font-semibold sm:text-3xl">Your PAU courses are already here</p>
            {/* One line on phones too (owner, 27 Nov 2026): the size follows the screen width. */}
            <p className="mt-1.5 whitespace-nowrap text-[clamp(10px,3.1vw,14px)] text-white/75 sm:mt-2 sm:text-base">Same slides as on the e-learning portal. No downloading.</p>
            <CoursePills codes={catalog.courseCodes} />
          </div>
        </section>

        {/* Figures beside a student's video (owner, 20 Nov 2026); set in stats-section.tsx. */}
        <StatsSection />

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
                {["You upload your slides, every time", "Answers aren't from your slides", "Not built for your courses"].map((t) => (
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

        {/* A heading for the demo (owner, 20 Nov 2026). "See how it works" still scrolls to the demo itself. */}
        <div className="mx-auto max-w-5xl px-5 pt-12 text-center sm:pt-16">
          <h2 className="font-heading text-4xl font-normal tracking-tight text-ink sm:text-6xl">
            Start <em className="italic">really</em> learning in seconds
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted sm:text-base">
            No more scrolling through 80-slide decks the night before. Ask about the hardest topic in a lecture and get it
            broken down step by step, in plain words, straight from your PAU slides.
          </p>
        </div>

        {/* The demo, framed as a full-screen video player. "See how it works" brings it here and plays it. */}
        <ChatDemo />

        {/* Features: a deck of cards with tabs (drag a card, or pick a tab), below the demo. */}
        <section id="features" className="scroll-mt-20 overflow-hidden bg-tint py-20">
          <div className="mx-auto max-w-6xl px-5">
            {/* Heading on the left, a short paragraph on the right (owner, 20 Nov 2026). */}
            <p className="font-heading text-[15px] italic text-muted">Features</p>
            <div className="mt-3 grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start md:gap-12">
              <h2 className="font-heading text-4xl font-normal leading-[1.08] tracking-tight text-ink sm:text-6xl">
                <em className="italic">Personalized</em> tutoring, totally redefined
              </h2>
              <p className="max-w-md text-[15px] leading-relaxed text-muted md:mt-3 md:justify-self-end sm:text-base">
                Your PAU slides are already loaded. Ask anything and see the exact slide, get a lecture summarised, quiz yourself
                and practise past questions with answers, so you understand faster and walk into the exam ready.
              </p>
            </div>
            <div className="mt-12">
              <FeatureDeck />
            </div>
          </div>
        </section>

        {/* From here down the page is navy (owner, 22 Nov 2026), running into the closing section and footer. */}
        <div className="bg-pau-900 text-white">
        {/* Steps (owner, 22 Nov 2026: as simple as possible): the heading, then one rounded panel with the three
            steps, each a line icon and a few words. */}
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-20 sm:pt-24">
          <h2 className="text-center font-heading text-4xl font-normal tracking-tight text-white sm:text-6xl">
            Start studying in <em className="italic">seconds</em>
          </h2>
          <ol className="mt-12 grid gap-5 rounded-[28px] bg-[#141b66] px-6 py-9 ring-1 ring-white/10 sm:px-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-white/10 md:py-12">
            {[
              { Icon: Mail, title: directSignupEnabled() ? "Sign up with your PAU email" : "Sign in with your PAU email" },
              { Icon: UsersRound, title: "Pick your study partner" },
              { Icon: MessageSquareText, title: "Ask about any slide" },
            ].map(({ Icon, title }) => (
              <li key={title} className="flex items-center gap-4 md:flex-col md:gap-5 md:px-6 md:text-center">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-white md:h-14 md:w-14">
                  <Icon size={22} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
                </span>
                <span className="text-[16px] text-white md:text-[17px]">{title}</span>
              </li>
            ))}
          </ol>
        </section>

        <Testimonials />
        </div>

        {/* No prices on the landing page (owner, 20 Nov 2026): plans show after sign-up (/pricing, /pay). */}

        {/* Closing call to action (owner, 22 Nov 2026, modelled on a calm two-column close): the question and two
            buttons on the left, a light line drawing on the right, on the same navy as the footer. */}
        <section className="bg-pau-900 text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 border-t border-white/10 px-5 py-20 md:grid-cols-2 md:py-24">
            <div>
              <h2 className="max-w-sm font-heading text-4xl font-normal leading-[1.1] tracking-tight text-white sm:text-[44px]">
                Ready to transform how you study?
              </h2>
              <p className="mt-8 max-w-[17rem] text-[14.5px] leading-relaxed text-white/65">
                Pick a partner and ask your first question in under a minute.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link href="/sign-up" className="inline-flex h-14 items-center gap-2.5 rounded-full bg-[#faf9f5] px-8 text-[15px] font-medium text-pau-900 transition hover:bg-white">
                  Start for free <ArrowRight size={16} absoluteStrokeWidth strokeWidth={1.6} aria-hidden />
                </Link>
                <Link href="/sign-in" className="inline-flex h-14 items-center rounded-full px-8 text-[15px] font-medium text-white ring-1 ring-white/40 transition hover:bg-white/10">
                  Log in
                </Link>
              </div>
            </div>
            <DeskSceneDoodle className="mx-auto w-full max-w-[480px] text-[#faf9f5]" />
          </div>
        </section>
      </main>

      {/* Footer: the darker PAU navy (#0a0f47), white text (owner, 18 Nov 2026); it continues the closing call to action above. */}
      <footer className="bg-pau-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 border-t border-white/15 px-5 py-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo light />
            <p className="mt-3 text-sm text-white/75">
              Ask Your Slides is an independent study tool for PAU students. It is not affiliated with or endorsed by
              Pan-Atlantic University.
            </p>
          </div>
          <div className="flex gap-10 text-sm">
            <div className="space-y-2">
              <p className="font-medium text-white">Product</p>
              <a href="#demo" className="block text-white/75 hover:text-white">How it works</a>
              <a href="#reviews" className="block text-white/75 hover:text-white">Reviews</a>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-white">Account</p>
              <Link href="/sign-in" className="block text-white/75 hover:text-white">Sign in</Link>
              <Link href="/sign-up" className="block text-white/75 hover:text-white">Get started</Link>
            </div>
          </div>
        </div>
        <p className="border-t border-white/15 py-5 text-center text-xs text-white/75">© 2026 Ask Your Slides</p>
      </footer>
    </div>
  );
}


