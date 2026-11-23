"use client";

// Recent chats as a full-height panel beside the rail, like ChatGPT's or Claude's chat list (owner,
// 23 Nov 2026; was a small pop-out of six). Grouped by day, searchable, each chat with its course.
// Opens with the list the page loaded, then swaps in a fresh one (a chat started since is there).
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { HoverLink } from "@/components/ui/hover-link";
import type { ShellChat } from "./app-shell";

const icon = { absoluteStrokeWidth: true, strokeWidth: 1.5 } as const;

/** Today, Yesterday, Previous 7 days, Previous 30 days, then by month ("October 2026"). */
export function dayGroup(at: string | undefined, now = new Date()): string {
  if (!at) return "Older";
  const d = new Date(at);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function RecentChatsPanel({ initial, onClose }: { initial: ShellChat[]; onClose(): void }) {
  const [chats, setChats] = useState(initial);
  const [query, setQuery] = useState("");
  const current = useSearchParams().get("chat");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/conversations/recent", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { recent?: ShellChat[] } | null) => !cancelled && body?.recent && setChats(body.recent))
      .catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { label: string; items: ShellChat[] }[] = [];
    for (const c of chats) {
      if (q && !`${c.title} ${c.course ?? ""}`.toLowerCase().includes(q)) continue;
      const label = dayGroup(c.at);
      const g = out.at(-1);
      if (g?.label === label) g.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [chats, query]);

  return (
    <>
      {/* Click anywhere else to close. */}
      <button type="button" aria-label="Close recent chats" tabIndex={-1} onClick={onClose} className="fixed inset-0 left-16 z-[54] cursor-default bg-black/25" />
      <div
        role="dialog"
        aria-label="Recent chats"
        className="slide-in-left fixed inset-y-0 left-16 z-[55] flex w-[300px] flex-col border-r border-white/10 bg-navy text-white shadow-2xl"
      >
        <div className="flex items-center justify-between pb-3 pl-5 pr-3 pt-[18px]">
          <h2 className="text-[15px] font-medium leading-9">Recent chats</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white">
            <X size={19} {...icon} aria-hidden />
          </button>
        </div>
        <label className="mx-3 flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 text-white/60 focus-within:bg-white/12 focus-within:text-white/80">
          <Search size={16} {...icon} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/45"
          />
        </label>
        <nav className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Chats">
          {chats.length === 0 ? (
            <p className="px-3 pt-4 text-[13.5px] text-white/55">No chats yet. Open a course and ask your first question.</p>
          ) : groups.length === 0 ? (
            <p className="px-3 pt-4 text-[13.5px] text-white/55">No chats match &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            groups.map((g) => (
              <section key={g.label} className="mt-3 first:mt-1">
                <h3 className="px-3 pb-1 text-[12px] font-medium text-white/45">{g.label}</h3>
                <ul>
                  {g.items.map((c) => {
                    const active = c.id === current;
                    return (
                      <li key={c.id}>
                        <HoverLink
                          href={c.href}
                          onClick={onClose}
                          title={c.course ? `${c.title} · ${c.course}` : c.title}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-baseline gap-2 rounded-xl px-3 py-2 text-[14px] transition ${active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/8 hover:text-white"}`}
                        >
                          <span className="min-w-0 flex-1 truncate">{c.title}</span>
                          {c.course && <span className="max-w-[40%] shrink-0 truncate text-[11.5px] text-white/45">{c.course}</span>}
                        </HoverLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </nav>
      </div>
    </>
  );
}
