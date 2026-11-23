"use client";

// The app's sidebar (owner, 20–21 Nov 2026), in the shared layout app/(app)/(shell)/.
//
// Everywhere: a slim dark rail with the logo (landing page), Dashboard, search, Recent chats (a full-height
// list beside the rail, like ChatGPT's), feedback and the account. Outside a course that rail is all there is (owner: Past
// questions, Upload and My files don't belong on the dashboard).
// Inside a course: a panel beside the rail with the course name, Upload, and the course's own menu
// (past questions, topics, chats), filled in by the course page through a portal (useShellCourse).
// The panel's button sits at the right of its title: click to open or close it (no hover peek). Like
// ChatGPT's chat list, it stays open while the student moves between lectures (owner, 22 Nov 2026). A pinned panel can be dragged narrower by its right
// edge; far enough closes it. Open/closed and width are remembered in this browser.
// Phones have no rail: the dashboard's menu button opens a drawer with the same items.
// Icons: Lucide (owner, 21 Nov 2026: no hand-drawn icons).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ASK_ANYTHING_ON } from "@/lib/ask-feature";
import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { History, House, Menu, MessageCircle, PanelLeft, PencilLine, X, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { AccountMenu } from "@/components/ui/account-menu";
import { HoverLink } from "@/components/ui/hover-link";
import { UploadDialog } from "./upload-dialog";
import { FeedbackDialog } from "./feedback-dialog";
import { RecentChatsPanel } from "./recent-chats-panel";

export type ShellPage = "dashboard" | "chat" | "past" | "account";
export interface ShellCourse {
  id: string;
  title: string;
  href: string;
}
/** A recent chat: its title, and the link into its course with the chat open. */
export interface ShellChat {
  id: string;
  title: string;
  href: string;
  /** The course's code (or title when the code is a placeholder), shown beside the chat. */
  course?: string;
  /** Last activity, for the day groups. */
  at?: string;
}

/** Phones: the pages' menu button opens the sidebar as a drawer (ShellMenuButton). */
const ShellMenu = createContext<{ open(): void; tip: boolean; upload(): void } | null>(null);

/** Phones inside a course: My courses and Upload at the top of the course's topics drawer, so one
 *  menu holds everything (tablets up have the rail and panel instead). */
export function ShellNavMini({ onNavigate }: { onNavigate?(): void }) {
  const link = "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[14.5px] text-white/80 transition hover:bg-white/10 hover:text-white";
  return (
    <div className="border-b border-white/10 px-2 pb-3 pt-3">
      <Link href="/dashboard" onClick={onNavigate} className={link}>
        <House size={18} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
        My courses
      </Link>
      {/* Upload removed (owner, 22 Nov 2026): the chat box's + covers it. menu.upload() still opens the dialog. */}
    </div>
  );
}

/** Inside a course: the course page tells the shared sidebar which course is open and fills the
 *  panel's lower part (its topics) through a portal into `slot`. The sidebar itself stays mounted, so
 *  going from the dashboard into a course never blanks the screen. */
const ShellCourseCtx = createContext<{
  setCourse(c: { id: string; title: string } | null): void;
  slot: HTMLElement | null;
  /** A slide is open beside the chat: on smaller laptops the panel tucks away until it closes. */
  setTucked(tucked: boolean): void;
} | null>(null);
export function useShellCourse() {
  return useContext(ShellCourseCtx);
}

export function ShellMenuButton({ className = "" }: { className?: string }) {
  const menu = useContext(ShellMenu);
  if (!menu) return null;
  return (
    <span className="relative md:hidden">
      <button type="button" onClick={menu.open} aria-label="Open menu" className={`grid h-10 w-10 place-items-center rounded-full text-ink transition hover:bg-sunken active:scale-90 ${className}`}>
        <Menu size={21} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
      </button>
      {menu.tip && (
        // One-time tip on phones (owner, 20 Nov 2026), like the course page tour.
        <span className="pop-in absolute left-0 top-12 z-40 w-64 rounded-2xl bg-navy p-4 text-left text-[14px] leading-snug text-white shadow-xl">
          <span className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 bg-navy" />
          Tap the menu for your <span className="font-semibold">recent chats</span>, feedback and your account.
        </span>
      )}
    </span>
  );
}

const TIP_KEY = "ays-menu-tip-seen";

const RAIL = 64;
const MIN_W = 200;
const MAX_W = 480; // owner, 21 Nov 2026: can be dragged much wider
const DEFAULT_W = 252;
const CLOSE_BELOW = 150; // dragging narrower than this closes the panel
const KEY = "ays:sidebar";

// The rail opens over the page on hover (to 224 px) and shows each icon's name (owner, 21 Nov 2026).
// Each row is an icon cell (the closed rail's width) plus a label that fades in while it is open.
const railCls = (active: boolean) =>
  `flex h-11 w-full items-center rounded-xl text-left transition active:scale-[0.98] ${active ? "bg-white/15 text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`;
const railLabel =
  "pointer-events-none whitespace-nowrap pr-3 text-[14.5px] opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-hover/rail:delay-100";

function RailButton({ label, active = false, href, onClick, icon: Icon }: { label: string; active?: boolean; href?: string; onClick?(): void; icon: LucideIcon }) {
  const inner = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center">
        <Icon size={20} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
      </span>
      <span className={railLabel}>{label}</span>
    </>
  );
  return href ? (
    <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={railCls(active)}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} className={railCls(active)}>
      {inner}
    </button>
  );
}

