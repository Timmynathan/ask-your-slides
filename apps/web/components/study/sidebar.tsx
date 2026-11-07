"use client";

import { Logo } from "@/components/brand/logo";
import { Mascot } from "@/components/mascot/mascot";
import { SignOutButton } from "@/components/ui/sign-out-button";
import { PARTNERS, type PartnerId } from "@/lib/partners";
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
  partner: PartnerId;
  onChangePartner(): void;
  onOpenCourse(courseId: string): void;
  onOpenScope(topicId: string | null): void;
  onOpenChat(chat: ChatItem): void;
}

export function Sidebar({ courses, topics, chats, courseId, topicId, chatId, user, partner, onChangePartner, onOpenCourse, onOpenScope, onOpenChat }: Props) {
  const p = PARTNERS[partner];
  return (
    <nav className="flex h-full flex-col" aria-label="Courses and chats">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Logo size={24} />
      </div>

      {/* The study partner is always here: who you're studying with, one tap to change. */}
      <div className="mx-2 flex items-center gap-3 rounded-2xl bg-card p-2.5 pr-3 ring-1 ring-line">
        <Mascot key={partner} partner={partner} size={42} className="pop-in" />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted">Studying with</p>
          <p className="truncate font-heading text-[15px] font-semibold text-ink">{p.name}</p>
        </div>
        <button onClick={onChangePartner} className="rounded-full px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-line hover:bg-sunken">
          Change
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Courses</p>
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
                    selected ? "bg-card font-medium shadow-sm ring-1 ring-line" : "hover:bg-sunken"
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full transition-transform duration-200 ${courseDot(c.sort_order)} ${selected ? "scale-125" : ""}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="block">{displayCode(c.code)}</span>
                    <span className="block truncate text-xs font-normal text-muted">{c.title}</span>
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
                    <ul className="mb-2 ml-4 mt-1 space-y-0.5 border-l border-line pl-2">
                      {scopes.map((s) => {
                        const active = selected && s.id === topicId;
                        const scopeChats = active ? chats.filter((ch) => ch.course_id === c.id && ch.topic_id === s.id) : [];
                        return (
                          <li key={s.id ?? "course"}>
                            <button
                              onClick={() => onOpenScope(s.id)}
                              className={`w-full truncate rounded-md px-2 py-1 text-left text-[13px] transition-colors ${
                                active ? "bg-lilac-100 font-medium" : "text-ink/80 hover:bg-sunken"
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
                                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] text-muted hover:bg-sunken"
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
                                        ch.id === chatId ? "bg-card shadow-sm ring-1 ring-line" : "text-muted hover:bg-sunken"
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

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs">
        <span className="min-w-0 truncate text-muted" title={user.email}>
          {user.displayName ?? user.email}
        </span>
        <SignOutButton className="shrink-0 text-muted underline-offset-2 hover:text-ink hover:underline" />
      </div>
    </nav>
  );
}
