"use client";

import Link from "next/link";
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
  const currentCode = courses.find((c) => c.id === courseId)?.code ?? courses[0]?.code ?? "";
  return (
    <nav className="flex h-full flex-col" aria-label="Courses and chats">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/dashboard" className="rounded-full" aria-label="Ask Your Slides, all courses">
          <Logo size={24} />
        </Link>
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
        <div className="flex items-center justify-between px-2 pb-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Courses</p>
          <Link href="/dashboard" className="rounded-full px-2 py-0.5 text-[12px] text-muted hover:bg-sunken hover:text-ink">
            All courses
          </Link>
        </div>
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
                    selected ? "bg-card shadow-sm ring-1 ring-line" : "hover:bg-sunken"
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full transition-transform duration-200 ${courseDot(c.sort_order)} ${selected ? "scale-125" : ""}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="type-menu block">{displayCode(c.code)}</span>
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
                              className={`type-menu w-full truncate rounded-lg px-2 py-1 text-left transition-colors ${
                                active ? "bg-pau-100" : "hover:bg-sunken"
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
                                    className="type-menu flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left !text-muted hover:bg-sunken"
                                  >
                                    <span aria-hidden className="text-base leading-none">+</span> New chat
                                  </button>
                                </li>
                                {scopeChats.map((ch) => (
                                  <li key={ch.id}>
                                    <button
                                      onClick={() => onOpenChat(ch)}
                                      aria-current={ch.id === chatId ? "true" : undefined}
                                      className={`type-menu w-full truncate rounded-lg px-2 py-1 text-left ${
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

      {/* Growth inside PAU: one tap to share the course you're studying with your class group. */}
      <div className="shrink-0 px-2 pb-2">
        <button
          type="button"
          // Built on click: the site address is only known in the browser (no server/client mismatch).
          onClick={() => {
            const text = `I'm revising ${displayCode(currentCode)} with Ask Your Slides: answers straight from our lecture slides, with the slide cited. Try it: ${window.location.origin}/study/${currentCode}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-card px-3 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-sunken"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="text-[#25D366]">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4 5.2 5.2 0 0 0 3.2.7 2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
          </svg>
          Invite coursemates
        </button>
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
