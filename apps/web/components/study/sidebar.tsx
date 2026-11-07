"use client";

import { SignOutButton } from "@/components/ui/sign-out-button";
import type { ChatItem, CourseItem, TopicItem } from "@/lib/study/types";
import { courseDot, displayCode } from "@/lib/study/format";

interface Props {
  courses: CourseItem[];
  topics: TopicItem[]; // all courses
  chats: ChatItem[]; // all courses
  courseId: string;
  topicId: string | null;
  chatId: string | null;
  user: { email: string; displayName: string | null };
  onOpenCourse(courseId: string): void;
  onOpenScope(topicId: string | null): void;
  onOpenChat(chat: ChatItem): void;
}

export function Sidebar({ courses, topics, chats, courseId, topicId, chatId, user, onOpenCourse, onOpenScope, onOpenChat }: Props) {
  return (
    <nav className="flex h-full flex-col" aria-label="Courses and chats">
      <div className="flex h-14 shrink-0 items-center border-b border-neutral-200 px-4 dark:border-neutral-800">
        <span className="text-sm font-semibold tracking-tight">PAU Study Assistant</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Courses</p>
        <ul className="space-y-0.5">
          {courses.map((c) => {
            const selected = c.id === courseId;
            const courseTopics = topics.filter((t) => t.course_id === c.id);
            const scopes: { id: string | null; label: string }[] = [
              { id: null, label: "Whole course" },
              ...courseTopics.map((t) => ({ id: t.id, label: t.title })),
            ];
            return (
              <li key={c.id}>
                <button
                  onClick={() => !selected && onOpenCourse(c.id)}
                  aria-current={selected ? "page" : undefined}
                  aria-expanded={selected}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-[background-color,box-shadow] duration-200 ${
                    selected ? "bg-white font-medium shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full transition-transform duration-200 ${courseDot(c.sort_order)} ${selected ? "scale-125" : ""}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="block">{displayCode(c.code)}</span>
                    <span className="block truncate text-xs font-normal text-neutral-500 dark:text-neutral-400">{c.title}</span>
                  </span>
                </button>

                {/* Always rendered; folds open/closed (grid rows 0fr ↔ 1fr) so switching courses animates. */}
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                    selected ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                  inert={!selected}
                >
                  <div className="overflow-hidden">
                    <ul className="mb-2 ml-4 mt-1 space-y-0.5 border-l border-neutral-200 pl-2 dark:border-neutral-700">
                      {scopes.map((s) => {
                        const active = selected && s.id === topicId;
                        const scopeChats = active ? chats.filter((ch) => ch.course_id === c.id && ch.topic_id === s.id) : [];
                        return (
                          <li key={s.id ?? "course"}>
                            <button
                              onClick={() => onOpenScope(s.id)}
                              className={`w-full truncate rounded-md px-2 py-1 text-left text-[13px] transition-colors ${
                                active ? "bg-neutral-200/70 font-medium dark:bg-neutral-700" : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                              }`}
                              title={s.label}
                            >
                              {s.label}
                            </button>
                            {active && (
                              <ul className="list-in my-1 ml-2 space-y-0.5">
                                <li>
                                  <button
                                    onClick={() => onOpenScope(s.id)}
                                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                                  >
                                    <span aria-hidden className="text-base leading-none">+</span> New chat
                                  </button>
                                </li>
                                {scopeChats.map((ch) => (
                                  <li key={ch.id}>
                                    <button
                                      onClick={() => onOpenChat(ch)}
                                      aria-current={ch.id === chatId ? "true" : undefined}
                                      className={`w-full truncate rounded-md px-2 py-1 text-left text-[13px] ${
                                        ch.id === chatId ? "bg-white shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                                      }`}
                                      title={ch.title}
                                    >
                                      {ch.title}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-neutral-200 px-4 py-3 text-xs dark:border-neutral-800">
        <span className="min-w-0 truncate text-neutral-600 dark:text-neutral-400" title={user.email}>
          {user.displayName ?? user.email}
        </span>
        <SignOutButton className="shrink-0 text-neutral-600 underline-offset-2 hover:text-neutral-950 hover:underline dark:text-neutral-400 dark:hover:text-white" />
      </div>
    </nav>
  );
}
