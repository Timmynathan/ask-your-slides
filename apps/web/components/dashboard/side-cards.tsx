"use client";

// The dashboard's newer pieces (owner, 22 Nov 2026): Recent lectures (a row of first-slide pictures
// that open the lecture's last chat), and the right-hand cards: Finals, the exam countdown and the
// study streak.
import Link from "next/link";
import { BookOpen, CalendarDays, CircleArrowUp, Flame } from "lucide-react";
import { HoverLink } from "@/components/ui/hover-link";

export interface RecentLecture {
  id: string;
  title: string;
  course: string;
  href: string;
  /** The lecture's first slide (signed, expiring URL), or null when it has none. */
  image: string | null;
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const icon = { size: 20, absoluteStrokeWidth: true, strokeWidth: 1.5, "aria-hidden": true } as const;

export function RecentLectures({ lectures }: { lectures: RecentLecture[] }) {
  if (lectures.length === 0) return null;
  return (
    <section className="mb-8" aria-labelledby="recent-lectures">
      <h2 id="recent-lectures" className="mb-3 font-heading text-[24px] font-medium tracking-tight text-ink sm:text-[26px]">
        Recent lectures
      </h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 pt-1 sm:-mx-6 sm:px-6 [scrollbar-width:thin]">
        {lectures.map((l) => (
          <li key={l.id} className="group relative w-[176px] shrink-0 snap-start rounded-2xl bg-card p-2 ring-1 ring-line transition hover:shadow-md hover:ring-line-strong">
            <HoverLink href={l.href} className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" aria-label={`Continue ${l.title} (${l.course})`} />
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-sunken">
              {l.image ? (
                // Signed, expiring Supabase URL; next/image would need a remote pattern per project.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.image} alt="" loading="lazy" className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]" />
              ) : (
                <span className="grid h-full place-items-center text-muted">
                  <BookOpen {...icon} size={28} />
                </span>
              )}
            </div>
            <div className="flex items-start gap-2 px-1.5 pb-1 pt-2.5">
              <BookOpen {...icon} size={16} className="mt-0.5 shrink-0 text-brand" />
              <span className="min-w-0">
                <span className="line-clamp-2 text-[13.5px] leading-snug text-ink">{l.title}</span>
                <span className="mt-0.5 block truncate text-[12px] text-muted">{l.course}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UpgradeCard({ price, freePast = false }: { price: number; /** Past questions are already free in this programme. */ freePast?: boolean }) {
  return (
    <div className="rounded-3xl bg-[#BBEEF0] p-6 text-brand">
      <h2 className="flex items-center gap-2.5 font-heading text-[21px] font-normal">
        <CircleArrowUp {...icon} size={22} />
        Upgrade to Finals
      </h2>
      <p className="mt-3 text-[14px] leading-relaxed text-brand/80">
        {freePast ? "More questions every day, unlimited summaries and quiz mode, until your last paper." : "More questions every day, quiz mode, and past questions with worked answers, until your last paper."}
      </p>
      <Link href="/pricing" className="mt-5 flex h-11 items-center justify-center rounded-full bg-brand text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98]">
        Upgrade for {naira(price)}
      </Link>
    </div>
  );
}

export function ExamsCard({ days, startLabel }: { days: number; startLabel: string }) {
  return (
    <div className="rounded-3xl bg-sunken/70 p-6">
      <h2 className="flex items-center gap-2.5 font-heading text-[21px] font-normal text-ink">
        <CalendarDays {...icon} size={22} />
        Exams
      </h2>
      {days > 0 ? (
        <>
          <p className="mt-4 font-heading text-[40px] leading-none text-ink">
            {days}
            <span className="ml-2 align-baseline text-[16px] text-muted">{days === 1 ? "day to go" : "days to go"}</span>
          </p>
          <p className="mt-3 text-[14px] text-muted">Exams start on {startLabel}. A little every day adds up.</p>
        </>
      ) : (
        <p className="mt-4 text-[15px] text-ink">Exams are on. Good luck: you&apos;ve got this.</p>
      )}
    </div>
  );
}

export function StreakCard({ days, today }: { days: number; today: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-sunken/70 px-6 py-5">
      <Flame {...icon} size={22} className={`shrink-0 ${days > 0 ? "text-orange-500" : "text-muted"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="font-heading text-[20px] text-ink">{days > 0 ? `${days} day streak` : "Start a streak"}</p>
          <Link href="/leaderboard" className="text-[13px] font-medium text-ink underline decoration-[1.5px] underline-offset-[3px] hover:text-brand">
            View leaderboard
          </Link>
        </div>
        <p className="text-[13px] text-muted">{days === 0 ? "Ask one question today to begin." : today ? "You studied today. See you tomorrow." : "Ask a question today to keep it going."}</p>
      </div>
    </div>
  );
}
