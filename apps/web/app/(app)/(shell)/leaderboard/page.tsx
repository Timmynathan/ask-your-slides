import { ContentSkeleton } from "@/components/nav/content-skeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Flame } from "lucide-react";
import { Mascot } from "@/components/mascot/mascot";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";
import { programmeChoices, programmeLabel } from "@/lib/programmes";
import { adminClient } from "@/lib/supabase/admin";
import { loadStreakBoard, type BoardRow } from "@/lib/study/streak";

export const metadata: Metadata = { title: "Leaderboard · Ask Your Slides" };

type Tab = "current" | "best";
const TABS: { id: Tab; label: string }[] = [
  { id: "current", label: "Current streaks" },
  { id: "best", label: "Longest streaks" },
];
const SHOWN = 50;

// Study streak leaderboard (owner, 22 Nov 2026): every student's streak (Lagos days in a row with a
// question asked), shown by first name and last initial with their study partner as the picture.
// Two boards: streaks still going, and the longest ever. The student's own place is always shown.
async function Loaded({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ supabase, user }, sp] = await Promise.all([requireUser(), searchParams]);
  const tab: Tab = sp.tab === "best" ? "best" : "current";
  const [board, choices] = await Promise.all([loadStreakBoard(adminClient(), new Date()), programmeChoices(supabase)]);
  const score = (r: BoardRow) => (tab === "current" ? r.current : r.best);
  const ranked = board
    .filter((r) => score(r) > 0)
    .sort((a, b) => score(b) - score(a) || b.best - a.best || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const programme = (id: string | null) => {
    const c = choices.find((x) => x.programme === id);
    return c ? programmeLabel(c) : "";
  };
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3, SHOWN);
  const me = ranked.find((r) => r.userId === user.id) ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-[15px] text-ink hover:text-brand">
        <ArrowLeft size={18} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
        Back to dashboard
      </Link>

      <nav className="mt-6 flex gap-6 border-b border-line" aria-label="Leaderboards">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "current" ? "/leaderboard" : "/leaderboard?tab=best"}
            aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px border-b-2 pb-3 text-[15px] transition ${tab === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <h1 className="mt-10 text-center font-heading text-[32px] font-normal tracking-tight text-ink sm:text-[44px]">Study streak leaders</h1>
      <p className="mx-auto mt-2 max-w-md text-center text-[14px] text-muted">
        {tab === "current" ? "Days in a row with at least one question asked. Ask one today to keep yours going." : "The longest run of days in a row each student has had."}
      </p>

      {ranked.length === 0 ? (
        <p className="mt-16 text-center text-[15px] text-muted">No streaks yet. Ask a question today and you&apos;ll be first.</p>
      ) : (
        <>
          {/* The top three: first in the middle and raised, second on the left, third on the right. */}
          <ol className="mx-auto mt-10 grid max-w-3xl grid-cols-3 items-end gap-3 sm:gap-5" aria-label="Top three">
            {[top[1], top[0], top[2]].map((r, i) =>
              r ? <Podium key={r.userId} row={r} first={i === 1} me={r.userId === user.id} programme={programme(r.programme)} days={score(r)} /> : <li key={i} aria-hidden />,
            )}
          </ol>

          {rest.length > 0 && (
            <ol className="mx-auto mt-12 grid max-w-4xl gap-2.5 md:grid-cols-2 md:gap-x-5" aria-label="Everyone else">
              {rest.map((r) => (
                <Row key={r.userId} row={r} me={r.userId === user.id} programme={programme(r.programme)} days={score(r)} />
              ))}
            </ol>
          )}

          {/* Below the shown places: where the student stands. */}
          <div className="mx-auto mt-8 max-w-4xl">
            {me && me.rank > SHOWN && (
              <ol>
                <Row row={me} me programme={programme(me.programme)} days={score(me)} />
              </ol>
            )}
            {!me && <p className="text-center text-[14px] text-muted">You&apos;re not on this board yet. Ask a question today to start a streak.</p>}
          </div>
        </>
      )}
    </div>
  );
}

const MEDAL = ["bg-amber-200 text-amber-900", "bg-pau-400 text-white", "bg-[#ecdcfb] text-[#5b3a86]"];

function Podium({ row, first, me, programme, days }: { row: BoardRow & { rank: number }; first: boolean; me: boolean; programme: string; days: number }) {
  return (
    <li className={`relative flex flex-col items-center rounded-3xl bg-card px-2 pb-12 text-center ring-1 ${me ? "ring-2 ring-brand" : "ring-line"} ${first ? "pt-10 sm:pt-12" : "pt-7 sm:pt-8"}`}>
      {isPartnerId(row.partner) ? <Mascot partner={row.partner} size={first ? 76 : 60} mood="happy" animated={false} /> : <Initial name={row.name} size={first ? 76 : 60} />}
      <p className={`mt-4 max-w-full truncate font-heading text-ink ${first ? "text-[20px] sm:text-[24px]" : "text-[17px] sm:text-[20px]"}`}>
        {row.name}
        {me && <span className="sr-only"> (you)</span>}
      </p>
      {programme && <p className="mt-0.5 max-w-full truncate text-[12px] text-muted">{programme}</p>}
      <p className="mt-3 text-[14px] text-muted">
        {days} {days === 1 ? "day" : "days"}
      </p>
      <span className={`absolute -bottom-6 grid h-12 w-12 place-items-center rounded-full font-heading text-[22px] ring-4 ring-page sm:h-14 sm:w-14 sm:text-[26px] ${MEDAL[row.rank - 1]}`}>{row.rank}</span>
    </li>
  );
}

function Row({ row, me, programme, days }: { row: BoardRow & { rank: number }; me: boolean; programme: string; days: number }) {
  return (
    <li className={`flex items-center gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ${me ? "ring-2 ring-brand" : "ring-line"}`}>
      <span className="w-7 shrink-0 text-[15px] font-medium text-ink">{row.rank}</span>
      {isPartnerId(row.partner) ? <Mascot partner={row.partner} size={32} animated={false} /> : <Initial name={row.name} size={32} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">
          {row.name}
          {me && <span className="ml-2 rounded-full bg-pau-100 px-2 py-0.5 text-[11.5px] font-medium text-brand">You</span>}
        </span>
        {programme && <span className="block truncate text-[12px] text-muted">{programme}</span>}
      </span>
      <span className="shrink-0 text-[15px] font-medium text-ink">{days}</span>
      <Flame size={18} absoluteStrokeWidth strokeWidth={1.5} className="shrink-0 text-orange-500" aria-label="days" />
    </li>
  );
}

function Initial({ name, size }: { name: string; size: number }) {
  return (
    <span className="grid place-items-center rounded-full bg-sunken font-medium text-ink" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name.slice(0, 1)}
    </span>
  );
}

export default function LeaderboardPage(props: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Loaded {...props} />
    </Suspense>
  );
}
