"use client";

import Link from "next/link";
import type { ChatItem, CourseItem, TopicItem } from "@/lib/study/types";
import { courseDot, displayCode } from "@/lib/study/format";

interface Props {
  courses: CourseItem[];
  course: CourseItem;
  topics: TopicItem[];
  chats: ChatItem[];
  topicId: string | null;
  chatId: string | null;
  user: { email: string; displayName: string | null };
  onOpenScope(topicId: string | null): void;
  onOpenChat(chat: ChatItem): void;
}

export function Sidebar({ courses, course, topics, chats, topicId, chatId, user, onOpenScope, onOpenChat }: Props) {
  const scopeChats = chats.filter((c) => c.topic_id === topicId);
  const scopes: { id: string | null; label: string }[] = [{ id: null, label: "Whole course" }, ...topics.map((t) => ({ id: t.id, label: t.title }))];

  return (
    <nav className="flex h-full flex-col" aria-label="Courses and chats">
      <div className="flex h-14 shrink-0 items-center border-b border-neutral-200 px-4 dark:border-neutral-800">
        <span className="text-sm font-semibold tracking-tight">PAU Study Assistant</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Courses</p>
        <ul className="space-y-0.5">
          {courses.map((c) => {
            const selected = c.id === course.id;
            return (
              <li key={c.id}>
                <Link
                  href={`/study/${c.code}`}
                  aria-current={selected ? "page" : undefined}
                  className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${
                    selected ? "bg-white font-medium shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${courseDot(c.sort_order)}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="block">{displayCode(c.code)}</span>
                    <span className="block truncate text-xs font-normal text-neutral-500 dark:text-neutral-400">{c.title}</span>
                  </span>
                </Link>

                {selected && (
                  <ul className="mb-2 ml-4 mt-1 space-y-0.5 border-l border-neutral-200 pl-2 dark:border-neutral-700">
                    {scopes.map((s) => {
                      const active = s.id === topicId;
                      return (
                        <li key={s.id ?? "course"}>
                          <button
                            onClick={() => onOpenScope(s.id)}
                            className={`w-full truncate rounded-md px-2 py-1 text-left text-[13px] ${
                              active ? "bg-neutral-200/70 font-medium dark:bg-neutral-700" : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            }`}
                            title={s.label}
                          >
                            {s.label}
                          </button>
                          {active && (
                            <ul className="my-1 ml-2 space-y-0.5">
                              <li>
                                <button
                                  onClick={() => onOpenScope(s.id)}
                                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                                >
                                  <span aria-hidden className="text-base leading-none">+</span> New chat
                                </button>
                              </li>
                              {scopeChats.map((c) => (
                                <li key={c.id}>
                                  <button
                                    onClick={() => onOpenChat(c)}
                                    aria-current={c.id === chatId ? "true" : undefined}
                                    className={`w-full truncate rounded-md px-2 py-1 text-left text-[13px] ${
                                      c.id === chatId ? "bg-white shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                                    }`}
                                    title={c.title}
                                  >
                                    {c.title}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-neutral-200 px-4 py-3 text-xs dark:border-neutral-800">
        <span className="min-w-0 truncate text-neutral-600 dark:text-neutral-400" title={user.email}>
          {user.displayName ?? user.email}
        </span>
        <form action="/api/auth/sign-out" method="post">
          <button className="shrink-0 text-neutral-600 underline-offset-2 hover:underline dark:text-neutral-400">Sign out</button>
        </form>
      </div>
    </nav>
  );
}
