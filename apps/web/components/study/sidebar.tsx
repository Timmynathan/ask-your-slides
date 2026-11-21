"use client";

// Left panel inside a course: "Topics". Whole course first, then the course's topics in order (from
// the course session manifest; empty topics are hidden upstream). The selected scope folds open to show its
// chats. Other courses aren't listed here: the logo goes back to My courses. Minimal: text rows, no
// badges or counts. Navy panel with white text; the selected scope is a white pill.
import type { ChatItem, TopicItem, WorkspaceData } from "@/lib/study/types";
import { BookOpen, Library } from "lucide-react";
import { PastBox } from "./past-box";

interface Props {
  topics: TopicItem[]; // this course's topics
  chats: ChatItem[]; // this course's chats, newest first
  topicId: string | null;
  chatId: string | null;
  onOpenScope(topicId: string | null): void; // opens a new chat in that scope
  onOpenChat(chat: ChatItem): void;
  /** The Past questions view is open (PRD F10). */
  pastActive: boolean;
  /** This course's past questions, or null before launch (lib/past/feature.ts). */
  past: WorkspaceData["past"] | null;
  onOpenPast(paperId: string | null): void; // null = the Exam map / all questions
}

export function Sidebar({ topics, chats, topicId, chatId, onOpenScope, onOpenChat, pastActive, past, onOpenPast }: Props) {
  const scopes: { id: string | null; label: string }[] = [
    { id: null, label: "Whole course" },
    ...topics.map((t) => ({ id: t.id, label: t.title })),
  ];
  const scopeItem = (sc: { id: string | null; label: string }) => {
    const active = !pastActive && sc.id === topicId;
    const scopeChats = active ? chats.filter((ch) => ch.topic_id === sc.id) : [];
    return (
      <li key={sc.id ?? "course"}>
        <button
          onClick={() => onOpenScope(sc.id)}
          aria-current={active ? "location" : undefined}
          className={`flex w-full items-start gap-2.5 rounded-2xl px-3 py-2.5 text-left text-[12px] leading-snug transition-colors ${
            active ? "bg-white font-medium text-[#0e1664]" : "text-white/85 hover:bg-white/10 hover:text-white"
          }`}
          title={sc.label}
        >
          {/* A book for each lecture, a library for the whole course (owner, 21 Nov 2026). */}
          {sc.id === null ? (
            <Library size={14} absoluteStrokeWidth strokeWidth={1.5} className="mt-px shrink-0" aria-hidden />
          ) : (
            <BookOpen size={14} absoluteStrokeWidth strokeWidth={1.5} className="mt-px shrink-0" aria-hidden />
          )}
          <span className="line-clamp-2 min-w-0">{sc.label}</span>
        </button>
        {active && scopeChats.length > 0 && (
          <ul className="list-in mb-1 mt-0.5 space-y-0.5 pl-3">
            {scopeChats.map((ch) => (
              <li key={ch.id}>
                <button
                  onClick={() => onOpenChat(ch)}
                  aria-current={ch.id === chatId ? "true" : undefined}
                  className={`w-full truncate rounded-xl px-3 py-1.5 text-left text-[12px] ${ch.id === chatId ? "text-white" : "text-white/60 hover:text-white"}`}
                  title={ch.title}
                >
                  <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${ch.id === chatId ? "bg-[#5ea3ed]" : "bg-white/30"}`} aria-hidden />
                  {ch.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };
  return (
    <nav className="flex h-full flex-col" aria-label="Topics and chats">
      {/* Past questions first: real PAU papers by year (replaced "Search the web", owner 14 Nov 2026). */}
      {past && (
        <div className="shrink-0 px-3 pt-2">
          <PastBox papers={past.papers} total={past.total} active={pastActive} onOpenPaper={onOpenPast} onOpenMap={() => onOpenPast(null)} />
        </div>
      )}

      {/* Whole course on its own, above the lectures (owner, 21 Nov 2026): it isn't a lecture. One
          scrolling list holds both. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
        <ul>{scopes.slice(0, 1).map(scopeItem)}</ul>
        <div className="flex items-center justify-between pb-1 pl-2 pt-4">
          <h2 className="text-[13px] text-white/60">Lectures</h2>
          <button
            onClick={() => onOpenScope(topicId)}
            aria-label="New chat"
            title="New chat"
            className="grid h-8 w-8 place-items-center rounded-full text-white transition hover:bg-white/10 active:scale-90"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <ul className="space-y-0.5">{scopes.slice(1).map(scopeItem)}</ul>
      </div>
    </nav>
  );
}
