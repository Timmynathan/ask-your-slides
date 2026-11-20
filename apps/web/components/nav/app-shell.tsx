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
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { AccountMenu } from "@/components/ui/account-menu";
import { UploadDialog } from "./upload-dialog";

export type ShellPage = "dashboard" | "chat" | "past";
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
  page,
  title,
  courses,
  recent = [],
  files = [],
  user,
  onSearch,
  onUpload,
  onChangePartner,
  chatReady = false,
  children,
}: {
  page: ShellPage;
  /** The student's programme, e.g. "Computer Science" (lib/programmes sidebarTitle). */
  title: string;
  courses: ShellCourse[];
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
  /** The general chat is built (step 2 of the owner's plan); until then it shows "Soon". */
  chatReady?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
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

  const shown = pinned || peek;
  const panelW = Math.max(MIN_W, width);
  return (
    <div className="min-h-dvh bg-page" style={{ ["--shell-pad" as string]: `${RAIL + (pinned ? panelW : 52)}px` }}>
      {/* Leaving the whole sidebar (rail and panel) ends a hover peek. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden md:flex" aria-label="Main" onMouseLeave={() => setPeek(false)}>
        {/* Rail */}
        <div className="flex w-16 flex-col items-center gap-1.5 bg-pau-900 py-4">
          <Link href="/dashboard" aria-label="My courses" title="My courses" className="mb-2 grid h-11 w-11 place-items-center">
            <LogoMark size={26} light />
          </Link>
          {onSearch ? (
            <RailButton label="Search courses" onClick={onSearch}>
              {ICONS.search}
            </RailButton>
          ) : (
            <RailButton label="Search courses" href="/dashboard">
              {ICONS.search}
            </RailButton>
          )}
          {chatReady && (
            <RailButton label="Chat" href="/chat" active={page === "chat"}>
              {ICONS.chat}
            </RailButton>
          )}
          <RailButton label="Past questions" href="/past-questions" active={page === "past"}>
            {ICONS.past}
          </RailButton>
          <div className="mt-auto">
            <AccountMenu user={user} onChangePartner={onChangePartner} side />
          </div>
        </div>

        {/* Panel: beside the page when pinned, over it while peeking */}
        {shown && (
          <div
            className={`relative flex h-full flex-col border-r border-white/10 bg-navy pb-4 pt-[18px] text-white ${pinned ? "" : "slide-in-left shadow-2xl"}`}
            style={{ width: panelW }}
          >
            <p className="truncate pb-4 pl-5 pr-14 text-[15px] font-medium leading-9" title={title}>
              {title}
            </p>
            <nav className="flex flex-col gap-0.5 px-2" aria-label="Pages">
              <NavItem label="Dashboard" href="/dashboard" active={page === "dashboard"} icon={ICONS.home} />
              <NavItem label="Chat" href="/chat" active={page === "chat"} icon={ICONS.chat} soon={!chatReady} />
              <NavItem label="Past questions" href="/past-questions" active={page === "past"} icon={ICONS.past} />
            </nav>
            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={() => setUploading(true)}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-white/12 py-2 text-[14px] font-medium text-white transition hover:bg-white/20 active:scale-[0.98]"
              >
                <Icon size={17}>{ICONS.upload}</Icon>
                Upload
              </button>
            </div>
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
                <p className="text-[13px] leading-snug text-white/50">Nothing uploaded yet. Photos of tests or notes you upload will appear here.</p>
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
                            ? "Couldn't read it: delete and try again"
                            : "Reading your pages…"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(f)}
                      aria-label={`Delete ${f.title}`}
                      title="Delete"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/50 opacity-0 transition hover:bg-white/10 hover:text-white focus:opacity-100 group-hover:opacity-100"
                    >
                      <Icon size={15}>
                        <path d="M6 6l12 12M18 6 6 18" />
                      </Icon>
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
      </aside>
      {uploading && <UploadDialog courses={courses} onClose={() => setUploading(false)} onDone={() => router.refresh()} />}
      <div className={`md:pl-[var(--shell-pad)] ${dragging ? "" : "md:transition-[padding] md:duration-200"}`}>{children}</div>
    </div>
  );
}