/** Recent chats from the rail: opens the full-height chat list beside it (recent-chats-panel.tsx). */
function RecentChats({ recent, open, setOpen }: { recent: ShellChat[]; open: boolean; setOpen(v: boolean | ((o: boolean) => boolean)): void }) {
  const close = useCallback(() => setOpen(false), [setOpen]);
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Recent chats" aria-expanded={open} className={railCls(open)}>
        <span className="grid h-11 w-11 shrink-0 place-items-center">
          <History size={20} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
        </span>
        <span className={railLabel}>Recent chats</span>
      </button>
      {/* Outside the rail (a portal): hovering the list mustn't widen the rail over it. */}
      {open &&
        createPortal(
          <Suspense fallback={null}>
            <RecentChatsPanel initial={recent} onClose={close} />
          </Suspense>,
          document.body,
        )}
    </>
  );
}

export function AppShell({
  page: pageProp,
  courses = [],
  railOnly = false,
  courseMenu,
  defaultCourseId,
  recent = [],
  user,
  onChangePartner,
  children,
}: {
  /** Which item is current; worked out from the address when left out (the shared layout). */
  page?: ShellPage;
  /** Kept for callers; the rail has no title. */
  title?: string;
  courses?: ShellCourse[];
  /** Only the rail, even inside a course. */
  railOnly?: boolean;
  /** Inside a course, passed directly (the course page normally uses useShellCourse). */
  courseMenu?: { title: string; body: ReactNode };
  /** Upload starts on this course. */
  defaultCourseId?: string;
  /** The student's latest chats, newest first. */
  recent?: ShellChat[];
  user: { email: string; displayName: string | null };
  onChangePartner?(): void;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const page: ShellPage = pageProp ?? (pathname.startsWith("/chat") ? "chat" : pathname.startsWith("/dashboard") ? "dashboard" : "account");
  const [uploading, setUploading] = useState(false);
  const [openCourse, setCourse] = useState<{ id: string; title: string } | null>(null);
  const [pinned, setPinned] = useState(true);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  // Smaller laptops: panel + chat + an open slide leave the chat too narrow, so the panel tucks away
  // (still a hover away) while a slide is open, and comes back when it closes.
  const [tucked, setTuckedState] = useState(false);
  const [untuck, setUntuck] = useState(false); // the student opened it anyway
  const setTucked = useCallback((v: boolean) => {
    setTuckedState(v);
    if (!v) setUntuck(false);
  }, []);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 89.99rem)"); // below 1440 px
    const sync = () => setNarrow(mq.matches);
    const t = setTimeout(sync, 0);
    mq.addEventListener("change", sync);
    return () => {
      clearTimeout(t);
      mq.removeEventListener("change", sync);
    };
  }, []);
  const courseCtx = useMemo(() => ({ setCourse, slot, setTucked }), [slot, setTucked]);
  // Only on a course's own page: leaving for the dashboard drops the panel at once, rather than when
  // the course page has finished unmounting (owner, 22 Nov 2026: it stayed wide until the page loaded).
  const inCourse = !!courseMenu || (!!openCourse && pathname.startsWith("/study"));
  const hasPanel = inCourse && !railOnly;
  const panelTitle = courseMenu?.title ?? openCourse?.title ?? "";
  const [feedback, setFeedback] = useState(false);
  const [drawer, setDrawer] = useState(false);
  // The chat list beside the rail; while it's open the rail stays narrow (no hover widening behind it).
  const [chatsOpen, setChatsOpen] = useState(false);
  // Phones: a one-time tip pointing at the menu button.
  const [tip, setTip] = useState(false);
  useEffect(() => {
    let seen = true;
    try {
      seen = !!localStorage.getItem(`${TIP_KEY}:${user.email.toLowerCase()}`);
    } catch {}
    if (seen || !window.matchMedia("(max-width: 47.98rem)").matches) return;
    // Quickly (owner, 22 Nov 2026: students may tap a course within seconds); the partner hint follows at 4 s.
    const t = setTimeout(() => setTip(true), 1500);
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
  const openDrawer = () => {
    setTip(false);
    try {
      localStorage.setItem(`${TIP_KEY}:${user.email.toLowerCase()}`, "1");
    } catch {}
    setDrawer(true);
  };
  const [width, setWidth] = useState(DEFAULT_W);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; w: number } | null>(null);

  // Only the width is remembered (owner, 21 Nov 2026): the panel is the course's table of contents,
  // so it opens every time a course opens; closing it lasts until the student leaves that course.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { width?: number } | null;
      if (typeof saved?.width === "number") {
        const w = Math.min(MAX_W, Math.max(MIN_W, saved.width));
        const id = setTimeout(() => setWidth(w), 0);
        return () => clearTimeout(id);
      }
    } catch {}
  }, []);
  const remember = useCallback((next: { width: number }) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);
  const courseKey = courseMenu ? "menu" : (openCourse?.id ?? null);
  useEffect(() => {
    if (!courseKey) return;
    const id = setTimeout(() => setPinned(true), 0);
    return () => clearTimeout(id);
  }, [courseKey]);
  const autoTucked = tucked && narrow && !untuck;
  const open = pinned && !autoTucked;
  const togglePin = () => {
    if (open) {
      setPinned(false);
    } else {
      setPinned(true);
      if (autoTucked) setUntuck(true);
    }
  };

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (!open) return;
    start.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const w = start.current.w + e.clientX - start.current.x;
    // Dragged far enough left: it closes there and then, without letting go (owner, 21 Nov 2026).
    if (w < CLOSE_BELOW) {
      const before = start.current.w;
      start.current = null;
      setDragging(false);
      setPinned(false);
      setWidth(before);
      return;
    }
    setWidth(Math.min(MAX_W, w));
  }
  function onDragEnd() {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    const w = Math.max(MIN_W, width);
    setWidth(w);
    remember({ width: w });
  }

  const shown = hasPanel && open;
  const panelW = Math.max(MIN_W, width);
  const rowCls = "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[14.5px] text-white/75 transition hover:bg-white/8 hover:text-white";
  return (
    <div className="min-h-dvh bg-page" style={{ ["--shell-pad" as string]: `${RAIL + (hasPanel ? (open ? panelW : 52) : 0)}px` }}>
      <aside className="fixed inset-y-0 left-0 z-40 hidden md:flex" aria-label="Main">
        {/* Rail: a 64 px slot; the rail itself sits over the page and the course panel, and opens
            on hover (after a short pause, so passing the pointer over it doesn't flash it open). */}
        <div className="relative w-16 shrink-0">
          <div
            data-laptop-tour="rail"
            className={`absolute inset-y-0 left-0 z-[60] flex w-16 flex-col gap-1.5 bg-pau-900 px-2.5 py-4 transition-[width,box-shadow] delay-0 duration-200 ease-out ${chatsOpen ? "" : "group/rail hover:w-56 hover:shadow-2xl hover:delay-150"}`}
          >
            <Link href="/" aria-label="Ask Your Slides home" className="mb-2 flex h-11 w-full items-center">
              <span className="grid h-11 w-11 shrink-0 place-items-center">
                <LogoMark size={26} light />
              </span>
              <span className={`${railLabel} font-heading text-[16px] text-white`}>Ask Your Slides</span>
            </Link>
            <RailButton label="Dashboard" href="/dashboard" active={page === "dashboard"} icon={House} />
            {/* Ask anything (owner, 22 Nov 2026): a question opens in the right course's chat. */}
            {ASK_ANYTHING_ON && <RailButton label="Ask anything" href="/chat" active={page === "chat"} icon={MessageCircle} />}
            <RecentChats recent={recent} open={chatsOpen} setOpen={setChatsOpen} />
            <div className="mt-auto flex flex-col gap-3">
              {/* Feedback (owner, 20 Nov 2026), just above the account. */}
              <RailButton label="Give us feedback" onClick={() => setFeedback(true)} icon={PencilLine} />
              {/* Just the account icon, no name (owner, 21 Nov 2026). */}
              <span className="grid h-11 w-11 shrink-0 place-items-center">
                <AccountMenu user={user} onChangePartner={onChangePartner} side menuClassName="bottom-0 left-[220px]" />
              </span>
            </div>
          </div>
        </div>

        {/* The course panel, beside the page when open */}
        {shown && (
          <div
            className="relative flex h-full flex-col border-r border-white/10 bg-navy pb-4 pt-[18px] text-white"
            style={{ width: panelW }}
          >
            <p className="truncate pb-4 pl-5 pr-14 text-[15px] font-medium leading-9" title={panelTitle}>
              {panelTitle}
            </p>
            {/* Upload button removed (owner, 22 Nov 2026): the chat box's + covers it. */}
            {courseMenu ? (
              <div className="mt-3 min-h-0 flex-1 overflow-hidden border-t border-white/10">{courseMenu.body}</div>
            ) : (
              <div ref={setSlot} className="mt-3 min-h-0 flex-1 overflow-hidden border-t border-white/10" />
            )}
            {/* Drag the right edge to resize; far enough left closes the panel. */}
            {open && (
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
        {/* The panel's button, beside its title: always here in a course, open or closed. Click only
            (owner, 22 Nov 2026: hover-to-peek vanished on the way down to a lecture): opens or closes it. */}
        {hasPanel && (
          <div className="group absolute top-[18px] z-50" style={{ left: shown ? RAIL + panelW - 46 : RAIL + 10 }}>
            <button
              type="button"
              onClick={togglePin}
              aria-label={open ? "Close sidebar" : "Open sidebar"}
              aria-pressed={open}
              className={`grid h-9 w-9 place-items-center rounded-lg transition active:scale-90 ${shown ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-ink hover:bg-sunken"}`}
            >
              <PanelLeft size={19} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
            </button>
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] text-white opacity-0 shadow-lg ring-1 ring-white/15 transition-opacity delay-200 group-hover:opacity-100">
              {open ? "Close sidebar" : "Open sidebar"}
            </span>
          </div>
        )}
      </aside>
      {/* Phones: the same items as a drawer from the left (pages outside a course). */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/40" />
          <div className="slide-in-left absolute inset-y-0 left-0 flex w-[84%] max-w-[320px] flex-col bg-navy pb-4 pt-[18px] text-white shadow-2xl" onClick={(e) => (e.target as HTMLElement).closest("a") && setDrawer(false)}>
            <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-[18px] grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10">
              <X size={19} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
            </button>
            <nav className="mt-12 flex flex-col gap-0.5 px-2" aria-label="Pages">
              <Link href="/dashboard" aria-current={page === "dashboard" ? "page" : undefined} className={`${rowCls} ${page === "dashboard" ? "bg-white/12 text-white" : ""}`}>
                <House size={18} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
                Dashboard
              </Link>
              {ASK_ANYTHING_ON && (
                <Link href="/chat" aria-current={page === "chat" ? "page" : undefined} className={`${rowCls} ${page === "chat" ? "bg-white/12 text-white" : ""}`}>
                  <MessageCircle size={18} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
                  Ask anything
                </Link>
              )}
            </nav>
            <p className="px-5 pb-1 pt-5 text-[12.5px] font-medium uppercase tracking-wide text-white/45">Recent chats</p>
            {recent.length === 0 ? (
              <p className="px-5 text-[13px] text-white/50">No chats yet.</p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto px-2">
                {recent.map((c) => (
                  <li key={c.id}>
                    <HoverLink href={c.href} title={c.title} className={`${rowCls} text-[14px]`}>
                      <span className="truncate">{c.title}</span>
                    </HoverLink>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto">
              <button
                type="button"
                onClick={() => {
                  setDrawer(false);
                  setFeedback(true);
                }}
                className={`mx-2 mt-2 ${rowCls} w-[calc(100%-1rem)]`}
              >
                <PencilLine size={18} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
                Give us feedback
              </button>
              <div className="mt-2 flex items-center gap-3 border-t border-white/10 px-5 pt-4">
                <AccountMenu user={user} onChangePartner={onChangePartner} side />
              </div>
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
