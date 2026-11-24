"use client";

// "My courses": every course as a card (or a row in list view), like a notebook library. A card
// opens the course's study workspace. Tabs (all / recently studied), search, sort, and a grid/list
// toggle (remembered per browser). The course list is data: new courses and departments just appear.
import Link from "next/link";
import { Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { ShellMenuButton } from "@/components/nav/app-shell";
import { PartnerGreeting } from "./partner-greeting";
import { EncourageCard } from "./encourage-card";
import { EXAMS_START, TIME_ZONE } from "@/lib/plans/config";

/** "7 December" (Lagos), from the plans config. */
const EXAMS_START_LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: TIME_ZONE }).format(EXAMS_START);
import { ExamsCard, RecentLectures, StreakCard, UpgradeCard, type RecentLecture } from "./side-cards";
import { HoverLink } from "@/components/ui/hover-link";
import { UpgradeButton } from "@/components/plans/upgrade-dialog";
import { PartnerSwitch } from "@/components/study/partner-switch";
import { AccountMenu } from "@/components/ui/account-menu";
import type { PartnerId } from "@/lib/partners";
import { CourseIcon } from "./course-icon";
import { EnrollDialog, prefetchEnrollments } from "./enroll-dialog";
import { useClickAway } from "@/lib/ui/use-click-away";

export interface DashboardCourse {
  id: string;
  code: string;
  /** /study/CODE, plus ?programme= when another programme has the same code. */
  href: string;
  title: string;
  department: string;
  /** Shown with an "Elective" tag (course.yaml elective: true). */
  elective: boolean;
  sortOrder: number;
  /** A course the student added from another level (retake or extra): its level, else null. */
  extraLevel: number | null;
  /** "CSC 402", or null when the code is a placeholder (only the title is shown). */
  shownCode: string | null;
  materials: number;
  /** Fewer than LIMITED_MAIN_MATERIALS slides/notes files: shown with a "Limited materials" tag. */
  limited: boolean;
  /** PRD F12, Free students only: a premium course and its free questions left today (else null). */
  premiumLeft: number | null;
  chats: number;
  lastStudiedAt: string | null; // ISO, for sorting
  lastStudied: string | null; // "3 Nov", formatted on the server
}

type Tab = "all" | "recent";
type View = "grid" | "list";
type Sort = "course" | "recent" | "az";
const SORTS: { id: Sort; label: string }[] = [
  { id: "course", label: "Course order" },
  { id: "recent", label: "Recently studied" },
  { id: "az", label: "A to Z" },
];
const VIEW_KEY = "ays:dashboard-view";

interface Props {
  courses: DashboardCourse[];
  user: { id: string; email: string; displayName: string | null };
  partner: PartnerId;
  /** On Finals: no Upgrade button, a quiet "Finals" badge instead. */
  onFinals: boolean;
  /** The course of the student's last chat, for the "jump back in" bubble (null: no chats yet). */
  lastStudied: { course: string; courseHref: string; chatHref: string } | null;
  /** The lectures of the latest chats, with their first slide as a picture. */
  recentLectures: RecentLecture[];
  /** Lagos days in a row with a question asked; today = asked one today already. */
  streak: { days: number; today: boolean };
  examsInDays: number;
  /** Free students: today's Finals price (naira); null on Finals. */
  price: number | null;
  /** Past questions are free in the student's programme. */
  freePast: boolean;
}

