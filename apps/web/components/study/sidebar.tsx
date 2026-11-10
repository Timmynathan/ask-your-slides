"use client";

// Left panel inside a course: "Topics". Whole course first, then the course's topics in order (from
// the course session manifest; empty topics are hidden upstream). The selected scope folds open to show its
// chats. Other courses aren't listed here: the logo goes back to My courses. Minimal: text rows, no
// badges or counts. Navy panel with white text; the selected scope is a white pill.
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
  /** Past questions (PRD F10) to practise in this course; the entry is hidden when 0. */
  pastCount: number;
  pastActive: boolean;
  onOpenPast(): void;
}

export function Sidebar({ topics, chats, topicId, chatId, onOpenScope, onOpenChat, courseLabel, pastCount, pastActive, onOpenPast }: Props) {
  const scopes: { id: string | null; label: string }[] = [
    { id: null, label: "Whole course" },
    ...topics.map((t) => ({ id: t.id, label: t.title })),
  ];
  return (
    <nav className="flex h-full flex-col" aria-label="Topics and chats">
      {/* Kept apart from the slide chat: anything beyond the course goes to the student's own chatbot. */}
      <div className="shrink-0 px-3 pt-3">
        <WebSearchBox courseLabel={courseLabel} topicTitle={topics.find((t) => t.id === topicId)?.title ?? null} />
      </div>

      <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-5">
        <h2 className="text-[13px] text-white/60">Topics</h2>
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

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {scopes.map((s) => {
          const active = !pastActive && s.id === topicId;
          const scopeChats = active ? chats.filter((ch) => ch.topic_id === s.id) : [];
          return (
            <li key={s.id ?? "course"}>
              <button
                onClick={() => onOpenScope(s.id)}
                aria-current={active ? "location" : undefined}
                className={`w-full rounded-2xl px-3 py-2.5 text-left text-[15px] leading-snug transition-colors ${
                  active ? "bg-white font-medium text-[#0e1664]" : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
                title={s.label}
              >
                <span className="line-clamp-2">{s.label}</span>
              </button>
              {active && scopeChats.length > 0 && (
                <ul className="list-in mb-1 mt-0.5 space-y-0.5 pl-3">
                  {scopeChats.map((ch) => (
                    <li key={ch.id}>
                      <button
                        onClick={() => onOpenChat(ch)}
                        aria-current={ch.id === chatId ? "true" : undefined}
                        className={`w-full truncate rounded-xl px-3 py-1.5 text-left text-[13.5px] ${
                          ch.id === chatId ? "text-white" : "text-white/60 hover:text-white"
                        }`}
                        title={ch.title}
                      >
                        <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${ch.id === chatId ? "bg-[#5ea3ed]" : "bg-white/30"}`} aria-hidden />
                        {ch.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {s.id === null && pastCount > 0 && (
                <button
                  onClick={onOpenPast}
                  aria-current={pastActive ? "location" : undefined}
                  className={`mt-0.5 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-[15px] leading-snug transition-colors ${
                    pastActive ? "bg-white font-medium text-[#0e1664]" : "text-white/85 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M7 3.5h7l4 4V20.5H7z" />
                    <path d="M14 3.5v4h4M10 12.5l1.5 1.5 3-3M10 17h5" />
                  </svg>
                  Past questions
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
