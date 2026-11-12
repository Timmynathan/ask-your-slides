"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { AccountMenu } from "@/components/ui/account-menu";
import type { ChatItem, WorkspaceData } from "@/lib/study/types";
import { countMain, courseFullName, courseName, LIMITED_MAIN_MATERIALS, shownCode } from "@/lib/study/course-code";
import { courseHref, courseParams } from "@/lib/study/course-link";
import { PARTNERS, type PartnerId } from "@/lib/partners";
import { ChatPanel } from "./chat-panel";
import { PartnerSwitch } from "./partner-switch";
import { PAST_QUESTIONS_LIVE } from "@/lib/past/feature";
import { PastPanel } from "./past-panel";
import { Sidebar } from "./sidebar";
import { SlidePreview } from "./slide-preview";
import { SourcesPanel } from "./sources-panel";
import { PricingSheet, type LimitCode } from "@/components/plans/pricing-sheet";

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
  const [prefill, setPrefill] = useState<{ text: string; n: number; slideKey?: string } | null>(null);
  const [partner, setPartner] = useState<PartnerId>(data.partner);
  const [pickingPartner, setPickingPartner] = useState(false);
  // Past questions (PRD F10): "list" = opened from the Topics panel; "topic" = from a topic chat's
  // chip (practice for that topic, with a way back to the chat).
  const [past, setPast] = useState<null | "list" | "topic">(data.initialPast ? "list" : null);
  // "Is this helping you study?" after the 10th question; "Not now" waits until the next visit.
  const [questions, setQuestions] = useState(data.pulse.questions);
  const [pulseClosed, setPulseClosed] = useState(data.pulse.answered);
  const onQuestion = useCallback(() => setQuestions((n) => n + 1), []);
  const onPulseDone = useCallback(() => setPulseClosed(true), []);
  const studentName = data.user.displayName?.trim().split(/\s+/)[0] ?? null;
  // PRD F12: the pricing sheet, opened when a limit or lock stops the student.
  const [sheet, setSheet] = useState<{ code: LimitCode; resetsAt: string | null } | null>(null);
  const onLimit = useCallback((code: LimitCode, resetsAt: string | null) => setSheet({ code, resetsAt }), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  const course = useMemo(() => data.courses.find((c) => c.id === courseId)!, [data.courses, courseId]);
  const topics = useMemo(() => data.topics.filter((t) => t.course_id === courseId), [data.topics, courseId]);
  const topic = useMemo(() => topics.find((t) => t.id === topicId) ?? null, [topics, topicId]);

  // Keep the URL shareable/reloadable without a navigation.
  useEffect(() => {
    const params = courseParams(course, data.courses);
    if (topic) params.set("topic", String(topic.order));
    if (chatId) params.set("chat", chatId);
    if (past === "list") params.set("past", "1");
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", `/study/${course.code}${qs ? `?${qs}` : ""}`);
    document.title = `${courseName(course)}${past === "list" ? " · Past questions" : topic ? ` · ${topic.title}` : ""} · Ask Your Slides`;
  }, [course, data.courses, topic, chatId, past]);

  const show = useCallback((next: { courseId: string; topicId: string | null; chatId: string | null }) => {
    setTopicId(next.topicId);
    setChatId(next.chatId);
    setPanelKey(next.chatId ?? `new-${next.courseId}-${next.topicId ?? "course"}-${Date.now()}`);
    setPreview(null);
    setDrawerOpen(false);
    setPast(null);
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
  const scopeTitle = past === "list" ? "Past questions" : topic ? topic.title : "Whole course";
  const topicPast = PAST_QUESTIONS_LIVE && topic ? data.past.byTopic[topic.id] ?? 0 : 0;
  const courseChats = useMemo(() => chats.filter((c) => c.course_id === courseId), [chats, courseId]);
  const p = PARTNERS[partner];

  // Built on click: the site address is only known in the browser (no server/client mismatch).
  const invite = () => {
    const text = `I'm revising ${courseName(course)} with Ask Your Slides: answers straight from our lecture slides, with the slide cited. Try it: ${window.location.origin}${courseHref(course, data.courses)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-page text-ink">
      {/* Top bar: as quiet as My courses. */}
      <header className="flex h-16 shrink-0 items-center gap-1 px-3 sm:gap-2 sm:px-5">
        <IconButton label="Open topics" onClick={() => setDrawerOpen(true)} className="lg:hidden">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </IconButton>
        <Link href="/dashboard" aria-label="All courses" title="All courses" className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-sunken active:scale-95">
          <LogoMark size={22} />
        </Link>
        <h1 className="min-w-0 truncate text-[17px] text-ink sm:ml-1 sm:text-[19px]">
          {course.title}
          {shownCode(course) && <span className="ml-2 hidden text-sm text-muted sm:inline">{shownCode(course)}</span>}
          {course.elective && <span className="ml-2 rounded-full bg-pau-100 px-2.5 py-0.5 align-middle text-[12px] font-medium text-brand">Elective</span>}
          {countMain(data.materials) < LIMITED_MAIN_MATERIALS && (
            <span
              title="Only a few lecture files are up for this course so far. Answers explain more from general knowledge, clearly marked."
              className="ml-2 hidden rounded-full bg-amber-50 px-2.5 py-0.5 align-middle text-[12px] font-medium text-amber-800 sm:inline"
            >
              Limited materials
            </span>
          )}
          {data.plan.premiumLimited && <PremiumTag left={remaining} />}
        </h1>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <IconButton label="Invite coursemates on WhatsApp" onClick={invite}>
            <path d="M15 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 4 17.5V19M9.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18.5 8v6M21.5 11h-6" />
          </IconButton>
          <PartnerSwitch partner={partner} onChanged={setPartner} open={pickingPartner} onOpenChange={setPickingPartner} account={data.user.id} />
          <AccountMenu user={data.user} onChangePartner={() => setPickingPartner(true)} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-2 lg:px-3 lg:pb-3">
        {/* Topics: a navy panel on laptops, a drawer below lg */}
        <div
          className={`fixed inset-0 z-30 bg-black/20 transition-opacity lg:hidden ${drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[288px] transform bg-navy text-white transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 lg:overflow-hidden lg:rounded-[28px] ${
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
            pastActive={past === "list"}
            courseLabel={courseFullName(course)}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-page">
          <div className="flex h-10 shrink-0 items-center gap-2 px-5">
            <p key={`${courseId}-${topicId ?? "course"}-${past ?? "chat"}`} className="title-in min-w-0 flex-1 truncate text-[13px] text-muted">
              {scopeTitle}
            </p>
            {!past && topicPast > 0 && (
              <button
                type="button"
                onClick={() => setPast("topic")}
                className="shrink-0 rounded-full bg-pau-100 px-3 py-1 text-[12.5px] text-brand transition hover:opacity-80 active:scale-95"
                title={`Practise past exam questions on ${topic!.title}`}
              >
                {topicPast} past question{topicPast === 1 ? "" : "s"}
              </button>
            )}
            <IconButton label="Sources" onClick={() => setSourcesOpen(true)} className="xl:hidden">
              <path d="M7 3.5h7l4 4V20.5H7z" />
              <path d="M14 3.5v4h4M10 12h5M10 15.5h5" />
            </IconButton>
          </div>

          {past && (
            <div key={`past-${past}-${topicId ?? "course"}`} className="panel-in flex min-h-0 flex-1 flex-col">
              {!PAST_QUESTIONS_LIVE ? (
                <PastComingSoon />
              ) : (
              <PastPanel
                course={course}
                topics={topics}
                topicId={past === "topic" ? topicId : null}
                onBack={past === "topic" ? () => setPast(null) : null}
                onCite={setPreview}
                onRemaining={onRemaining}
                partnerName={p.name}
              />
              )}
            </div>
          )}
          {/* The chat stays mounted under Past questions, so going back keeps the conversation. */}
          <div key={panelKey} className={past ? "hidden" : "panel-in flex min-h-0 flex-1 flex-col"}>
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
              pulseDue={!pulseClosed && questions >= 10}
              onQuestion={onQuestion}
              onPulseDone={onPulseDone}
              plan={data.plan.id}
              premiumLimited={data.plan.premiumLimited}
              capCode={data.plan.binding}
              resetsAt={data.plan.resetsAt}
              onLimit={onLimit}
            />
          </div>
        </main>

        {/* Right: Sources, or the slide being viewed (which replaces it until closed). */}
        <div className={preview ? "contents xl:hidden" : "contents"}>
          <SourcesPanel
            courseId={course.id}
            courseCode={course.code}
            topics={topics}
            materials={data.materials}
            topic={topic}
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
            courseId={course.id}
            sortOrder={course.sort_order}
            onNavigate={setPreview}
            onClose={() => setPreview(null)}
            onAsk={(text, slideKey) => {
              setPrefill({ text, n: Date.now(), slideKey });
              setPreview(null);
            }}
          />
        )}
      </div>


      {sheet && <PricingSheet code={sheet.code} resetsAt={sheet.resetsAt} offer={data.plan.offer} onClose={closeSheet} />}
    </div>
  );
}

/** Round, borderless icon button with a line icon (24px grid), as on My courses. */
function IconButton({ label, onClick, className = "", children }: { label: string; onClick(): void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink transition hover:bg-sunken active:scale-90 ${className}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

/** Past questions before launch (lib/past/feature.ts): one big, calm "Coming soon". */
function PastComingSoon() {
  return (
    <div className="grid flex-1 place-items-center px-6 pb-16 text-center">
      <div>
        <p className="font-heading text-[40px] font-semibold tracking-tight text-ink sm:text-[56px]">Coming soon</p>
        <p className="mx-auto mt-3 max-w-sm text-[15px] text-muted">Past exam questions to practise, marked against the real paper. Ready before your exams.</p>
      </div>
    </div>
  );
}

/** Free + premium course (PRD F12): the badge, with today's free questions on wider screens
 *  (phones see the count under the message box). */
function PremiumTag({ left }: { left: number }) {
  return (
    <>
      <span
        title="Premium courses are the heaviest courses in your programme. Free gives a few questions a day; Finals has no limit."
        className="ml-2 rounded-full bg-pau-100 px-2.5 py-0.5 align-middle text-[12px] font-semibold text-pau-800 dark:text-pau-400"
      >
        Premium
      </span>
      <span className="ml-2 hidden align-middle text-[13px] text-muted sm:inline">
        {left} free question{left === 1 ? "" : "s"} left today
      </span>
    </>
  );
}