export function Dashboard({ courses, user, partner: initialPartner, onFinals, lastStudied, recentLectures, streak, examsInDays, price, freePast }: Props) {
  const [partner, setPartner] = useState<PartnerId>(initialPartner);
  const [pickingPartner, setPickingPartner] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("course");
  const [view, setView] = useState<View>("grid");
  const [enrolling, setEnrolling] = useState(false);
  // "Add a course" opens with its list already loaded: fetched quietly a moment after the page.
  useEffect(() => {
    const t = setTimeout(() => void prefetchEnrollments().catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, []);

  // Remembered view, read after hydration so server and browser first render the same thing.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(VIEW_KEY);
    } catch {}
    if (saved === "list") {
      const id = setTimeout(() => setView("list"), 0);
      return () => clearTimeout(id);
    }
  }, []);
  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const shown = useMemo(() => {
    const list = courses.filter((c) => tab === "all" || c.chats > 0);
    const by = tab === "recent" && sort === "course" ? "recent" : sort;
    return [...list].sort((a, b) =>
      by === "az"
        ? a.title.localeCompare(b.title)
        : by === "recent"
          ? (b.lastStudiedAt ?? "").localeCompare(a.lastStudiedAt ?? "") || a.sortOrder - b.sortOrder
          : a.sortOrder - b.sortOrder,
    );
  }, [courses, tab, sort]);

  const departments = [...new Set(courses.map((c) => c.department))];

  return (
    <>
      <div>
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 bg-page/90 px-4 backdrop-blur sm:gap-4 sm:px-6">
        <ShellMenuButton className="-ml-1.5" />
        <Link href="/" className="mr-1 shrink-0 rounded-full sm:mr-4 md:hidden" aria-label="Ask Your Slides home">
          <span className="sm:hidden">
            <LogoMark size={26} />
          </span>
          <span className="hidden sm:inline">
            <Logo size={26} />
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden rounded-full bg-sunken p-1 sm:flex" role="group" aria-label="View">
            <ViewButton active={view === "grid"} label="Grid view" onClick={() => chooseView("grid")}>
              <path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z" />
            </ViewButton>
            <ViewButton active={view === "list"} label="List view" onClick={() => chooseView("list")}>
              <path d="M3 5h14M3 10h14M3 15h14" />
            </ViewButton>
          </div>
          {/* Always in view (owner, 20 Nov 2026): Upgrade for Free students in its own bright aqua (#BBEEF0), a quiet badge on Finals. */}
          {onFinals ? (
            // A premium crown instead of a text badge (owner, 22 Nov 2026), on phones too.
            <Link
              href="/pricing"
              title="You're on Finals"
              aria-label="You're on Finals"
              className="grid h-10 w-10 place-items-center rounded-full bg-[#BBEEF0] text-brand ring-1 ring-[#8fdde1] transition hover:bg-[#a5e7ea] active:scale-95"
            >
              <Crown size={19} absoluteStrokeWidth strokeWidth={1.6} aria-hidden />
            </Link>
          ) : (
            <UpgradeButton
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#BBEEF0] px-3.5 text-[14px] font-semibold text-brand shadow-sm ring-1 ring-[#8fdde1] transition hover:bg-[#a5e7ea] active:scale-95"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />
              </svg>
              Upgrade
            </UpgradeButton>
          )}
          <PartnerSwitch partner={partner} onChanged={setPartner} open={pickingPartner} onOpenChange={setPickingPartner} account={user.id} />
          <div className="md:hidden">
            <AccountMenu user={user} onChangePartner={() => setPickingPartner(true)} />
          </div>
        </div>
      </header>

      {/* Two columns from 1024px, so landscape iPads see the side cards too (owner, 23 Nov 2026). Was: two columns on wide screens (owner, 22 Nov 2026): the greeting, recent lectures and courses on
          the left; Finals, the exam countdown and the streak on the right. */}
      <main className="mx-auto grid max-w-[1280px] gap-8 px-4 pb-16 pt-4 sm:px-6 sm:pt-6 md:grid-cols-[minmax(0,1fr)_220px] md:gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        {/* The study partner's greeting (owner, 22 Nov 2026). The "Ask anything" box was removed the
            same day: questions are asked inside a course, so everything stays organised by course. */}
        <PartnerGreeting partner={partner} name={user.displayName} lastStudied={lastStudied} />
        <RecentLectures lectures={recentLectures} />

        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-[24px] font-medium tracking-tight text-ink sm:text-[26px]">My courses</h1>
              <SortMenu sort={sort} onSort={setSort} />
            </div>
            <p className="mt-1 text-sm text-muted">
              {departments.join(", ")} · {courses.length} {courses.length === 1 ? "course" : "courses"}, all slides already here
            </p>
          </div>
          {/* Right side, in the brand blue (owner, 21 Nov 2026): easier to find. */}
          <button
            type="button"
            onClick={() => setEnrolling(true)}
            onPointerEnter={() => void prefetchEnrollments().catch(() => {})}
            onFocus={() => void prefetchEnrollments().catch(() => {})}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand py-2.5 pl-3.5 pr-4 text-[15px] font-medium text-brand-ink shadow-sm transition hover:bg-navy-hover active:scale-95"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M8 3v10M3 8h10" />
            </svg>
            Add a course
          </button>
        </div>

        {shown.length === 0 ? (
          <Empty tab={tab} onAll={() => setTab("all")} />
        ) : view === "grid" ? (
          <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3" aria-label="Courses">
            {shown.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </ul>
        ) : (
          <ul className="overflow-hidden rounded-3xl bg-sunken/60" aria-label="Courses">
            {shown.map((c) => (
              <CourseRow key={c.id} course={c} />
            ))}
          </ul>
        )}
      </div>
      <aside className="grid content-start gap-4 sm:grid-cols-2 md:grid-cols-1 md:max-lg:gap-3 md:max-lg:[&>*]:p-4" aria-label="Your plan and progress">
        {/* Encouragement for everyone (owner, 22 Nov 2026); the payment option sits below the progress cards. */}
        <EncourageCard name={user.displayName} examsInDays={examsInDays} onFinals={price === null} />
        <ExamsCard days={examsInDays} startLabel={EXAMS_START_LABEL} />
        <StreakCard days={streak.days} today={streak.today} />
        {price !== null && <UpgradeCard freePast={freePast} />}
      </aside>
      </main>
      </div>
      {enrolling && <EnrollDialog onClose={() => setEnrolling(false)} />}
    </>
  );
}

