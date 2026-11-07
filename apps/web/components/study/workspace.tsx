"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatItem, WorkspaceData } from "@/lib/study/types";
import { displayCode } from "@/lib/study/format";
import { ChatPanel } from "./chat-panel";
import { Sidebar } from "./sidebar";
import { SlidePreview } from "./slide-preview";

// Laptop first (most students study on a laptop): sidebar | chat | slide preview side by side.
// Below lg the sidebar is a drawer and the preview a bottom sheet.
//
// Courses, topics and chats are all in memory, so switching between them never waits on the
// server: the sidebar stays put and the chat area animates in (.panel-in in globals.css).
export function Workspace(data: WorkspaceData) {
  const [courseId, setCourseId] = useState(data.initialCourseId);
  const [chats, setChats] = useState<ChatItem[]>(data.chats);
  const [topicId, setTopicId] = useState<string | null>(data.initialTopicId);
  const [chatId, setChatId] = useState<string | null>(data.initialChatId);
  // Remounts (and re-animates) the chat panel when the student picks a course, topic or chat,
  // never when a brand-new chat gets its id mid-stream.
  const [panelKey, setPanelKey] = useState(() => data.initialChatId ?? `new-${data.initialCourseId}-${data.initialTopicId ?? "course"}`);
  const [preview, setPreview] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [used, setUsed] = useState(data.usage.used);
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null);

  const course = useMemo(() => data.courses.find((c) => c.id === courseId)!, [data.courses, courseId]);
  const topics = useMemo(() => data.topics.filter((t) => t.course_id === courseId), [data.topics, courseId]);
  const topic = useMemo(() => topics.find((t) => t.id === topicId) ?? null, [topics, topicId]);

  // Keep the URL shareable/reloadable without a navigation.
  useEffect(() => {
    const params = new URLSearchParams();
    if (topic) params.set("topic", String(topic.order));
    if (chatId) params.set("chat", chatId);
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", `/study/${course.code}${qs ? `?${qs}` : ""}`);
    document.title = `${displayCode(course.code)}${topic ? ` · ${topic.title}` : ""} · PAU Study Assistant`;
  }, [course.code, topic, chatId]);

  const show = useCallback((next: { courseId: string; topicId: string | null; chatId: string | null }) => {
    setCourseId(next.courseId);
    setTopicId(next.topicId);
    setChatId(next.chatId);
    setPanelKey(next.chatId ?? `new-${next.courseId}-${next.topicId ?? "course"}-${Date.now()}`);
    setPreview(null);
    setDrawerOpen(false);
  }, []);

  const openCourse = useCallback((id: string) => show({ courseId: id, topicId: null, chatId: null }), [show]);
  const openScope = useCallback((id: string | null) => show({ courseId, topicId: id, chatId: null }), [show, courseId]);
  const openChat = useCallback((chat: ChatItem) => show({ courseId: chat.course_id, topicId: chat.topic_id, chatId: chat.id }), [show]);

  const onChatCreated = useCallback((chat: ChatItem) => {
    setChats((prev) => [chat, ...prev]);
    setChatId(chat.id);
  }, []);

  const onChatActive = useCallback((id: string) => {
    setChats((prev) => {
      const i = prev.findIndex((c) => c.id === id);
      if (i <= 0) return prev;
      return [{ ...prev[i], updated_at: new Date().toISOString() }, ...prev.slice(0, i), ...prev.slice(i + 1)];
    });
  }, []);

  const remaining = Math.max(0, data.usage.cap - used);
  const onRemaining = useCallback((r: number) => setUsed(data.usage.cap - r), [data.usage.cap]);
  const scopeTitle = topic ? topic.title : "Whole course";

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Sidebar: fixed column on laptops, drawer below lg */}
      <div
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity lg:hidden ${drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[288px] transform border-r border-neutral-200 bg-neutral-50 transition-transform duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-900 lg:static lg:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          courses={data.courses}
          topics={data.topics}
          chats={chats}
          courseId={courseId}
          topicId={topicId}
          chatId={chatId}
          user={data.user}
          onOpenCourse={openCourse}
          onOpenScope={openScope}
          onOpenChat={openChat}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 px-4 dark:border-neutral-800">
          <button
            className="-ml-1 rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 lg:hidden dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open course list"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
            </svg>
          </button>
          <div key={`${courseId}-${topicId ?? "course"}`} className="title-in min-w-0">
            <p className="truncate text-sm font-semibold">
              {displayCode(course.code)} · {course.title}
            </p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{scopeTitle}</p>
          </div>
        </header>

        <div key={panelKey} className="panel-in flex min-h-0 flex-1 flex-col">
          <ChatPanel
            course={course}
            topic={topic}
            chatId={chatId}
            remaining={remaining}
            onRemaining={onRemaining}
            onChatCreated={onChatCreated}
            onChatActive={onChatActive}
            onCite={setPreview}
            prefill={prefill}
          />
        </div>
      </main>

      {preview && (
        <SlidePreview
          key={preview}
          slideKey={preview}
          sortOrder={course.sort_order}
          onClose={() => setPreview(null)}
          onAsk={(text) => {
            setPrefill({ text, n: Date.now() });
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
