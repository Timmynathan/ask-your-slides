"use client";

// The app's sidebar (owner, 20 Nov 2026), shared by the dashboard, Past questions and Chat, from
// tablets up (phones keep each page's own top bar). A dark navy rail (logo, the sidebar button,
// search, chat, past questions, account) beside a panel: Dashboard, Chat, Past questions, Upload,
// and My files (the student's own uploads; the courses are on the dashboard).
// The panel's title is the student's programme. The sidebar button sits at the right of the title, and
// beside the rail when the panel is closed: clicking it keeps the panel open (pinned) or closes it; while closed, hovering it slides the panel out over
// the page until the pointer leaves. A small label says what a click will do. Full height, square edges. A pinned panel can be dragged narrower by its right edge;
// far enough closes it. Pinned/closed and width are remembered in this browser.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { AccountMenu } from "@/components/ui/account-menu";
import { UploadDialog } from "./upload-dialog";
import { FeedbackDialog } from "./feedback-dialog";

export type ShellPage = "dashboard" | "chat" | "past" | "account";
export interface ShellCourse {
  id: string;
  title: string;
  href: string;
}
/** One of the student's own uploads (My files). */
export interface ShellFile {
  id: string;
  title: string;
  status: "uploading" | "reading" | "ready" | "failed";
  pages: number;
  course: string;
}
/** A recent chat: its title, and the link into its course with the chat open. */
export interface ShellChat {
  id: string;
  title: string;
  href: string;
}

/** Phones: the pages' menu button opens the sidebar as a drawer (ShellMenuButton). */
const ShellMenu = createContext<{ open(): void; tip: boolean; upload(): void } | null>(null);

/** Phones inside a course (owner, 21 Nov 2026): the app's links and Upload at the top of the course's
 *  topics drawer, so one menu holds everything (tablets up have the sidebar instead). */
export function ShellNavMini({ onNavigate }: { onNavigate?(): void }) {
  const menu = useContext(ShellMenu);
  const link = "flex items-center gap-3 rounded-xl px-3 py-2 text-[14.5px] text-white/80 transition hover:bg-white/10 hover:text-white";
  return (
    <div className="border-b border-white/10 px-2 pb-3 pt-3">
      <Link href="/dashboard" onClick={onNavigate} className={link}>
        <Icon size={18}>{ICONS.home}</Icon>
        My courses
      </Link>
      <Link href="/past-questions" onClick={onNavigate} className={link}>
        <Icon size={18}>{ICONS.past}</Icon>
        Past questions
      </Link>
      {menu && (
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            menu.upload();
          }}
          className={`${link} w-full`}
        >
          <Icon size={18}>{ICONS.upload}</Icon>
          Upload
        </button>
      )}
    </div>
  );
}

/** Inside a course (owner, 21 Nov 2026): the course page tells the shared sidebar which course is open
 *  and fills the panel's lower part (its topics) through a portal into `slot`. The sidebar itself
 *  stays mounted, so going from the dashboard into a course never blanks the screen. */
const ShellCourseCtx = createContext<{ setCourse(c: { id: string; title: string } | null): void; slot: HTMLElement | null } | null>(null);
export function useShellCourse() {
  return useContext(ShellCourseCtx);
}

export function ShellMenuButton({ className = "" }: { className?: string }) {
  const menu = useContext(ShellMenu);
  if (!menu) return null;
  return (
    <span className="relative md:hidden">
      <button type="button" onClick={menu.open} aria-label="Open menu" className={`grid h-10 w-10 place-items-center rounded-full text-ink transition hover:bg-sunken active:scale-90 ${className}`}>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {menu.tip && (
        // One-time tip on phones (owner, 20 Nov 2026), like the course page tour.
        <span className="pop-in absolute left-0 top-12 z-40 w-64 rounded-2xl bg-navy p-4 text-left text-[14px] leading-snug text-white shadow-xl">
          <span className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 bg-navy" />
          New: tap the menu to <span className="font-semibold">upload photos of your tests</span>, find past questions and your recent chats.
        </span>
      )}
    </span>
  );
}

