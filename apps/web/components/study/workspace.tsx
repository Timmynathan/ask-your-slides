"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AccountMenu } from "@/components/ui/account-menu";
import { ShellNavMini, useShellCourse } from "@/components/nav/app-shell";
import type { ChatItem, WorkspaceData } from "@/lib/study/types";
import { courseName } from "@/lib/study/course-code";
import { courseParams } from "@/lib/study/course-link";
import { PARTNERS, type PartnerId } from "@/lib/partners";
import { ChatPanel } from "./chat-panel";
import { PartnerSwitch } from "./partner-switch";
import { PAST_QUESTIONS_LIVE } from "@/lib/past/feature";
import { PastPanel } from "./past-panel";
import { Sidebar } from "./sidebar";
import { SlidePreview } from "./slide-preview";
import { SourcesPanel } from "./sources-panel";
import { ResizeHandle } from "./resize-handle";
import { StudyTour, useStudyTour } from "./study-tour";
import { LaptopTour, useLaptopTour } from "./laptop-tour";
import { PricingSheet, type LimitCode } from "@/components/plans/pricing-sheet";

// Inside one course: the app's sidebar holds the course's topics (tablets up), then the chat with a
// quiet top bar (course name, past questions, study partner), then Sources or the cited slide, full
// height on the right. Phones: Topics is a drawer and the slide a bottom sheet.
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
  const initialPanelKey = data.initialChatId ?? `new-${data.initialCourseId}-${data.initialTopicId ?? "course"}`;
  const [panelKey, setPanelKey] = useState(initialPanelKey);
  const [preview, setPreview] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false); // below xl; on wide screens Sources is always shown
  // Laptops (owner, 21 Nov 2026): Sources and the slide viewer can be dragged wider or narrower by
  // their left edge; widths are remembered on this device. Dragging Sources far enough right closes
  // it (a Sources button brings it back); an open slide never closes by dragging, only with its X.
  const [rightW, setRightW] = useState({ sources: 240, slide: 520 }); // Sources narrower (owner, 21 Nov 2026)
  const [sourcesClosed, setSourcesClosed] = useState(false);
  const dragFrom = useRef(0);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ays:right2") ?? "null") as { sources?: number; slide?: number } | null;
      if (saved) {
        const t = setTimeout(() => setRightW((w) => ({ sources: saved.sources ?? w.sources, slide: saved.slide ?? w.slide })), 0);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);
  const saveRight = (w: { sources: number; slide: number }) => {
    try {
      localStorage.setItem("ays:right2", JSON.stringify(w));
    } catch {}
  };
  // First visit on a phone or iPad in portrait: a short tour of ☰ (topics) and Sources (study-tour.tsx).
  const tour = useStudyTour(data.user.id, !data.initialPast);
  // Tablets and laptops: a guided walk of the page instead (laptop-tour.tsx).
  const laptopTour = useLaptopTour(data.user.id, !data.initialPast && !data.initialAsk);
  const { advance } = tour;
  const openDrawer = () => {
    setDrawerOpen(true);
    advance("menu");
  };
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    advance("drawer");
  }, [advance]);
  const openSources = () => {
    // Laptops: the Sources column was dragged closed, so this brings it back.
    if (window.matchMedia("(min-width: 80rem)").matches) {
      setSourcesClosed(false);
      return;
    }
    setSourcesOpen(true);
    advance("sources");
  };
  const closeSources = useCallback(() => {
    setSourcesOpen(false);
    advance("files");
  }, [advance]);
  const [used, setUsed] = useState(data.usage.used);
  const [prefill, setPrefill] = useState<{ text: string; n: number; slideKey?: string } | null>(null);
  // Arrived from the dashboard's "Ask anything": asked once in the whole-course chat, with a note
  // saying which course answered and a way back to pick another.
  const [asked, setAsked] = useState<string | null>(data.initialAsk ?? null);
  const [partner, setPartner] = useState<PartnerId>(data.partner);
  const [pickingPartner, setPickingPartner] = useState(false);
  // Past questions (PRD F10): "list" = opened from the Topics panel; "topic" = from a topic chat's
  // chip (practice for that topic, with a way back to the chat).
  const [past, setPast] = useState<null | "list" | "topic">(data.initialPast ? "list" : null);
  // Opened from a "Practise 2025/26 exam" button in the Topics panel: practise that paper.
  const [pastPaper, setPastPaper] = useState<string | null>(null);
  const openPast = useCallback((paperId: string | null) => {
    setPastPaper(paperId);
    setPast("list");
    closeDrawer();
  }, [closeDrawer]);
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

  // Picking a topic opens its first slides (owner, 18 Nov 2026): the topic's first slides or notes
  // file at page 1, on iPads and laptops (md and up, where the slide sits beside the chat; on phones
  // it would cover the chat). Not for Whole course. Closing it keeps it closed until the next topic.
  const firstSlide = useCallback(
    (id: string | null): string | null => {
      if (!id || !window.matchMedia("(min-width: 48rem)").matches) return null;
      const m = data.materials
        .filter((x) => x.topic_id === id && (x.kind === "slides" || x.kind === "notes"))
        .sort((x, y) => x.material_order - y.material_order)[0];
      return m ? `${course.code}-${String(m.material_order).padStart(2, "0")}-1` : null;
    },
    [data.materials, course.code],
  );

  // Arriving on a topic (shared link, reload, Continue studying): same, unless past questions are open.
  useEffect(() => {
    if (data.initialPast) return;
    const key = firstSlide(data.initialTopicId);
    if (!key) return;
    const t = setTimeout(() => setPreview((cur) => cur ?? key), 0);
    return () => clearTimeout(t);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = useCallback((next: { courseId: string; topicId: string | null; chatId: string | null }) => {
    setAsked(null);
    setTopicId(next.topicId);
    setChatId(next.chatId);
    setPanelKey(next.chatId ?? `new-${next.courseId}-${next.topicId ?? "course"}-${Date.now()}`);
    setPreview(firstSlide(next.topicId));
    closeDrawer();
    setPast(null);
  }, [firstSlide, closeDrawer]);

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
  const courseChats = useMemo(() => chats.filter((c) => c.course_id === courseId), [chats, courseId]);
  const p = PARTNERS[partner];


  // The shared sidebar (app/(app)/(shell)/layout.tsx) stays mounted; this page tells it which course
  // is open and puts the topics into its panel (owner, 21 Nov 2026: no blank flash from the dashboard).
  const shell = useShellCourse();
  const setShellCourse = shell?.setCourse;
  // A slide open beside the chat: on smaller laptops the panel tucks away until it closes.
  const setShellTucked = shell?.setTucked;
  useEffect(() => {
    setShellTucked?.(!!preview);
    return () => setShellTucked?.(false);
  }, [setShellTucked, preview]);
  const shellTitle = courseName(course);
  useEffect(() => {
    setShellCourse?.({ id: courseId, title: shellTitle });
    return () => setShellCourse?.(null);
  }, [setShellCourse, courseId, shellTitle]);

  const sidebar = (
    <Sidebar
      topics={topics}
      chats={courseChats}
      topicId={topicId}
      chatId={chatId}
      onOpenScope={openScope}
      onOpenChat={openChat}
      pastActive={past === "list"}
      past={PAST_QUESTIONS_LIVE ? data.past : null}
      onOpenPast={openPast}
    />
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-page text-ink" style={{ ["--sources-w" as string]: `${rightW.sources}px`, ["--slide-w" as string]: `${rightW.slide}px` }}>
      {shell?.slot && createPortal(sidebar, shell.slot)}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (owner, 21 Nov 2026): no course name, tags or counts (the sidebar names the course);
            only the menu on phones, past questions on phones, Sources below xl and the study partner. */}
        <header className="flex h-14 shrink-0 items-center gap-1 px-3 sm:h-16 sm:gap-2 sm:px-5">
          <IconButton label="Open topics" onClick={openDrawer} tour="menu" className="md:hidden">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </IconButton>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Phones: the Topics panel is a drawer, so the past questions get a bright button here. */}
            {!past && PAST_QUESTIONS_LIVE && data.past.total > 0 && (
              <button
                type="button"
                onClick={() => openPast(null)}
                className="cta-shine shrink-0 rounded-full bg-navy px-3.5 py-1 text-[12.5px] font-medium text-white transition hover:opacity-90 active:scale-95 md:hidden"
                title={`Practise ${data.past.total} past questions in ${courseName(course)}`}
              >
                Past questions
              </button>
            )}
            <IconButton label="Sources" onClick={openSources} tour="sources" laptopTour="sources" className={sourcesClosed && !preview && !past ? "" : "xl:hidden"}>
              <path d="M7 3.5h7l4 4V20.5H7z" />
              <path d="M14 3.5v4h4M10 12h5M10 15.5h5" />
            </IconButton>
            <PartnerSwitch partner={partner} onChanged={setPartner} open={pickingPartner} onOpenChange={setPickingPartner} account={data.user.id} quiet={tour.step !== null || laptopTour.step !== null} />
          </div>
        </header>

        {/* Topics (with Past questions) on phones: a drawer, with the app's links on top. From tablets
            up they're in the sidebar (the portal above). */}
        <div
          className={`fixed inset-0 z-30 bg-black/20 transition-opacity md:hidden ${drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onClick={closeDrawer}
          aria-hidden
        />
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-[288px] transform flex-col bg-navy text-white transition-transform duration-200 ease-out md:hidden ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <ShellNavMini onNavigate={closeDrawer} />
          <div className="min-h-0 flex-1">{sidebar}</div>
          <div className="flex items-center gap-3 border-t border-white/10 px-5 py-3">
            <AccountMenu user={data.user} side />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-white/70">{data.user.displayName ?? data.user.email}</span>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-page">
          {asked && !past && (
            <p className="mx-auto mt-1 w-full max-w-3xl px-4 text-[13px] text-muted lg:px-8">
              Answering in {courseName(course)}.{" "}
              <a href={`/dashboard?ask=${encodeURIComponent(asked)}&pick=1`} className="font-medium text-brand underline-offset-2 hover:underline">
                Wrong course?
              </a>
            </p>
          )}
          {past && (
            <div key={`past-${past}-${topicId ?? "course"}-${pastPaper ?? "all"}`} className="panel-in flex min-h-0 flex-1 flex-col">
              {!PAST_QUESTIONS_LIVE ? (
                <PastComingSoon />
              ) : (
                <PastPanel
                  course={course}
                  topics={topics}
                  topicId={past === "topic" ? topicId : null}
                  paperId={past === "list" ? pastPaper : null}
                  onBack={() => setPast(null)}
                  onCite={setPreview}
                  onRemaining={onRemaining}
                  onLimit={onLimit}
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
              onChangePartner={() => setPickingPartner(true)}
              autoAsk={panelKey === initialPanelKey ? data.initialAsk ?? null : null}
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
      </div>

      {/* Right, full height with square edges (owner, 21 Nov 2026): Sources, or the slide being viewed
          (which replaces it until closed). Hidden while past questions are open: the original paper
          takes that room instead. */}
      {!preview && !past && !sourcesClosed && (
        <ResizeHandle
          label="Resize sources"
          onStart={() => {
            dragFrom.current = rightW.sources;
          }}
          onMove={(dx) => {
            const w = dragFrom.current - dx;
            // Dragged far enough right: it closes there and then, without letting go, keeping the
            // width it had before (owner, 21 Nov 2026).
            if (w < 170) {
              setSourcesClosed(true);
              setRightW((r) => ({ ...r, sources: dragFrom.current }));
              return;
            }
            setRightW((r) => ({ ...r, sources: Math.min(560, w) }));
          }}
          onEnd={() => {
            setRightW((r) => {
              const next = { ...r, sources: Math.max(200, r.sources) };
              saveRight(next);
              return next;
            });
          }}
        />
      )}
      <div className={preview ? "contents xl:hidden" : past ? "hidden" : "contents"}>
        <SourcesPanel
          collapsed={sourcesClosed}
          courseId={course.id}
          courseCode={course.code}
          topics={topics}
          materials={data.materials}
          topic={topic}
          open={sourcesOpen}
          onClose={closeSources}
          onOpenSource={(key) => {
            closeSources();
            setPreview(key);
          }}
        />
      </div>
      {preview && (
        <ResizeHandle
          label="Resize slide"
          onStart={() => {
            dragFrom.current = rightW.slide;
          }}
          onMove={(dx) => {
            // Never closes by dragging: the slide stays readable (its X closes it).
            const max = Math.min(900, Math.round(window.innerWidth * 0.6));
            setRightW((r) => ({ ...r, slide: Math.min(max, Math.max(380, dragFrom.current - dx)) }));
          }}
          onEnd={() =>
            setRightW((r) => {
              saveRight(r);
              return r;
            })
          }
        />
      )}
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

      <StudyTour step={tour.step} onSkip={tour.skip} onGotIt={(step) => (step === "drawer" ? closeDrawer() : closeSources())} />
      <LaptopTour step={laptopTour.step} onNext={laptopTour.next} onSkip={laptopTour.finish} />
      {sheet && <PricingSheet code={sheet.code} resetsAt={sheet.resetsAt} offer={data.plan.offer} onClose={closeSheet} />}
    </div>
  );
}

/** Round, borderless icon button with a line icon (24px grid), as on My courses. */
function IconButton({ label, onClick, className = "", tour, laptopTour, children }: { label: string; onClick(): void; className?: string; tour?: string; laptopTour?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-tour={tour}
      data-laptop-tour={laptopTour}
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