function LevelTag({ level, onDark = false }: { level: number; onDark?: boolean }) {
  return (
    <span
      title="A course you added from another level"
      className={`inline-block rounded-full px-2.5 py-0.5 align-middle text-[12px] font-medium ${onDark ? "mb-2 mr-1 bg-white/15 text-white" : "ml-2 bg-sunken text-ink"}`}
    >
      {level} level
    </span>
  );
}

function LimitedTag({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      title="Only a few lecture files are up for this course so far. Answers explain more from general knowledge, clearly marked."
      className={`inline-block rounded-full px-2.5 py-0.5 align-middle text-[12px] font-medium ${
        onDark ? "mb-2 ml-1 bg-amber-200/20 text-amber-100" : "ml-2 bg-amber-50 text-amber-800"
      }`}
    >
      Limited materials
    </span>
  );
}

const freeLeft = (n: number) => `${n} free question${n === 1 ? "" : "s"} left today`;

function PremiumTag({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      title="Premium courses are the heaviest courses in your programme. Free gives a few questions a day; Finals has no limit."
      className={`inline-block rounded-full px-2.5 py-0.5 align-middle text-[12px] font-semibold ${
        onDark ? "mb-2 ml-1 bg-white/15 text-white" : "ml-2 bg-pau-100 text-pau-800 dark:text-pau-400"
      }`}
    >
      Premium
    </span>
  );
}

