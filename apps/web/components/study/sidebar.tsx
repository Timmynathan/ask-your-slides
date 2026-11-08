"use client";

// Left panel inside a course: "Topics". Whole course first, then the course's topics in order (from
// data/manifest.yaml; empty topics are hidden upstream). The selected scope folds open to show its
// chats. Other courses aren't listed here: the logo and "All courses" go back to My courses.
import Link from "next/link";
import type { ChatItem, TopicItem } from "@/lib/study/types";
import { WebSearchBox } from "./web-search-box";

interface Props {
  topics: TopicItem[]; // this course's topics
  chats: ChatItem[]; // this course's chats, newest first
  topicId: string | null;
  chatId: string | null;
  onOpenScope(topicId: string | null): void; // opens a new chat in that scope
  onOpenChat(chat: ChatItem): void;
  courseLabel: string; // "CSC 420 Data Management II", for the web search box
}

export function Sidebar({ topics, chats, topicId, chatId, onOpenScope, onOpenChat, courseLabel }: Props) {
  const scopes: { id: string | null; label: string; order: number | null }[] = [
    { id: null, label: "Whole course", order: null },
    ...topics.map((t) => ({ id: t.id, label: t.title, order: t.order })),
  ];
  return (
    <nav className="flex h-full flex-col" aria-label="Topics and chats">
      {/* Kept apart from the slide chat: anything beyond the course goes to the student's own chatbot. */}
      <div className="shrink-0 px-3 pt-3">
        <WebSearchBox courseLabel={courseLabel} topicTitle={topics.find((t) => t.id === topicId)?.title ?? null} />
      </div>
      <div className="flex h-12 shrink-0 items-center justify-between px-5 pt-1">
        <h2 className="text-[16px] font-medium text-ink">Topics</h2>
        <span className="text-xs text-muted">{topics.length}</span>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <button
          onClick={() => onOpenScope(topicId)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-sunken px-4 py-2.5 text-[15px] text-ink transition hover:bg-pau-50 active:scale-[0.98]"
        >
          <span aria-hidden className="text-lg leading-none">+</span> New chat
        </button>
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {scopes.map((s) => {
          const active = s.id === topicId;
          const scopeChats = active ? chats.filter((ch) => ch.topic_id === s.id) : [];
          return (
            <li key={s.id ?? "course"}>
              <button
                onClick={() => onOpenScope(s.id)}
                aria-current={active ? "location" : undefined}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] leading-snug transition-colors ${
                  active ? "bg-pau-50 font-medium text-ink ring-1 ring-pau-100" : "text-ink hover:bg-sunken"
                }`}
                title={s.label}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-semibold ${
                    active ? "bg-brand text-white" : "bg-sunken text-muted"
                  }`}
                >
                  {s.order ?? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M1 1h4v4H1zM7 1h4v4H7zM1 7h4v4H1zM7 7h4v4H7z" />
                    </svg>
                  )}
                </span>
                <span className="line-clamp-2 min-w-0">{s.label}</span>
              </button>
              {active && scopeChats.length > 0 && (
                <ul className="list-in my-1 ml-6 space-y-0.5 border-l border-line pl-3">
                  {scopeChats.map((ch) => (
                    <li key={ch.id}>
                      <button
                        onClick={() => onOpenChat(ch)}
                        aria-current={ch.id === chatId ? "true" : undefined}
                        className={`flex w-full items-center gap-2 truncate rounded-lg px-2 py-1.5 text-left text-sm ${
                          ch.id === chatId ? "bg-card font-medium text-ink shadow-sm ring-1 ring-line" : "text-muted hover:bg-sunken hover:text-ink"
                        }`}
                        title={ch.title}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="shrink-0">
                          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" strokeLinejoin="round" />
                        </svg>
                        <span className="truncate">{ch.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="shrink-0 border-t border-line px-3 py-2.5">
        <Link href="/dashboard" className="flex items-center gap-2 rounded-full px-3 py-2 text-sm text-muted transition hover:bg-sunken hover:text-ink">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M13 8H3M7 4 3 8l4 4" />
          </svg>
          All courses
        </Link>
      </div>
    </nav>
  );
}