const TIP_KEY = "ays-menu-tip-seen";

const RAIL = 64;
const MIN_W = 200;
const MAX_W = 340;
const DEFAULT_W = 252;
const CLOSE_BELOW = 150; // dragging narrower than this closes the panel
const KEY = "ays:sidebar";

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const ICONS = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  home: <path d="M4 11.5 12 5l8 6.5V20h-5.5v-5.5h-5V20H4z" />,
  chat: <path d="M5 6.5h14v9H10l-4 3.5v-3.5H5z" />,
  past: (
    <>
      <path d="M7 3.5h7l4 4V20.5H7z" />
      <path d="M14 3.5v4h4M10 12h5M10 15.5h5" />
    </>
  ),
  panel: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  book: <path d="M6 4.5h10.5a1.5 1.5 0 0 1 1.5 1.5v13.5H7.5A1.5 1.5 0 0 1 6 18V4.5zM6 18a1.5 1.5 0 0 1 1.5-1.5H18" />,
  upload: <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" />,
  feedback: <path d="M14.5 4.5l5 5L9 20H4v-5L14.5 4.5zM12.5 6.5l5 5" />,
};

const railCls = (active: boolean) => `grid h-11 w-11 place-items-center rounded-xl transition active:scale-90 ${active ? "bg-white/15 text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`;

function RailButton({ label, active = false, href, onClick, children }: { label: string; active?: boolean; href?: string; onClick?(): void; children: ReactNode }) {
  return href ? (
    <Link href={href} aria-label={label} title={label} className={railCls(active)}>
      <Icon>{children}</Icon>
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={railCls(active)}>
      <Icon>{children}</Icon>
    </button>
  );
}

const rowCls = (active: boolean) =>
  `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[14.5px] transition ${active ? "bg-white/12 text-white" : "text-white/75 hover:bg-white/8 hover:text-white"}`;

function NavItem({ label, href, active, icon, soon = false }: { label: string; href: string; active: boolean; icon: ReactNode; soon?: boolean }) {
  if (soon) {
    return (
      <span className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2 text-[14.5px] text-white/45" title={`${label}: coming soon`}>
        <Icon size={18}>{icon}</Icon>
        <span className="flex-1 truncate">{label}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] text-white/70">Soon</span>
      </span>
    );
  }
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={rowCls(active)}>
      <Icon size={18}>{icon}</Icon>
      <span className="flex-1 truncate">{label}</span>
    </Link>
  );
}

