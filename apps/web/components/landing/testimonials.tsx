// "Helping PAU students" (owner, 22 Nov 2026): real students' own words, large serif quotes on the navy
// part of the landing page, each one stepped further right like a staircase. The quotes live in
// content/testimonials.json, shared with the onboarding plan step.
/* eslint-disable @next/next/no-img-element -- small local photos */
import testimonials from "@/content/testimonials.json";

type Quote = { text: string; name: string; detail: string; photo?: string; initial?: string };
const QUOTES = testimonials as Quote[];
const STEP = ["", "md:ml-[14%]", "md:ml-[7%]"];

export function Testimonials() {
  return (
    <section id="reviews" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 pt-4">
      <h2 className="max-w-xl font-heading text-4xl font-normal leading-[1.1] tracking-tight text-white sm:text-5xl">
        Helping PAU students study smarter.
      </h2>
      <div className="mt-12 space-y-12 sm:mt-14 sm:space-y-14">
        {QUOTES.map((q, i) => (
          // Phones too (owner, 27 Nov 2026): photo beside the quote, top-aligned, the text running down beside it.
          <figure key={q.name} className={`flex max-w-3xl flex-row items-start gap-4 sm:gap-8 ${STEP[i % STEP.length]}`}>
            {q.photo ? (
              <img src={q.photo} alt="" width={80} height={80} className="mt-1 h-12 w-12 shrink-0 rounded-full object-cover sm:mt-0 sm:h-20 sm:w-20" />
            ) : (
              <span className="mt-1 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 font-heading text-xl sm:mt-0 sm:h-20 sm:w-20 sm:text-2xl">{q.initial}</span>
            )}
            <div className="min-w-0">
              <blockquote className="font-heading text-[22px] font-normal leading-snug text-white sm:text-[28px]">&ldquo;{q.text}&rdquo;</blockquote>
              <figcaption className="mt-4 text-[13.5px] text-white/60">
                {q.name}, {q.detail.replace(", Pan-Atlantic University", " at Pan-Atlantic University")}
              </figcaption>
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}
