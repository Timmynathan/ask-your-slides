import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Banner } from "@/components/landing/banner";
import { BooksDoodle, StudyDeskDoodle } from "@/components/landing/doodles";
import { Mascot } from "@/components/mascot/mascot";
import { getCatalog, joinList, roughCount, spacedCode, type Catalog } from "@/lib/catalog";
import { PARTNERS, PARTNER_IDS } from "@/lib/partners";

export const metadata: Metadata = {
  title: "Ask Your Slides: study smarter from your own lecture slides",
};

// Landing page for signed-out visitors (signed-in students are sent to their courses by proxy.ts).
// Structure follows studyfetch.com: banner, nav, hero, numbers, steps, features, partners, FAQ,
// closing call to action, footer. Sections with no honest content for us (user counts, research
// claims, testimonials, pricing) are left out.

const pill = "inline-flex items-center justify-center rounded-full px-6 py-3 text-[15px] font-medium";

export default async function Landing() {
  // Departments, courses and counts come from the database (cached hourly), not from the copy.
  const catalog = await getCatalog();
  const departments = joinList(catalog.departments);
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <Banner text="New: choose your study partner. Tobi, Ada, Dr. Musa or Zara." linkText="Meet them" href="#partners" />

      <header className="sticky top-0 z-20 px-3 pt-3 sm:px-5">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between rounded-full border border-line bg-page/85 pl-5 pr-2 backdrop-blur">
          <Link href="/" aria-label="Ask Your Slides home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="type-menu hover:opacity-70">Features</a>
            <a href="#partners" className="type-menu hover:opacity-70">Study partners</a>
            <a href="#faq" className="type-menu hover:opacity-70">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="type-menu hidden rounded-full border border-line-strong px-5 py-2.5 hover:bg-sunken sm:inline-flex">
              Log in
            </Link>
            <Link href="/sign-in?start=1" className="type-menu rounded-full bg-black px-5 py-2.5 !text-white hover:opacity-85 dark:bg-[#faf9f5] dark:!text-[#191919]">
              Try for free
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero: one line, one button (reference: studyfetch.com). Everything else is below the fold. */}
        <section className="relative flex min-h-[calc(100dvh-7.5rem)] flex-col items-center justify-center overflow-hidden px-5 pb-40 pt-16 text-center sm:pb-48">
          <h1 className="max-w-4xl font-heading text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-ink sm:text-7xl">
            Studying that adapts to you
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Ask anything about your {departments ? `${departments} ` : ""}courses. Answers come straight from your school slides, explained
            by a study partner you choose.
          </p>
          <Link
            href="/sign-in?start=1"
            className="mt-10 inline-flex items-center justify-center rounded-full bg-black px-12 py-5 text-lg font-medium text-white hover:opacity-85 dark:bg-[#faf9f5] dark:text-[#191919]"
          >
            Try for free
          </Link>
          <p className="mt-4 text-sm text-muted">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-ink underline underline-offset-4">
              Log in
            </Link>
          </p>
          <BooksDoodle className="pointer-events-none absolute bottom-6 left-[4%] w-40 text-black sm:w-56 lg:left-[12%] lg:w-64 dark:text-[#faf9f5]" />
          <StudyDeskDoodle className="pointer-events-none absolute -right-6 bottom-4 w-56 text-black sm:right-0 sm:w-80 lg:right-[8%] lg:w-[400px] dark:text-[#faf9f5]" />
        </section>

        {/* Made for PAU: the student's own course codes, read from the database. */}
        <section className="border-t border-line bg-card/60">
          <div className="mx-auto max-w-6xl px-5 py-8 text-center">
            <p className="text-sm text-muted">Your PAU courses are already here. Same slides as on the e-learning portal, no downloading.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {catalog.courseCodes.map((code) => (
                <span key={code} className="rounded-full bg-page px-3.5 py-1.5 text-sm font-medium text-ink ring-1 ring-line">
                  {spacedCode(code)}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Numbers */}
        <section className="border-b border-line bg-card/60">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 pb-12 pt-4 text-center sm:grid-cols-3">
            {[
              [String(catalog.courseCount), "final-year courses"],
              [roughCount(catalog.slideCount), "slides, notes and readings"],
              ["Every", "answer cited to a slide"],
            ].map(([big, small]) => (
              <div key={small}>
                <p className="font-heading text-5xl font-semibold tracking-tight text-ink">{big}</p>
                <p className="mt-2 text-sm text-muted">{small}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-center font-heading text-4xl font-semibold tracking-tight text-ink">Start studying in seconds</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted">No downloading decks, no uploading files, no starting over in a new chat.</p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              ["1", "Sign in with your PAU email", "One code to confirm it's you, then a password for next time."],
              ["2", "Choose your study partner", "Tobi, Ada, Dr. Musa or Zara: same slides, four ways of explaining."],
              ["3", "Ask, summarise, quiz", "Pick a course or a topic and ask anything. Every point links to its slide."],
            ].map(([n, title, body]) => (
              <div key={n} className="rounded-[25px] bg-card p-7 ring-1 ring-line">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-lilac-100 font-heading text-lg font-semibold text-lilac-900">{n}</span>
                <h3 className="mt-5 font-heading text-xl font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 bg-card/60 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-center font-heading text-4xl font-semibold tracking-tight text-ink">Everything your slides know, on demand</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted">Built around what your lecturers actually taught.</p>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Feature title="Answers with receipts" body="Each point ends with a chip like “Transactions and Indexing · Slide 5”. Tap it to see the slide.">
                <p className="text-sm leading-relaxed text-ink">
                  ACID stands for Atomicity, Consistency, Isolation and Durability.{" "}
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800 ring-1 ring-teal-200">Transactions · Slide 5</span>
                </p>
              </Feature>
              <Feature title="Topic chats" body="Study one topic at a time. If it's covered somewhere else in the course, you'll be told where.">
                <div className="space-y-1.5 text-sm">
                  {["Whole course", "Transactions and indexing", "Complex types"].map((t, i) => (
                    <p key={t} className={`rounded-lg px-2.5 py-1.5 ${i === 1 ? "bg-sunken font-medium text-ink" : "text-muted"}`}>{t}</p>
                  ))}
                </div>
              </Feature>
              <Feature title="Summaries in order" body="“Summarise the risk lecture” reads the whole deck, slide by slide, not just the first few.">
                <div className="space-y-2">
                  {[85, 70, 92, 60].map((w, i) => (
                    <div key={i} className="h-2 rounded-full bg-sunken" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </Feature>
              <Feature title="Quiz me" body="One question at a time. Answer, get marked, see the slide with the right answer.">
                <div className="rounded-xl bg-sunken p-3 text-sm text-ink">
                  What does privacy mean under contextual integrity?
                  <div className="mt-2 flex gap-1.5 text-xs">
                    {["A", "B", "C"].map((o) => (
                      <span key={o} className="rounded-full bg-card px-2.5 py-1 ring-1 ring-line">{o}</span>
                    ))}
                  </div>
                </div>
              </Feature>
              <Feature title="See the actual slide" body="Open any cited slide next to the chat, then ask about it in one tap.">
                <div className="aspect-[4/3] rounded-xl bg-[#00163a] p-3">
                  <div className="h-2.5 w-2/3 rounded bg-white/90" />
                  <div className="mt-3 space-y-1.5">
                    <div className="h-1.5 w-full rounded bg-white/50" />
                    <div className="h-1.5 w-5/6 rounded bg-white/50" />
                    <div className="h-1.5 w-4/6 rounded bg-white/50" />
                  </div>
                </div>
              </Feature>
              <Feature title="Know what's from your slides" body="Anything that isn't from your slides sits in its own labelled box, so you know what was taught.">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">Not from your slides: general knowledge</p>
                  <p className="mt-1 text-amber-800/80">A handy way to remember it…</p>
                </div>
              </Feature>
            </div>
          </div>
        </section>

        {/* Partners */}
        <section id="partners" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
          <h2 className="text-center font-heading text-4xl font-semibold tracking-tight text-ink">Meet your study partners</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted">
            Pick the style you enjoy and switch any time. Every partner answers from your school slides and cites every point.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 bg-card/60 py-20">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="text-center font-heading text-4xl font-semibold tracking-tight text-ink">Frequently asked questions</h2>
            <div className="mt-10 divide-y divide-line rounded-[25px] bg-card ring-1 ring-line">
              {faq(catalog).map(([q, a]) => (
                <details key={q} className="group px-6 py-5">
                  <summary className="flex list-none items-center justify-between gap-4 font-medium text-ink">
                    {q}
                    <span className="text-xl leading-none text-muted transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="flex flex-col items-center gap-8 rounded-[25px] bg-[#F5D5FF] px-6 py-14 text-center md:flex-row md:justify-between md:px-14 md:text-left">
            <div>
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-[#191919] md:text-4xl">Exams are coming. Your slides are ready.</h2>
              <p className="mt-3 text-[#3d3a35]">Pick a partner and ask your first question in under a minute.</p>
              <Link href="/sign-in?start=1" className={`${pill} mt-6 bg-[#191919] text-[#faf9f5] hover:opacity-90`}>
                Get started free
              </Link>
            </div>
            <div className="flex -space-x-4">
              {PARTNER_IDS.map((id) => (
                <span key={id} className="rounded-full ring-4 ring-[#F5D5FF]">
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
              <a href="#features" className="block text-muted hover:text-ink">Features</a>
              <a href="#partners" className="block text-muted hover:text-ink">Study partners</a>
              <a href="#faq" className="block text-muted hover:text-ink">FAQ</a>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-ink">Account</p>
              <Link href="/sign-in" className="block text-muted hover:text-ink">Sign in</Link>
              <Link href="/sign-in?start=1" className="block text-muted hover:text-ink">Get started</Link>
            </div>
          </div>
        </div>
        <p className="border-t border-line py-5 text-center text-xs text-muted">© 2026 Ask Your Slides</p>
      </footer>
    </div>
  );
}

function faq(c: Catalog): [string, string][] {
  const dept = joinList(c.departments);
  return [
    ["Is this an official PAU tool?", "No. Ask Your Slides is an independent study tool built for PAU students. It is not affiliated with or endorsed by Pan-Atlantic University."],
    ["Where do the answers come from?", "From your courses' lecture slides, notes and readings from school. Every point is linked to the slide it came from. Anything that isn't from your slides is shown in a separate box marked “Not from your slides”."],
    ["Which courses are included?", `All final-year ${dept ? `${dept} ` : ""}courses this semester: ${joinList(c.courseCodes.map(spacedCode))}. Everyone sees every course. More departments are coming.`],
    ["Is it free?", "Yes, during the pilot. There's a daily limit of 50 questions per student so everyone gets a fair share."],
    ["What happens to my chats?", "We store your PAU email, an optional display name, your study partner and your conversations. Conversations and ratings are used to improve the app. Your data is never sold or used to train AI models. You can ask for it to be deleted."],
  ];
}

function Feature({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-[25px] bg-card p-6 ring-1 ring-line">
      <div className="min-h-[104px] rounded-2xl bg-page p-4">{children}</div>
      <h3 className="mt-5 font-heading text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}
