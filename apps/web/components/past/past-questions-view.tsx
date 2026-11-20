"use client";

// /past-questions (owner, 20 Nov 2026): every course the student takes, with its past papers or a
// clear "No past papers yet". Opening one goes straight to that course's past questions.
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { ShellMenuButton } from "@/components/nav/app-shell";
import { AccountMenu } from "@/components/ui/account-menu";

export interface PastCourseRow {
  id: string;
  title: string;
  shownCode: string | null;
  pastHref: string;
  papers: number;
  questions: number;
  /** "2021–2025", or one year, or null when there are no papers. */
  years: string | null;
  /** The student may open them (Finals, or a programme whose past questions are free). */
  open: boolean;
}

function plural(n: number, one: string) {
  return `${n.toLocaleString("en-GB")} ${one}${n === 1 ? "" : "s"}`;
}

function Row({ r }: { r: PastCourseRow }) {
  const has = r.papers > 0;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:flex-nowrap">
      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
        <p className="text-[16px] leading-snug text-ink sm:truncate" title={r.title}>
          {r.title}
        </p>
        <p className="mt-0.5 text-[13.5px] text-muted">
          {r.shownCode && <span>{r.shownCode} · </span>}
          {has ? `${plural(r.papers, "paper")} · ${plural(r.questions, "question")}${r.years ? ` · ${r.years}` : ""}` : "No past papers yet"}
        </p>
      </div>
      {has &&
        (r.open ? (
          <Link href={r.pastHref} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-[14px] font-medium text-brand-ink transition hover:opacity-90 active:scale-95">
            Practise
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        ) : (
          <Link href="/pricing" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-pau-100 px-4 py-2 text-[14px] font-medium text-brand transition hover:bg-pau-200 active:scale-95">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
            </svg>
            Unlock with Finals
          </Link>
        ))}
    </li>
  );
}

export function PastQuestionsView({ rows, user }: { rows: PastCourseRow[]; user: { email: string; displayName: string | null } }) {
  const available = rows.filter((r) => r.papers > 0);
  const none = rows.filter((r) => r.papers === 0);
  return (
    <>
      {/* Phones: no sidebar, so a small top bar with the way back. */}
      <header className="flex h-16 items-center gap-3 px-4 md:hidden">
        <ShellMenuButton className="-ml-1.5" />
        <LogoMark size={24} />
        <div className="ml-auto">
          <AccountMenu user={user} />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-4 sm:px-6 md:pt-12">
        <h1 className="text-[28px] font-normal tracking-tight text-ink sm:text-[32px]">Past questions</h1>
        <p className="mt-1 text-sm text-muted">Real PAU past papers for your courses, with model answers. Based on past papers, not a prediction.</p>

        {available.length > 0 && (
          <>
            <h2 className="mt-8 text-[13px] font-medium uppercase tracking-wide text-muted">Available ({available.length})</h2>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[22px] bg-card ring-1 ring-line">
              {available.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </ul>
          </>
        )}
        {none.length > 0 && (
          <>
            <h2 className="mt-8 text-[13px] font-medium uppercase tracking-wide text-muted">No past papers yet ({none.length})</h2>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[22px] bg-sunken/50 ring-1 ring-line">
              {none.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-muted">We add papers as we get them.</p>
          </>
        )}
      </main>
    </>
  );
}
