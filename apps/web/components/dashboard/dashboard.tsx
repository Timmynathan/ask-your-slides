"use client";

// "My courses": every course as a card (or a row in list view), like a notebook library. A card
// opens the course's study workspace. Tabs (all / recently studied), search, sort, and a grid/list
// toggle (remembered per browser). The course list is data: new courses and departments just appear.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { AccountMenu } from "@/components/ui/account-menu";
import { CourseIcon } from "./course-icon";
import { displayCode } from "@/lib/study/format";
import { useClickAway } from "@/lib/ui/use-click-away";

export interface DashboardCourse {
  id: string;
  code: string;
  title: string;
  department: string;
  sortOrder: number;
  materials: number;
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
  user: { email: string; displayName: string | null };
  resume: { href: string; label: string } | null;
}

export function Dashboard({ courses, user, resume }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("course");
  const [view, setView] = useState<View>("grid");

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
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    let list = courses.filter((c) => tab === "all" || c.chats > 0);
    if (q) list = list.filter((c) => (c.title + c.code).toLowerCase().replace(/\s+/g, "").includes(q));
    const by = tab === "recent" && sort === "course" ? "recent" : sort;
    return [...list].sort((a, b) =>
      by === "az"
        ? a.title.localeCompare(b.title)
        : by === "recent"
          ? (b.lastStudiedAt ?? "").localeCompare(a.lastStudiedAt ?? "") || a.sortOrder - b.sortOrder
          : a.sortOrder - b.sortOrder,
    );
  }, [courses, tab, query, sort]);

  const departments = [...new Set(courses.map((c) => c.department))];

  return (
    <div className="min-h-dvh bg-page">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 bg-page/90 px-4 backdrop-blur sm:gap-4 sm:px-6">
        <Link href="/dashboard" className="mr-1 shrink-0 rounded-full sm:mr-4" aria-label="Ask Your Slides, my courses">
          <Logo size={26} />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Filter courses">
          {(
            [
              ["all", "All courses"],
              ["recent", "Recently studied"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`rounded-full px-4 py-2 text-sm transition active:scale-95 ${tab === id ? "bg-sunken font-medium text-ink" : "text-ink hover:bg-sunken/60"}`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <label className="relative hidden sm:block">
            <span className="sr-only">Search courses</span>
            <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="m13 13 4 4" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses"
              className="h-11 w-56 rounded-full border border-line bg-card pl-10 pr-4 text-[15px] text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15 lg:w-80"
            />
          </label>
          <div className="hidden rounded-full bg-sunken p-1 sm:flex" role="group" aria-label="View">
            <ViewButton active={view === "grid"} label="Grid view" onClick={() => chooseView("grid")}>
              <path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z" />
            </ViewButton>
            <ViewButton active={view === "list"} label="List view" onClick={() => chooseView("list")}>
              <path d="M3 5h14M3 10h14M3 15h14" />
            </ViewButton>
          </div>
          <AccountMenu user={user} />
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        {/* Phone: tabs and search under the bar */}
        <div className="mb-5 flex flex-col gap-3 md:hidden">
          <div className="flex gap-1">
            {(
              [
                ["all", "All courses"],
                ["recent", "Recently studied"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={`rounded-full px-4 py-2 text-sm transition active:scale-95 ${tab === id ? "bg-sunken font-medium text-ink" : "text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses"
            aria-label="Search courses"
            className="h-11 w-full rounded-full border border-line bg-card px-4 text-[15px] text-ink outline-none placeholder:text-muted focus:border-brand sm:hidden"
          />
        </div>

        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[28px] font-normal tracking-tight text-ink sm:text-[32px]">{tab === "all" ? "My courses" : "Recently studied"}</h1>
              <SortMenu sort={sort} onSort={setSort} />
            </div>
            <p className="mt-1 text-sm text-muted">
              {departments.join(", ")} · {courses.length} {courses.length === 1 ? "course" : "courses"}, all slides already here
            </p>
          </div>
          {resume && (
            <Link
              href={resume.href}
              className="ml-auto inline-flex max-w-full items-center gap-2 rounded-full bg-brand py-2.5 pl-4 pr-5 text-[15px] font-medium text-white shadow-sm transition hover:bg-pau-900 active:scale-95"
              title={resume.label}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
              Continue studying
            </Link>
          )}
        </div>

        {shown.length === 0 ? (
          <Empty tab={tab} query={query} onAll={() => setTab("all")} />
        ) : view === "grid" ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" aria-label="Courses">
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
      </main>
    </div>
  );
}

function meta(c: DashboardCourse) {
  return `${displayCode(c.code)} · ${c.materials} ${c.materials === 1 ? "material" : "materials"}`;
}

function CourseCard({ course: c }: { course: DashboardCourse }) {
  return (
    <li className="group relative flex min-h-[230px] flex-col rounded-[28px] bg-sunken p-7 transition hover:bg-pau-50 hover:shadow-sm has-[a:active]:scale-[0.985]">
      {/* The whole card is the link; the menu sits above it. */}
      <Link href={`/study/${c.code}`} className="absolute inset-0 z-0 rounded-[28px] focus-visible:outline-2 focus-visible:outline-brand" aria-label={`Open ${displayCode(c.code)}, ${c.title}`} />
      <div className="flex items-start justify-between">
        <CourseIcon title={c.title} size={34} className="mt-1" />
        <CardMenu course={c} />
      </div>
      <div className="mt-auto">
        <h2 className="truncate text-[22px] leading-tight text-ink" title={c.title}>
          {c.title}
        </h2>
        <p className="mt-1.5 truncate text-[15px] text-muted">
          {meta(c)}
          {c.lastStudied && ` · Studied ${c.lastStudied}`}
        </p>
      </div>
    </li>
  );
}

function CourseRow({ course: c }: { course: DashboardCourse }) {
  return (
    <li className="relative flex items-center gap-4 border-b border-line/70 px-5 py-3.5 last:border-0 hover:bg-pau-50">
      <Link href={`/study/${c.code}`} className="absolute inset-0 z-0" aria-label={`Open ${displayCode(c.code)}, ${c.title}`} />
      <CourseIcon title={c.title} size={22} />
      <span className="min-w-0 flex-1 truncate text-[16px] text-ink">{c.title}</span>
      <span className="hidden w-24 shrink-0 text-sm text-muted sm:block">{displayCode(c.code)}</span>
      <span className="hidden w-28 shrink-0 text-sm text-muted md:block">
        {c.materials} {c.materials === 1 ? "material" : "materials"}
      </span>
      <span className="hidden w-32 shrink-0 text-sm text-muted lg:block">{c.lastStudied ? `Studied ${c.lastStudied}` : "Not started"}</span>
      <CardMenu course={c} />
    </li>
  );
}

/** ⋮ menu on a card: open, or copy a link to share with coursemates (links survive sign-in). */
function CardMenu({ course: c }: { course: DashboardCourse }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useClickAway(root, open, () => setOpen(false));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/study/${c.code}`);
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
        aria-label={`More options for ${displayCode(c.code)}`}
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-black/5 hover:text-ink active:scale-90"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <circle cx="10" cy="4.5" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="10" cy="15.5" r="1.6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="pop-in absolute right-0 top-10 w-52 overflow-hidden rounded-2xl bg-card py-1.5 text-sm shadow-lg ring-1 ring-line">
          <Link role="menuitem" href={`/study/${c.code}`} className="block px-4 py-2.5 text-ink hover:bg-sunken">
            Open course
          </Link>
          <button role="menuitem" onClick={copy} className="block w-full px-4 py-2.5 text-left text-ink hover:bg-sunken">
            {copied ? "Link copied ✓" : "Copy link for coursemates"}
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

function Empty({ tab, query, onAll }: { tab: Tab; query: string; onAll(): void }) {
  return (
    <div className="rounded-[28px] bg-sunken px-6 py-16 text-center">
      {query.trim() ? (
        <p className="text-ink">No courses match “{query.trim()}”.</p>
      ) : tab === "recent" ? (
        <>
          <p className="text-ink">You haven&apos;t studied a course yet.</p>
          <button onClick={onAll} className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition active:scale-95">
            See all courses
          </button>
        </>
      ) : (
        <p className="text-ink">No courses are available yet.</p>
      )}
    </div>
  );
}
