"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Mascot } from "@/components/mascot/mascot";
import { AccountMenu } from "@/components/ui/account-menu";
import type { ChatItem, WorkspaceData } from "@/lib/study/types";
import { displayCode } from "@/lib/study/format";
import { PARTNERS, type PartnerId } from "@/lib/partners";
import { ChatPanel } from "./chat-panel";
import { PartnerPicker } from "./partner-picker";
import { Sidebar } from "./sidebar";
import { SlidePreview } from "./slide-preview";
import { SourcesPanel } from "./sources-panel";

// Inside one course, laid out like a notebook: a top bar (logo back to My courses, the course name,
// invite, study partner, account), then three panels on a soft background: Topics | chat | the
// cited slide (when open). Laptop first; below lg the Topics panel is a drawer and the slide a
// bottom sheet. Other courses are reached from My courses, not listed here.
//
// Topics and chats are in memory, so switching between them never waits on the server: the panel
// stays put and the chat area animates in (.panel-in in globals.css).
export function Workspace(data: WorkspaceData) {
  const courseId = data.initialCourseId;
  const [chats, setChats] = useState<ChatItem[]>(data.chats);
  const [topicId, setTopicId] = useState<string | null>(data.initialTopicId);
  const [chatId, setChatId] = useState<string | null>(data.initialChatId);
  // Remounts (and re-animates) the chat panel when the student picks a course, topic or chat,
  // never when a brand-new chat gets its id mid-stream.
  const [panelKey, setPanelKey] = useState(() => data.initialChatId ?? `new-${data.initialCourseId}-${data.initialTopicId ?? "course"}`);
  const [preview, setPreview] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false); // below xl; on wide screens Sources is always shown
  const [used, setUsed] = useState(data.usage.used);
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null);
  const [partner, setPartner] = useState<PartnerId>(data.partner);
  const [pickingPartner, setPickingPartner] = useState(false);
  const studentName = data.user.displayName?.trim().split(/\s+/)[0] ?? null;

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
    document.title = `${displayCode(course.code)}${topic ? ` · ${topic.title}` : ""} · Ask Your Slides`;
  }, [course.code, topic, chatId]);

  const show = useCallback((next: { courseId: string; topicId: string | null; chatId: string | null }) => {
    setTopicId(next.topicId);
    setChatId(next.chatId);
    setPanelKey(next.chatId ?? `new-${next.courseId}-${next.topicId ?? "course"}-${Date.now()}`);
    setPreview(null);
    setDrawerOpen(false);
  }, []);

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
  const courseChats = useMemo(() => chats.filter((c) => c.course_id === courseId), [chats, courseId]);
  const p = PARTNERS[partner];

  // Built on click: the site address is only known in the browser (no server/client mismatch).
  const invite = () => {
    const text = `I'm revising ${displayCode(course.code)} with Ask Your Slides: answers straight from our lecture slides, with the slide cited. Try it: ${window.location.origin}/study/${course.code}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-tint text-ink">
      {/* Top bar */}
      <header className="flex h-16 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <button
          className="rounded-full p-2 text-muted hover:bg-sunken lg:hidden"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open topics"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/dashboard" aria-label="All courses" title="All courses" className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-card ring-1 ring-line transition hover:bg-sunken active:scale-95 sm:grid">
          <LogoMark size={22} />
        </Link>
        <div className="min-w-0 sm:ml-1">
          <h1 className="truncate text-[18px] leading-tight text-ink sm:text-[22px]">{course.title}</h1>
          <p className="truncate text-xs text-muted">
            <Link href="/dashboard" className="hover:text-ink hover:underline">My courses</Link> / {displayCode(course.code)}
          </p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={invite}
            aria-label="Invite coursemates on WhatsApp"
            className="flex items-center gap-2 rounded-full px-2.5 py-2 text-[15px] text-ink transition hover:bg-sunken active:scale-95 sm:px-3.5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="text-[#25D366]">
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4 5.2 5.2 0 0 0 3.2.7 2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
            </svg>
            <span className="hidden md:inline">Invite coursemates</span>
          </button>
          <button
            type="button"
            onClick={() => setPickingPartner(true)}
            aria-label={`Studying with ${p.name}. Change study partner`}
            className="flex items-center gap-2 rounded-full bg-card py-1 pl-1 pr-1 ring-1 ring-line transition hover:bg-sunken active:scale-95 sm:pr-3.5"
          >
            <Mascot key={partner} partner={partner} size={30} animated={false} className="pop-in" />
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-[10px] uppercase tracking-wide text-muted">Studying with</span>
              <span className="block text-sm font-medium text-ink">{p.name}</span>
            </span>
          </button>
          <AccountMenu user={data.user} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 lg:px-3 lg:pb-3">
        {/* Topics: a panel on laptops, a drawer below lg */}
        <div
          className={`fixed inset-0 z-30 bg-black/30 transition-opacity lg:hidden ${drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[300px] transform bg-card transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 lg:overflow-hidden lg:rounded-[24px] lg:ring-1 lg:ring-line ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar
            topics={topics}
            chats={courseChats}
            topicId={topicId}
            chatId={chatId}
            onOpenScope={openScope}
            onOpenChat={openChat}
            courseLabel={`${displayCode(course.code)} ${course.title}`}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card lg:rounded-[24px] lg:ring-1 lg:ring-line">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-5">
            <p key={`${courseId}-${topicId ?? "course"}`} className="title-in min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {scopeTitle}
            </p>
            <button
              onClick={() => setSourcesOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-ink ring-1 ring-line transition hover:bg-sunken active:scale-95 xl:hidden"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
                <path d="M4 1.5h5.5L12.5 4.5v10h-8.5z" />
                <path d="M9.5 1.5v3h3" />
              </svg>
              Sources
            </button>
          </div>

          <div key={panelKey} className="panel-in flex min-h-0 flex-1 flex-col">
            <ChatPanel
              course={course}
              topic={topic}
              chatId={chatId}
              partner={partner}
              studentName={studentName}
              remaining={remaining}
              onRemaining={onRemaining}
              onChatCreated={onChatCreated}
              onChatActive={onChatActive}
              onCite={setPreview}
              prefill={prefill}
            />
          </div>
        </main>

        {/* Right: Sources, or the slide being viewed (which replaces it until closed). */}
        <div className={preview ? "contents xl:hidden" : "contents"}>
          <SourcesPanel
            courseCode={course.code}
            topics={topics}
            materials={data.materials}
            topic={topic}
            partnerName={p.name}
            open={sourcesOpen}
            onClose={() => setSourcesOpen(false)}
            onOpenSource={(key) => {
              setSourcesOpen(false);
              setPreview(key);
            }}
          />
        </div>
        {preview && (
          <SlidePreview
            // One viewer per material: flipping pages keeps it mounted, so the current page stays until the next loads.
            key={preview.replace(/-\d+$/, "")}
            slideKey={preview}
            sortOrder={course.sort_order}
            onNavigate={setPreview}
            onClose={() => setPreview(null)}
            onAsk={(text) => {
              setPrefill({ text, n: Date.now() });
              setPreview(null);
            }}
          />
        )}
      </div>

      {pickingPartner && (
        <PartnerPicker
          current={partner}
          onClose={() => setPickingPartner(false)}
          onChanged={(id) => {
            setPartner(id);
            setPickingPartner(false);
          }}
        />
      )}

    </div>
  );
}
