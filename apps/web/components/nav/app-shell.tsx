"use client";

// The app's sidebar (owner, 20 Nov 2026), shared by the dashboard, Past questions and Chat, from
// tablets up (phones keep each page's own top bar). A dark navy rail (logo, search, chat, past
// questions, open/close, account) beside a panel that is open by default: Dashboard, Chat, Past
// questions, Upload, and the student's courses. The panel can be closed with its button, or dragged
// narrower by its right edge; dragging it far enough closes it. Width and open/closed are remembered
// in this browser.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { AccountMenu } from "@/components/ui/account-menu";

export type ShellPage = "dashboard" | "chat" | "past";
export interface ShellCourse {
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

function RailButton({ label, active = false, href, onClick, children }: { label: string; active?: boolean; href?: string; onClick?(): void; children: ReactNode }) {
  const cls = `grid h-11 w-11 place-items-center rounded-xl transition active:scale-90 ${active ? "bg-white/15 text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`;
  return href ? (
    <Link href={href} aria-label={label} title={label} className={cls}>
      <Icon>{children}</Icon>
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cls}>
      <Icon>{children}</Icon>
    </button>
  );
}

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
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[14.5px] transition ${active ? "bg-white/12 text-white" : "text-white/75 hover:bg-white/8 hover:text-white"}`}
    >
      <Icon size={18}>{icon}</Icon>
      <span className="flex-1 truncate">{label}</span>
    </Link>
  );
}

export function AppShell({
  page,
  courses,
  user,
  onSearch,
  onUpload,
  onChangePartner,
  chatReady = false,
  children,
}: {
  page: ShellPage;
  courses: ShellCourse[];
  user: { email: string; displayName: string | null };
  /** Search button: the page's own search (dashboard), else it opens the dashboard. */
  onSearch?(): void;
  onUpload(): void;
  onChangePartner?(): void;
  /** The general chat is built (step 2 of the owner's plan); until then it shows "Soon". */
  chatReady?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
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
          if (saved.open === false) setOpen(false);
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
  const toggle = () => {
    setOpen((o) => {
      remember({ open: !o, width });
      return !o;
    });
  };

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
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
      setOpen(false);
      setWidth(DEFAULT_W);
      remember({ open: false, width: DEFAULT_W });
    } else {
      const w = Math.max(MIN_W, width);
      setWidth(w);
      remember({ open: true, width: w });
    }
  }

  const panelW = open ? Math.max(MIN_W, width) : 0;
  return (
    <div className="min-h-dvh bg-page" style={{ ["--shell-pad" as string]: `${RAIL + (open ? panelW + 8 : 0)}px` }}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden md:flex" aria-label="Main">
        {/* Rail */}
        <div className="flex w-16 flex-col items-center gap-2 bg-pau-900 py-4">
          <Link href="/dashboard" aria-label="My courses" title="My courses" className="mb-3 grid h-11 w-11 place-items-center rounded-xl transition hover:bg-white/10">
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
          <div className="mt-auto flex flex-col items-center gap-3">
            <RailButton label={open ? "Close sidebar" : "Open sidebar"} onClick={toggle}>
              {ICONS.panel}
            </RailButton>
            <AccountMenu user={user} onChangePartner={onChangePartner} side />
          </div>
        </div>

        {/* Panel */}
        {open && (
          <div className="relative my-2 flex flex-col rounded-2xl bg-navy py-3 text-white" style={{ width: panelW }}>
            <div className="flex items-center gap-2 px-4 pb-3">
              <span className="flex-1 truncate text-[15px] font-medium">Ask Your Slides</span>
              <button type="button" onClick={toggle} aria-label="Close sidebar" title="Close sidebar" className="grid h-8 w-8 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white">
                <Icon size={18}>{ICONS.panel}</Icon>
              </button>
            </div>
            <nav className="flex flex-col gap-0.5 px-2" aria-label="Pages">
              <NavItem label="Dashboard" href="/dashboard" active={page === "dashboard"} icon={ICONS.home} />
              <NavItem label="Chat" href="/chat" active={page === "chat"} icon={ICONS.chat} soon={!chatReady} />
              <NavItem label="Past questions" href="/past-questions" active={page === "past"} icon={ICONS.past} />
            </nav>
            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={onUpload}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-white/12 py-2 text-[14px] font-medium text-white transition hover:bg-white/20 active:scale-[0.98]"
              >
                <Icon size={17}>{ICONS.upload}</Icon>
                Upload
              </button>
            </div>
            <p className="px-5 pb-1 pt-5 text-[12.5px] font-medium uppercase tracking-wide text-white/55">Courses</p>
            <ul className="min-h-0 flex-1 overflow-y-auto px-2 [scrollbar-width:thin]">
              {courses.map((c) => (
                <li key={c.id}>
                  <Link href={c.href} title={c.title} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-white/75 transition hover:bg-white/8 hover:text-white">
                    <span className="shrink-0 text-white/55">
                      <Icon size={16}>{ICONS.book}</Icon>
                    </span>
                    <span className="truncate">{c.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Drag the right edge to resize; far enough left closes the panel. */}
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
          </div>
        )}
      </aside>
      <div className={`md:pl-[var(--shell-pad)] ${dragging ? "" : "md:transition-[padding] md:duration-200"}`}>{children}</div>
    </div>
  );
}