function ElectiveTag({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 align-middle text-[12px] font-medium ${
        onDark ? "mb-2 bg-white/15 text-white" : "ml-2 bg-pau-100 text-brand"
      }`}
    >
      Elective
    </span>
  );
}

function meta(c: DashboardCourse) {
  return `${c.shownCode ? `${c.shownCode} · ` : ""}${c.materials} ${c.materials === 1 ? "material" : "materials"}`;
}

function CourseCard({ course: c }: { course: DashboardCourse }) {
  return (
    <li className="group relative flex min-h-[150px] flex-col rounded-[22px] bg-navy p-4 text-white sm:min-h-[170px] sm:p-5 md:max-lg:min-h-[140px] md:max-lg:p-4 transition hover:bg-navy-hover hover:shadow-lg has-[a:active]:scale-[0.985]">
      {/* The whole card is the link; the menu sits above it. */}
      {/* The course loads in full as soon as the pointer is over the card (or a finger touches it), so
          the click opens it at once (owner, 21 Nov 2026: "it takes a while for the chat to show"). */}
      <HoverLink href={c.href} className="absolute inset-0 z-0 rounded-[22px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" aria-label={`Open ${c.shownCode ? `${c.shownCode}, ` : ""}${c.title}`} />
      <div className="flex items-start justify-between">
        <CourseIcon title={c.title} size={26} className="mt-0.5" light />
        <CardMenu course={c} onDark />
      </div>
      <div className="mt-auto">
        {c.extraLevel !== null && <LevelTag level={c.extraLevel} onDark />}
        {c.elective && <ElectiveTag onDark />}
        {c.limited && <LimitedTag onDark />}
        {c.premiumLeft !== null && <PremiumTag onDark />}
        <h2 className="line-clamp-2 text-[15px] leading-snug text-white sm:text-[17px]" title={c.title}>
          {c.title}
        </h2>
        <p className="mt-1 truncate text-[12.5px] text-white/70 sm:text-[13px]">
          {meta(c)}
          {c.lastStudied && ` · Studied ${c.lastStudied}`}
        </p>
        {c.premiumLeft !== null && <p className="mt-1 text-[13px] text-white/80">{freeLeft(c.premiumLeft)}</p>}
      </div>
    </li>
  );
}

function CourseRow({ course: c }: { course: DashboardCourse }) {
  return (
    <li className="relative flex items-center gap-4 border-b border-line/70 px-5 py-3.5 last:border-0 hover:bg-pau-50">
      <HoverLink href={c.href} className="absolute inset-0 z-0" aria-label={`Open ${c.shownCode ? `${c.shownCode}, ` : ""}${c.title}`} />
      <CourseIcon title={c.title} size={22} />
      <span className="min-w-0 flex-1 truncate text-[16px] text-ink">
        {c.title}
        {c.extraLevel !== null && <LevelTag level={c.extraLevel} />}
        {c.elective && <ElectiveTag />}
        {c.limited && <LimitedTag />}
        {c.premiumLeft !== null && <PremiumTag />}
        {c.premiumLeft !== null && <span className="ml-2 align-middle text-[13px] text-muted">{freeLeft(c.premiumLeft)}</span>}
      </span>
      <span className="hidden w-24 shrink-0 text-sm text-muted sm:block">{c.shownCode ?? ""}</span>
      <span className="hidden w-28 shrink-0 text-sm text-muted md:block">
        {c.materials} {c.materials === 1 ? "material" : "materials"}
      </span>
      <span className="hidden w-32 shrink-0 text-sm text-muted lg:block">{c.lastStudied ? `Studied ${c.lastStudied}` : "Not started"}</span>
      <CardMenu course={c} />
    </li>
  );
}

/** ⋮ menu on a card: open, or copy a link to share with coursemates (links survive sign-in). */
function CardMenu({ course: c, onDark = false }: { course: DashboardCourse; onDark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState(false);
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  useClickAway(root, open, () => setOpen(false));

  // Take any course off My courses (owner, 19 Nov 2026: carryovers who don't take it). Chats are
  // kept; "Add a course" brings it back.
  const remove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await fetch("/api/enrollments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course: c.id }) });
      router.refresh();
    } finally {
      setRemoving(false);
      setOpen(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${c.href}`);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1100);
    } catch {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative z-10">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`More options for ${c.shownCode ?? c.title}`}
        aria-expanded={open}
        className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${onDark ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-muted hover:bg-black/5 hover:text-ink"}`}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <circle cx="10" cy="4.5" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="10" cy="15.5" r="1.6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="pop-in absolute right-0 top-10 w-52 overflow-hidden rounded-2xl bg-card py-1.5 text-sm shadow-lg ring-1 ring-line">
          <Link role="menuitem" href={c.href} className="block px-4 py-2.5 text-ink hover:bg-sunken">
            Open course
          </Link>
          <button role="menuitem" onClick={copy} className="block w-full px-4 py-2.5 text-left text-ink hover:bg-sunken">
            {copied ? "Link copied ✓" : "Copy link for coursemates"}
          </button>
          <button role="menuitem" onClick={remove} disabled={removing} className="block w-full px-4 py-2.5 text-left text-ink hover:bg-sunken disabled:opacity-50">
            {removing ? "Removing…" : "Remove course"}
          </button>
        </div>
      )}
    </div>
  );
}

function SortMenu({ sort, onSort }: { sort: Sort; onSort(s: Sort): void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useClickAway(root, open, () => setOpen(false));
  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Sort: ${SORTS.find((s) => s.id === sort)?.label}`}
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-full text-ink transition hover:bg-sunken active:scale-90"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M3 6h14M3 10h9M3 14h5" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="pop-in absolute left-0 top-10 z-30 w-52 overflow-hidden rounded-2xl bg-card py-1.5 text-sm shadow-lg ring-1 ring-line">
          {SORTS.map((s) => (
            <button
              key={s.id}
              role="menuitemradio"
              aria-checked={sort === s.id}
              onClick={() => {
                onSort(s.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-ink hover:bg-sunken"
            >
              {s.label}
              {sort === s.id && <span className="text-brand">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewButton({ active, label, onClick, children }: { active: boolean; label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-9 w-11 place-items-center rounded-full transition active:scale-90 ${active ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"}`}
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function Empty({ tab, onAll }: { tab: Tab; onAll(): void }) {
  return (
    <div className="rounded-[28px] bg-sunken px-6 py-16 text-center">
      {tab === "recent" ? (
        <>
          <p className="text-ink">You haven&apos;t studied a course yet.</p>
          <button onClick={onAll} className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-ink transition active:scale-95">
            See all courses
          </button>
        </>
      ) : (
        <p className="text-ink">No courses in My courses. Use Add a course to add one.</p>
      )}
    </div>
  );
}