export function AppShell({
  page: pageProp,
  title = "",
  courses = [],
  railOnly = false,
  courseMenu,
  defaultCourseId,
  recent = [],
  files = [],
  user,
  onSearch,
  onUpload,
  onChangePartner,
  children,
}: {
  /** Which item is current; worked out from the address when left out (the shared layout). */
  page?: ShellPage;
  /** The student's programme, e.g. "Computer Science" (lib/programmes sidebarTitle). */
  title?: string;
  courses?: ShellCourse[];
  /** Only the dark rail, no panel (Plans and pricing, Settings, Your profile: owner, 21 Nov 2026). */
  railOnly?: boolean;
  /** Inside a course (owner, 21 Nov 2026): the panel's title is the course and its lower part is the
   *  course's own menu (past questions, topics, chats) instead of Recent chats and My files. */
  courseMenu?: { title: string; body: ReactNode };
  /** Upload starts on this course. */
  defaultCourseId?: string;
  /** The student's latest chats, newest first. */
  recent?: ShellChat[];
  /** The student's own uploads, newest first. */
  files?: ShellFile[];
  user: { email: string; displayName: string | null };
  /** Search button: the page's own search (dashboard), else it opens the dashboard. */
  onSearch?(): void;
  /** Deprecated: the shell opens its own Upload dialog. */
  onUpload?(): void;
  onChangePartner?(): void;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const page: ShellPage =
    pageProp ?? (pathname.startsWith("/past-questions") ? "past" : pathname.startsWith("/chat") ? "chat" : pathname.startsWith("/dashboard") ? "dashboard" : "account");
  // Search: on My courses it focuses the page's search box (the dashboard listens), elsewhere it goes there.
  const search =
    onSearch ??
    (() => {
      if (pathname.startsWith("/dashboard")) window.dispatchEvent(new Event("ays:focus-search"));
      else router.push("/dashboard?search=1");
    });
  const [uploading, setUploading] = useState(false);
  const [openCourse, setCourse] = useState<{ id: string; title: string } | null>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const courseCtx = useMemo(() => ({ setCourse, slot }), [slot]);
  const inCourse = !!courseMenu || !!openCourse;
  const panelTitle = courseMenu?.title ?? openCourse?.title ?? title;
  const [feedback, setFeedback] = useState(false);
  const [drawer, setDrawer] = useState(false);
  // Phones: a one-time tip pointing at the menu button.
  const [tip, setTip] = useState(false);
  useEffect(() => {
    let seen = true;
    try {
      seen = !!localStorage.getItem(`${TIP_KEY}:${user.email.toLowerCase()}`);
    } catch {}
    if (seen || !window.matchMedia("(max-width: 47.98rem)").matches) return;
    const t = setTimeout(() => setTip(true), 1200);
    return () => clearTimeout(t);
  }, [user.email]);
  // Any tap hides the tip (a tap on the menu button also opens the menu).
  useEffect(() => {
    if (!tip) return;
    const off = () => {
      setTip(false);
      try {
        localStorage.setItem(`${TIP_KEY}:${user.email.toLowerCase()}`, "1");
      } catch {}
    };
    window.addEventListener("pointerdown", off, { once: true });
    return () => window.removeEventListener("pointerdown", off);
  }, [tip, user.email]);
  const hideTip = () => {
    setTip(false);
    try {
      localStorage.setItem(`${TIP_KEY}:${user.email.toLowerCase()}`, "1");
    } catch {}
  };
  const openDrawer = () => {
    hideTip();
    setDrawer(true);
  };
  // While a file is being read, refresh every few seconds so My files shows when it's ready.
  const pending = files.some((f) => f.status === "uploading" || f.status === "reading");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [pending, router]);
  const removeFile = async (f: ShellFile) => {
    if (!window.confirm(`Delete "${f.title}"? Your study partner won't use it any more.`)) return;
    await fetch(`/api/uploads/${f.id}`, { method: "DELETE" });
    router.refresh();
  };
  const [pinned, setPinned] = useState(true);
  const [peek, setPeek] = useState(false);
  const [width, setWidth] = useState(DEFAULT_W);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; w: number } | null>(null);

  // Remembered after hydration, so server and browser first render the same (open) layout.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { open?: boolean; width?: number } | null;
      if (saved) {
        const id = setTimeout(() => {
          if (typeof saved.width === "number") setWidth(Math.min(MAX_W, Math.max(MIN_W, saved.width)));
          if (saved.open === false) setPinned(false);
        }, 0);
        return () => clearTimeout(id);
      }
    } catch {}
  }, []);
  const remember = useCallback((next: { open: boolean; width: number }) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    setPeek(false);
    remember({ open: next, width });
  };

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (!pinned) return;
    start.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    setWidth(Math.min(MAX_W, Math.max(CLOSE_BELOW - 30, start.current.w + e.clientX - start.current.x)));
  }
  function onDragEnd() {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (width < CLOSE_BELOW) {
      setPinned(false);
      setWidth(DEFAULT_W);
      remember({ open: false, width: DEFAULT_W });
    } else {
      const w = Math.max(MIN_W, width);
      setWidth(w);
      remember({ open: true, width: w });
    }
  }

  const shown = !railOnly && (pinned || peek);
  // The panel's contents: beside the page (tablets up) and in the phone drawer.
  // `drawer`: the phone drawer copy, which never holds the course slot (phones in a course use the
  // course page's own topics drawer).
  const panel = (drawer: boolean) => (
    <>
      <p className="truncate pb-4 pl-5 pr-14 text-[15px] font-medium leading-9" title={panelTitle}>
        {panelTitle}
      </p>
      {/* In a course only Dashboard and Upload, so the topics get the room (owner, 21 Nov 2026). */}
      <nav className="flex flex-col gap-0.5 px-2" aria-label="Pages">
        <NavItem label="Dashboard" href="/dashboard" active={page === "dashboard"} icon={ICONS.home} />
        {!inCourse && <NavItem label="Past questions" href="/past-questions" active={page === "past"} icon={ICONS.past} />}
      </nav>
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => {
          setDrawer(false);
          setUploading(true);
        }}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white/12 py-2 text-[14px] font-medium text-white transition hover:bg-white/20 active:scale-[0.98]"
        >
          <Icon size={17}>{ICONS.upload}</Icon>
          Upload
        </button>
      </div>
      {courseMenu ? (
        <div className="mt-3 min-h-0 flex-1 overflow-hidden border-t border-white/10">{courseMenu.body}</div>
      ) : openCourse ? (
        drawer ? null : <div ref={setSlot} className="mt-3 min-h-0 flex-1 overflow-hidden border-t border-white/10" />
      ) : (
        <>
      {recent.length > 0 && (
        <>
          <p className="px-5 pb-1 pt-5 text-[12.5px] font-medium uppercase tracking-wide text-white/45">Recent chats</p>
          <ul className="px-2">
            {recent.map((c) => (
              <li key={c.id}>
                <Link href={c.href} title={c.title} className={`${rowCls(false)} text-[14px]`}>
                  <span className="shrink-0 text-white/45">
                    <Icon size={16}>{ICONS.chat}</Icon>
                  </span>
                  <span className="truncate">{c.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {/* The student's own uploads (owner, 20 Nov 2026): empty until uploading is built. */}
      <p className="px-5 pb-1 pt-5 text-[12.5px] font-medium uppercase tracking-wide text-white/45">My files</p>
      {files.length === 0 ? (
        <div className="min-h-0 flex-1 px-5 pt-1">
          <p className="text-[13px] leading-snug text-white/50">Nothing uploaded yet.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 [scrollbar-width:thin]">
          {files.map((f) => (
            <li key={f.id} className="group flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-white/75 hover:bg-white/8">
              <span className="shrink-0 text-white/45">
                <Icon size={16}>{ICONS.past}</Icon>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate" title={f.title}>
                  {f.title}
                </span>
                <span className={`block truncate text-[11.5px] ${f.status === "failed" ? "text-red-300" : "text-white/45"}`}>
                  {f.status === "ready"
                    ? `${f.course} · ${f.pages} ${f.pages === 1 ? "page" : "pages"}`
                    : f.status === "failed"
                      ? "Couldn't read it. Delete and retry"
                      : "Reading your pages…"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeFile(f)}
                aria-label={`Delete ${f.title}`}
                title="Delete"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
              >
                <Icon size={15}>
                  <path d="M6 6l12 12M18 6 6 18" />
                </Icon>
              </button>
            </li>
          ))}
        </ul>
      )}
        </>
      )}
    </>
  );
  const panelW = Math.max(MIN_W, width);
  return (
    <div className="min-h-dvh bg-page" style={{ ["--shell-pad" as string]: `${RAIL + (railOnly ? 0 : pinned ? panelW : 52)}px` }}>
      {/* Leaving the whole sidebar (rail and panel) ends a hover peek. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden md:flex" aria-label="Main" onMouseLeave={() => setPeek(false)}>
        {/* Rail */}
        <div className="flex w-16 flex-col items-center gap-1.5 bg-pau-900 py-4">
          <Link href="/" aria-label="Ask Your Slides home" title="Home" className="mb-2 grid h-11 w-11 place-items-center">
            <LogoMark size={26} light />
          </Link>
          <RailButton label="Search courses" onClick={search}>
            {ICONS.search}
          </RailButton>
          <RailButton label="Past questions" href="/past-questions" active={page === "past"}>
            {ICONS.past}
          </RailButton>
          <div className="mt-auto flex flex-col items-center gap-3">
            {/* Feedback (owner, 20 Nov 2026), just above the account. */}
            <RailButton label="Give us feedback" onClick={() => setFeedback(true)}>
              {ICONS.feedback}
            </RailButton>
            <AccountMenu user={user} onChangePartner={onChangePartner} side />
          </div>
        </div>

        {/* Panel: beside the page when pinned, over it while peeking */}
        {shown && (
          <div
            className={`relative flex h-full flex-col border-r border-white/10 bg-navy pb-4 pt-[18px] text-white ${pinned ? "" : "slide-in-left shadow-2xl"}`}
            style={{ width: panelW }}
          >
            {panel(false)}
            {/* Drag the right edge to resize; far enough left closes the panel. */}
            {pinned && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                onPointerDown={onDragStart}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                className={`absolute -right-1.5 top-0 h-full w-3 cursor-col-resize touch-none rounded-full transition-colors ${dragging ? "bg-white/25" : "hover:bg-white/15"}`}
              />
            )}
          </div>
        )}
        {/* The sidebar button, beside the title: always here, open or closed. Hover peeks while
            closed; click keeps the panel open, or closes it. */}
        {!railOnly && (
        <div className="group absolute top-[18px] z-50" style={{ left: shown ? RAIL + panelW - 46 : RAIL + 10 }} onMouseEnter={() => !pinned && setPeek(true)}>
          <button
            type="button"
            onClick={togglePin}
            aria-label={pinned ? "Close sidebar" : "Keep sidebar open"}
            aria-pressed={pinned}
            className={`grid h-9 w-9 place-items-center rounded-lg transition active:scale-90 ${shown ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-ink hover:bg-sunken"}`}
          >
            <Icon size={19}>{ICONS.panel}</Icon>
          </button>
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] text-white opacity-0 shadow-lg ring-1 ring-white/15 transition-opacity delay-200 group-hover:opacity-100">
            {pinned ? "Close sidebar" : "Keep sidebar open"}
          </span>
        </div>
        )}
      </aside>
      {/* Phones: the same sidebar as a drawer from the left. */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/40" />
          <div className="slide-in-left absolute inset-y-0 left-0 flex w-[84%] max-w-[320px] flex-col bg-navy pb-4 pt-[18px] text-white shadow-2xl" onClick={(e) => (e.target as HTMLElement).closest("a") && setDrawer(false)}>
            <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-[18px] grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10">
              <Icon size={19}>
                <path d="M6 6l12 12M18 6 6 18" />
              </Icon>
            </button>
            {panel(true)}
            <button
              type="button"
              onClick={() => {
                setDrawer(false);
                setFeedback(true);
              }}
              className="mx-2 mt-2 flex items-center gap-3 rounded-xl px-3 py-2 text-left text-[14.5px] text-white/75 transition hover:bg-white/8 hover:text-white"
            >
              <Icon size={18}>{ICONS.feedback}</Icon>
              Give us feedback
            </button>
            <div className="mt-2 flex items-center gap-3 border-t border-white/10 px-5 pt-4">
              <AccountMenu user={user} onChangePartner={onChangePartner} side />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-white/70">{user.displayName ?? user.email}</span>
            </div>
          </div>
        </div>
      )}
      {feedback && <FeedbackDialog onClose={() => setFeedback(false)} />}
      {uploading && <UploadDialog courses={courses} defaultCourseId={defaultCourseId ?? openCourse?.id} onClose={() => setUploading(false)} onDone={() => router.refresh()} />}
      <ShellMenu.Provider value={{ open: openDrawer, tip, upload: () => setUploading(true) }}>
        <ShellCourseCtx.Provider value={courseCtx}>
          <div className={`md:pl-[var(--shell-pad)] ${dragging ? "" : "md:transition-[padding] md:duration-200"}`}>{children}</div>
        </ShellCourseCtx.Provider>
      </ShellMenu.Provider>
    </div>
  );
}
