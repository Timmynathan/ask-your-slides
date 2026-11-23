"use client";

import { LIMIT_CODES, type LimitCode } from "@/components/plans/pricing-sheet";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CitationInfo } from "@/lib/study/format";
import type { ChatItem, CourseItem, TopicItem } from "@/lib/study/types";
import { Mascot } from "@/components/mascot/mascot";
import { PartnerCast } from "@/components/chat/partner-cast";
import { Spinner } from "@/components/ui/spinner";
import { fill, PARTNERS, pick, type PartnerId } from "@/lib/partners";
import { Answer } from "./answer";
import { AnswerActions, type Rating } from "./answer-actions";
import { useNpsAsk } from "@/lib/ui/use-helpful-ask";
import { NpsCard } from "@/components/feedback/nps-card";
import { PulseCard } from "./pulse-card";
import { UserMessage } from "./user-message";
import { useDictation } from "@/lib/ui/use-dictation";
import { courseName } from "@/lib/study/course-code";
import { capReply } from "@/lib/plans/offer";
import { Typewriter } from "@/components/ui/typewriter";
import { firstCited, SlideThumb, VISUAL_ASK } from "./slide-thumb";
import { citedKeys } from "@/lib/agent/citations";
import { prefetchSlide } from "@/lib/study/slide-cache";
import { asksForQuiz, asksForSummary } from "@/lib/plans/limits";
import { CONTINUE_TEXT, CutShort } from "@/components/chat/cut-short";
import { blobToDataUrl, shrinkImage } from "@/lib/ui/shrink-image";
import { saveUpload, uploadStatus, type UploadStatus } from "@/lib/uploads/client";
import { BookOpen, FileText, GraduationCap, Lightbulb, MessageCircleQuestion, Plus, X, type LucideIcon } from "lucide-react";

type Meta = {
  citations?: CitationInfo[];
  fallback?: { topic: string; used: boolean } | null;
  remaining?: number;
  feedback?: Rating;
  /** The answer hit the length limit (app/api/chat/route.ts). */
  truncated?: boolean;
};
type Msg = UIMessage<Meta>;

const DAILY_LIMIT = "Daily limit reached. Resets at midnight (WAT).";

interface Props {
  course: CourseItem;
  topic: TopicItem | null;
  chatId: string | null;
  partner: PartnerId;
  /** "Change character" under the partner: opens the study-partner picker. */
  onChangePartner(): void;
  /** Sent once as soon as the chat opens (the dashboard's "Ask anything"). */
  autoAsk?: string | null;
  studentName: string | null;
  remaining: number;
  /** The server's count after each answer, so the allowance survives switching chats. */
  onRemaining(remaining: number): void;
  onChatCreated(chat: ChatItem): void;
  onChatActive(id: string): void;
  /** An empty new chat was deleted (its first question was refused). */
  onChatRemoved(id: string): void;
  onCite(slideKey: string): void;
  /** The slide viewer is open beside the chat (then no slide pictures under answers). */
  slideOpen: boolean;
  prefill: { text: string; n: number; slideKey?: string } | null;
  /** "Is this helping you study?": due after the 10th question, until answered (or "Not now"). */
  pulseDue: boolean;
  onQuestion(): void;
  onPulseDone(answered: boolean): void;
  /** PRD F12. */
  plan: "free" | "finals";
  /** Summaries still allowed (Free); null = no limit. */
  summariesLeft: number | null;
  /** Free + premium course: "free questions" wording. */
  premiumLimited: boolean;
  /** The limit already reached, if the student arrives capped. */
  capCode: "daily_cap" | "premium_cap";
  resetsAt: string;
  /** A limit or lock stopped the student: open the pricing sheet. */
  onLimit(code: LimitCode, resetsAt: string | null): void;
}

/** Photos attached to a message (data URLs; only on messages sent in this session). */
function photosOf(m: Msg | undefined): string[] {
  return (m?.parts ?? []).flatMap((p) => (p.type === "file" && p.mediaType.startsWith("image/") ? [p.url] : []));
}

const MAX_PHOTOS = 3;
/** Cited slides loaded in the background after an answer (about 35 KB each). */
const PREFETCH_CITED = 6;

function textOf(m: Msg | undefined): string {
  return (m?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
}

/** The server's refusal code (lib/plans/gate.ts), if this error is a plan limit or lock. */
function limitOf(e: Error | undefined): { code: LimitCode; resetsAt: string | null; chatRemoved: boolean } | null {
  if (!e) return null;
  try {
    const j = JSON.parse(e.message) as { code?: string; resets_at?: string | null; chat_removed?: boolean };
    return LIMIT_CODES.includes(j.code as LimitCode) ? { code: j.code as LimitCode, resetsAt: j.resets_at ?? null, chatRemoved: !!j.chat_removed } : null;
  } catch {
    return null;
  }
}

function errorText(e: Error | undefined): string | null {
  if (!e) return null;
  try {
    return JSON.parse(e.message).error ?? e.message;
  } catch {
    return e.message || "Something went wrong. Please try again.";
  }
}

/** Icons for the starter buttons (Lucide, owner 21 Nov 2026: no hand-drawn icons). */
const STARTER_ICONS = {
  ask: MessageCircleQuestion,
  overview: BookOpen,
  quiz: Lightbulb,
  explain: GraduationCap,
  summary: FileText,
} satisfies Record<string, LucideIcon>;

export function ChatPanel({
  course,
  topic,
  chatId,
  partner,
  onChangePartner,
  autoAsk = null,
  studentName,
  remaining,
  onRemaining,
  onChatCreated,
  onChatActive,
  onChatRemoved,
  onCite,
  slideOpen,
  prefill,
  pulseDue,
  onQuestion,
  onPulseDone,
  plan,
  summariesLeft,
  premiumLimited,
  capCode,
  resetsAt,
  onLimit,
}: Props) {
  const p = PARTNERS[partner];
  const conversationId = useRef<string | null>(chatId);
  const summariesAsked = useRef(0); // summaries asked for in this chat panel
  const [loadingHistory, setLoadingHistory] = useState(!!chatId);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [left, setLeft] = useState(remaining);
  const [input, setInput] = useState("");
  const dictation = useDictation(setInput);
  // Set the moment Send (or a starter) is pressed, before the request starts streaming, so the
  // button reacts at once and a second press can't send the question twice.
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<Msg>({
        api: "/api/chat",
        // The server keeps the history; send only the new message and which chat it belongs to
        // (passed per message by submit()).
        // An edit (sendMessage with messageId) also says so: the server then replaces that
        // question and everything after it.
        prepareSendMessagesRequest: ({ messages, body, messageId }) => ({
          body: {
            conversation_id: body?.conversation_id,
            message: textOf(messages.at(-1)),
            message_id: messages.at(-1)?.id,
            ...(photosOf(messages.at(-1)).length ? { images: photosOf(messages.at(-1)) } : {}),
            edit: messageId != null,
            ...(body?.focus_slide ? { focus_slide: body.focus_slide } : {}),
          },
        }),
      }),
    [],
  );

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    stop,
    clearError,
  } = useChat<Msg>({
    transport,
    // UUIDs, so a question's id here is its id in the database (needed to edit it later).
    generateId: () => crypto.randomUUID(),
    onFinish: ({ message }) => {
      const r = message.metadata?.remaining;
      if (typeof r === "number") {
        setLeft(r);
        onRemaining(r);
      }
    },
  });

  // Load an existing chat's history.
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    fetch(`/api/conversations/${chatId}/messages`)
      .then(async (res) => {
        if (!res.ok)
          throw new Error(
            (await res.json()).error ?? "Couldn't load this chat.",
          );
        return res.json();
      })
      .then(({ messages: rows }) => {
        if (cancelled) return;
        setMessages(
          rows.map(
            (r: {
              id: string;
              role: "user" | "assistant";
              content: string;
              citations: CitationInfo[];
              feedback: { rating: 1 | -1; reason: string | null }[] | null;
            }) => ({
              id: r.id,
              role: r.role,
              parts: [{ type: "text", text: r.content }],
              metadata: { citations: r.citations, feedback: r.feedback?.[0] ?? null },
            }),
          ),
        );
      })
      .catch((e) => !cancelled && setHistoryError(e.message))
      .finally(() => !cancelled && setLoadingHistory(false));
    return () => {
      cancelled = true;
    };
    // Only on mount: the panel is remounted (new key) for a different chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Ask about this slide" from the preview: put the text in the box (during render, the React way
  // to adjust state when a prop changes), then focus it.
  const [seenPrefill, setSeenPrefill] = useState(prefill?.n);
  // The item an "Ask about this…" question is about: sent with it so the answer starts from that
  // exact slide/section/code part (several materials can share a title, e.g. three PlayerMovement.cs).
  const [focus, setFocus] = useState<{ key: string; text: string } | null>(null);
  if (prefill && prefill.n !== seenPrefill) {
    setSeenPrefill(prefill.n);
    setInput(prefill.text);
    setFocus(prefill.slideKey ? { key: prefill.slideKey, text: prefill.text.trim() } : null);
  }
  useEffect(() => {
    if (!prefill) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(
        prefill.text.length,
        prefill.text.length,
      );
    });
  }, [prefill]);

  // Follow the answer while it streams, until the student scrolls up to read: then leave them be
  // (before, any position within 160px of the bottom snapped back on every new chunk). Following
  // resumes when they scroll back to the bottom, press "Jump to latest", or send a question.
  const following = useRef(true);
  const lastTop = useRef(0);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const distanceFromBottom = (el: HTMLDivElement) => el.scrollHeight - el.scrollTop - el.clientHeight;
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (distanceFromBottom(el) < 24) following.current = true;
    else if (el.scrollTop < lastTop.current - 2) following.current = false; // moved up: reading
    lastTop.current = el.scrollTop;
    setAwayFromBottom(!following.current && distanceFromBottom(el) > 24);
  }
  const stopFollowing = (e: { deltaY?: number }) => {
    if ((e.deltaY ?? -1) < 0) following.current = false; // wheel/trackpad up, before the page moves
  };
  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    following.current = true;
    setAwayFromBottom(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !following.current) return;
    el.scrollTop = el.scrollHeight;
    lastTop.current = el.scrollTop;
  }, [messages, status]);

  // Questions sent after today's limit (owner, 19 Nov 2026): the box stays open; each one gets a
  // short reply naming the reset time instead of an answer. Shown here only, never sent or saved.
  const [capNotes, setCapNotes] = useState<{ id: string; text: string; reply: string }[]>([]);
  const busy = sending || status === "submitted" || status === "streaming";
  const errText = errorText(error);
  const limit = limitOf(error);
  const capped = left <= 0 || errText === DAILY_LIMIT || limit?.code === "daily_cap" || limit?.code === "premium_cap";
  // The cap the student is stopped by: the one just refused, or the one they arrived at.
  const lastCap = limit && (limit.code === "daily_cap" || limit.code === "premium_cap") ? limit : { code: capCode, resetsAt };
  useEffect(() => {
    if (!limit) {
      if (errText === DAILY_LIMIT) onRemaining(0);
      return;
    }
    // A plan limit or lock (PRD F12): the server refused before answering. Quiz and summary
    // requests leave nothing behind (the question wasn't saved); a reached cap stays shown.
    onLimit(limit.code, limit.resetsAt);
    // The server deleted the empty new chat this question would have opened: forget it here too.
    if (limit.chatRemoved && conversationId.current) {
      onChatRemoved(conversationId.current);
      conversationId.current = null;
    }
    if (limit.code === "quiz" || limit.code === "summary") {
      setMessages((prev) => (prev.at(-1)?.role === "user" ? prev.slice(0, -1) : prev));
      clearError();
    } else {
      onRemaining(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per refusal
  }, [error]);

  async function submit(raw: string) {
    const attached = photos;
    // "Ask about this slide" fills the box with `Explain slide 8 of "…": ` so a specific question can be
    // typed after the colon; sent as it is, the colon is left hanging, so it becomes a full stop.
    const text = raw.trim().replace(/:$/, ".") || (attached.length ? (attached.length === 1 ? "Explain this photo." : "Explain these photos.") : "");
    if (!text || busy) return;
    // Quiz mode is Finals only: on Free, show the Finals pop-up at once instead of starting an
    // answer the server would refuse (owner, 22 Nov 2026). The server still enforces it.
    if (plan === "free" && asksForQuiz(text)) {
      onLimit("quiz", null);
      return;
    }
    // Same for a summary once the free ones are used up (counted here too, for this visit).
    const wantsSummary = asksForSummary(text);
    if (wantsSummary && summariesLeft !== null && summariesLeft - summariesAsked.current <= 0) {
      onLimit("summary", null);
      return;
    }
    if (wantsSummary) summariesAsked.current++;
    if (capped) {
      setCapNotes((n) => [...n, { id: `cap-${Date.now()}`, text, reply: capReply(lastCap.code, lastCap.resetsAt, Date.now()) }]);
      setInput("");
      following.current = true;
      setAwayFromBottom(false);
      return;
    }
    setSending(true);
    try {
      clearError();
      if (!conversationId.current) {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            course_id: course.id,
            topic_id: topic?.id ?? null,
          }),
        });
        if (!res.ok) {
          setHistoryError("Couldn't start a new chat. Try again.");
          return;
        }
        const { conversation } = await res.json();
        conversationId.current = conversation.id;
        onChatCreated({ ...conversation, title: text.slice(0, 80) });
      } else {
        onChatActive(conversationId.current);
      }
      setInput("");
      onQuestion();
      following.current = true; // a new question: follow its answer
      setAwayFromBottom(false);
      // Still the question that opened from the viewer (its opening kept): say which item it's about.
      const focusSlide = focus && text.startsWith(focus.text.slice(0, -1)) ? focus.key : undefined;
      setFocus(null);
      setPhotos([]);
      setPhotoError(null);
      const pending = sendMessage(
        attached.length
          ? { text, files: attached.map((p, i) => ({ type: "file" as const, mediaType: "image/jpeg", url: p.url, filename: `photo-${i + 1}.jpg` })) }
          : { text },
        { body: { conversation_id: conversationId.current, ...(focusSlide ? { focus_slide: focusSlide } : {}) } },
      );
      setSending(false); // from here the chat status (submitted/streaming) shows progress
      await pending;
    } finally {
      setSending(false);
    }
  }

  // Edit an earlier question: the chat drops it and everything after it, then answers the new wording.
  async function editQuestion(id: string, raw: string) {
    const text = raw.trim();
    if (!text || busy || capped || !conversationId.current) return;
    clearError();
    onQuestion();
    await sendMessage({ text, messageId: id }, { body: { conversation_id: conversationId.current } });
  }

  // Photos for the next question (the + in the chat box, owner 21 Nov 2026).
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // A PDF from the + (owner, 22 Nov 2026): not sent with the question like a photo but saved as the
  // student's own pages (Uploads): read once in the background, then searched in this course's chats
  // as "your notes". The chip shows its progress; the student can keep asking meanwhile.
  const [pdfs, setPdfs] = useState<{ key: string; name: string; status: UploadStatus; note?: string }[]>([]);
  const setPdf = (key: string, patch: Partial<{ status: UploadStatus; note: string }>) =>
    setPdfs((list) => list.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  async function addPdf(file: File) {
    const key = crypto.randomUUID();
    const name = file.name.replace(/\.pdf$/i, "") || "My PDF";
    setPdfs((list) => [...list, { key, name, status: "uploading" }]);
    try {
      const id = await saveUpload(course.id, name, [file]);
      setPdf(key, { status: "reading" });
      // Reading takes about a minute; check every few seconds, for up to five minutes.
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const now = await uploadStatus(id);
        if (now.status === "ready") return setPdf(key, { status: "ready", note: now.pages ? `${now.pages} page${now.pages === 1 ? "" : "s"}` : undefined });
        if (now.status === "failed") return setPdf(key, { status: "failed", note: now.error ?? undefined });
      }
    } catch (e) {
      setPdf(key, { status: "failed", note: e instanceof Error ? e.message : "Couldn't upload it." });
    }
  }
  async function addPhotos(list: FileList | null) {
    setPhotoError(null);
    const files = Array.from(list ?? []);
    for (const f of files.filter((f) => f.type === "application/pdf").slice(0, 1)) void addPdf(f);
    const chosen = files.filter((f) => f.type.startsWith("image/"));
    if (!chosen.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (chosen.length > room) setPhotoError(`Up to ${MAX_PHOTOS} photos per question.`);
    try {
      const added = await Promise.all(chosen.slice(0, Math.max(0, room)).map(async (f) => ({ id: crypto.randomUUID(), url: await blobToDataUrl(await shrinkImage(f)) })));
      setPhotos((p) => [...p, ...added].slice(0, MAX_PHOTOS));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Couldn't add that photo.");
    }
  }

  // "Ask anything" from the dashboard: the question goes out once, as soon as the new chat is ready.
  const autoAsked = useRef(false);
  useEffect(() => {
    if (!autoAsk || autoAsked.current || chatId || loadingHistory) return;
    autoAsked.current = true;
    void submit(autoAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAsk, chatId, loadingHistory]);

  const last = messages.at(-1);
  // Once an answer has finished, its first cited slides load in the background, so a tap on a citation
  // opens at once. Touch screens have no hover to start loading early (owner, 23 Nov 2026).
  const lastAnswerText = status === "ready" && last?.role === "assistant" ? textOf(last) : "";
  // The recommend-us card after the 3rd answer of a day (lib/ui/use-helpful-ask.ts): not after an answer
  // that is waiting for the student's reply (a quiz or check question).
  const nps = useNpsAsk(lastAnswerText ? last!.id : null, !!lastAnswerText && !/\?\s*(<\/general>\s*)?$/.test(lastAnswerText.trim()));
  useEffect(() => {
    if (!lastAnswerText) return;
    const t = setTimeout(() => [...new Set(citedKeys(lastAnswerText))].slice(0, PREFETCH_CITED).forEach((k) => prefetchSlide(course.id, k)), 300);
    return () => clearTimeout(t);
  }, [lastAnswerText, course.id]);
  const waitingForWords =
    status === "submitted" ||
    (status === "streaming" &&
      (last?.role !== "assistant" || !textOf(last).trim()));

  // Each starter has a line icon (owner, 21 Nov 2026).
  const starters: { label: string; send: string | null; icon: keyof typeof STARTER_ICONS }[] = topic
    ? [
        { label: "Explain like I missed class", send: `Explain "${topic.title}" like I missed the class.`, icon: "explain" },
        { label: "Summarize this topic", send: `Summarize the topic "${topic.title}".`, icon: "summary" },
        { label: "Quiz me on this topic", send: `Quiz me on "${topic.title}".`, icon: "quiz" },
      ]
    : [
        { label: "Ask a question", send: null, icon: "ask" },
        { label: "Course overview", send: "Give me an overview of the whole course.", icon: "overview" },
        { label: "Quiz me", send: "Quiz me on this course.", icon: "quiz" },
      ];

  return (
    <div className="group/chat flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} onWheel={stopFollowing} onTouchMove={() => { following.current = false; }} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8">
          {loadingHistory && (
            <p className="text-sm text-muted">Loading chat…</p>
          )}
          {historyError && (
            <p role="alert" className="text-sm text-red-700">
              {historyError}
            </p>
          )}

          {!loadingHistory && messages.length === 0 && (
            <div className="flex flex-col items-center pt-[8vh] text-center">
              <PartnerCast partner={partner} onChangePartner={onChangePartner} />
              {/* The topic name in Bitter 400, #191919 (owner, 21 Nov 2026), at a modest size. */}
              <h2 className="mt-4 max-w-full break-words font-heading text-[22px] font-normal not-italic leading-[1.2] text-[#191919] dark:text-ink sm:text-[24px]">
                {topic ? topic.title : course.title}
              </h2>
              <p className="pop-in mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted">
                {/* Types itself out (owner, 22 Nov 2026). */}
                <Typewriter parts={[fill(pick(p.greetings, `${course.id}-${topic?.id ?? ""}`), studentName)]} delay={250} />
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {starters.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => (s.send ? submit(s.send) : inputRef.current?.focus())}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full bg-sunken/70 py-2 pl-3 pr-4 text-sm text-ink transition hover:bg-sunken active:scale-95 disabled:opacity-50"
                  >
                    {(() => {
                      const StarterIcon = STARTER_ICONS[s.icon];
                      return <StarterIcon size={16} absoluteStrokeWidth strokeWidth={1.5} className="shrink-0 text-brand" aria-hidden />;
                    })()}
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ol className="space-y-6">
            {messages.map((m, mi) =>
              m.role === "user" ? (
                <li key={m.id} data-message="user" className="flex flex-col items-end gap-2">
                  {photosOf(m).length > 0 && (
                    <div className="flex flex-wrap justify-end gap-2">
                      {photosOf(m).map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element -- the student's own photo (data URL)
                        <img key={i} src={url} alt={`Your photo ${i + 1}`} className="h-28 w-28 rounded-2xl object-cover ring-1 ring-line" />
                      ))}
                    </div>
                  )}
                  <UserMessage text={textOf(m)} canEdit={!busy && !capped && !photosOf(m).length} onEdit={(t) => editQuestion(m.id, t)} />
                </li>
              ) : (
                <li key={m.id} data-message="assistant" className="flex gap-3">
                  <Mascot partner={partner} size={28} animated={false} className="mt-0.5 hidden sm:block" />
                  <div className="min-w-0 flex-1">
                  <Answer
                    text={textOf(m)}
                    citations={m.metadata?.citations ?? []}
                    fallback={m.metadata?.fallback ?? null}
                    topicTitle={topic?.title ?? null}
                    courseName={courseName(course)}
                    courseId={course.id}
                    sortOrder={course.sort_order}
                    onCite={onCite}
                    partnerName={p.name}
                  />
                  {/* A visual question with the viewer closed: the cited slide itself, under the answer. */}
                  {!slideOpen && !(busy && m.id === last?.id) && VISUAL_ASK.test(textOf(messages[mi - 1])) && firstCited(textOf(m)) && (
                    <SlideThumb courseId={course.id} slideKey={firstCited(textOf(m))!} onOpen={onCite} />
                  )}
                  {m.metadata?.truncated && m.id === last?.id && !busy && <CutShort onContinue={() => submit(CONTINUE_TEXT)} disabled={capped} />}
                  {!(busy && m.id === last?.id) && <AnswerActions messageId={m.id} text={textOf(m)} initial={m.metadata?.feedback ?? null} />}
                  </div>
                </li>
              ),
            )}
          </ol>

          {capNotes.length > 0 && (
            <ol className="mt-6 space-y-6">
              {capNotes.map((n) => (
                <li key={n.id} className="space-y-6">
                  <div className="flex justify-end">
                    <UserMessage text={n.text} canEdit={false} onEdit={() => {}} />
                  </div>
                  <div className="flex gap-3" data-message="limit">
                    <Mascot partner={partner} size={28} animated={false} className="mt-0.5 hidden sm:block" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] leading-relaxed text-ink">{n.reply}</p>
                      {plan === "free" && (
                        <button
                          type="button"
                          onClick={() => onLimit(lastCap.code, lastCap.resetsAt)}
                          className="mt-3 rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-brand-ink transition hover:opacity-90 active:scale-95"
                        >
                          Get Finals
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {pulseDue && !busy && messages.length > 0 && (
            <PulseCard partner={partner} name={studentName} onDone={() => onPulseDone(true)} onLater={() => onPulseDone(false)} />
          )}

          {nps.show && <NpsCard onClose={nps.close} />}
          {waitingForWords && (
            <p className="mt-6 flex items-center gap-3 text-sm text-muted" role="status">
              <Mascot partner={partner} size={28} mood="thinking" />
              {/* Just "Thinking…" (owner, 23 Nov 2026: "Zara is pulling it together…" plus bouncing dots was too much). */}
              <span className="thinking-fade">Thinking…</span>
            </p>
          )}
          {errText && !capped && (
            <p
              role="alert"
              className="mt-4 text-sm text-red-700"
            >
              {errText}
            </p>
          )}
        </div>
      </div>
      {awayFromBottom && (status === "streaming" || status === "submitted") && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="pop-in absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-card px-4 py-2 text-[13px] text-ink shadow-lg ring-1 ring-line transition hover:bg-sunken"
        >
          Jump to latest ↓
        </button>
      )}
      </div>

      <div className="shrink-0 bg-page px-4 pb-4 pt-2">
        <form
          className="mx-auto w-full max-w-3xl lg:px-4"
          onSubmit={(e) => {
            e.preventDefault();
            dictation.stop();
            submit(input);
          }}
        >
            {(photos.length > 0 || pdfs.length > 0 || photoError) && (
              <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                {pdfs.map((d) => (
                  <span key={d.key} className="relative flex max-w-[280px] items-center gap-2.5 rounded-xl bg-card py-2 pl-2.5 pr-8 ring-1 ring-line" role="status">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-pau-100 text-brand">
                      {d.status === "uploading" || d.status === "reading" ? <Spinner /> : <FileText size={17} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-ink" title={d.name}>{d.name}</span>
                      <span className={`block text-[12px] leading-snug ${d.status === "failed" ? "text-red-700" : "text-muted"}`}>
                        {d.status === "uploading" ? "Uploading…" : d.status === "reading" ? "Reading your pages…" : d.status === "ready" ? `Ready${d.note ? ` · ${d.note}` : ""}: ask about it` : d.note ?? "Couldn't read it"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPdfs((list) => list.filter((x) => x.key !== d.key))}
                      aria-label="Hide"
                      className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"
                    >
                      <X size={13} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
                    </button>
                  </span>
                ))}
                {photos.map((p) => (
                  <span key={p.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (data URL) */}
                    <img src={p.url} alt="Photo to send" className="h-16 w-16 rounded-xl object-cover ring-1 ring-line" />
                    <button
                      type="button"
                      onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}
                      aria-label="Remove photo"
                      className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink text-page shadow transition active:scale-90"
                    >
                      <X size={13} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
                    </button>
                  </span>
                ))}
                {photoError && <span className="text-[13px] text-red-700">{photoError}</span>}
              </div>
            )}
            <div data-laptop-tour="chatbox" className="flex items-end gap-1.5 rounded-[28px] bg-sunken/70 py-2 pl-2 pr-2 transition focus-within:bg-sunken focus-within:ring-2 focus-within:ring-pau-200">
              {/* Add a photo (a test question, a diagram, notes): sent with this question. Or a PDF: saved
                  as the student's own pages and read in the background (addPdf). */}
              <input ref={photoInput} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                disabled={busy || photos.length >= MAX_PHOTOS}
                aria-label="Add a photo or PDF"
                title="Add a photo or PDF"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/70 transition hover:bg-black/5 hover:text-ink active:scale-90 disabled:opacity-40"
              >
                <Plus size={20} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    dictation.stop();
                    submit(input);
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder={
                  dictation.listening
                    ? "Listening… speak your question"
                    : topic
                      ? `Ask about ${topic.title}…`
                      : `Ask about ${course.title}…`
                }
                className="max-h-48 min-h-[28px] flex-1 resize-none self-center bg-transparent py-1.5 text-[15px] outline-none [field-sizing:content] placeholder:text-muted"
                aria-label="Your question"
              />
              {dictation.supported && !busy && (
                <button
                  type="button"
                  onClick={() => (dictation.listening ? dictation.stop() : dictation.start(input))}
                  aria-label={dictation.listening ? "Stop voice typing" : "Speak your question"}
                  aria-pressed={dictation.listening}
                  title={dictation.listening ? "Stop" : "Speak your question"}
                  className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:scale-90 ${
                    dictation.listening ? "mic-live bg-red-500 text-white" : "text-ink/70 hover:bg-black/5 hover:text-ink"
                  }`}
                >
                  {dictation.listening ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                      <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                      <rect x="7" y="2.5" width="6" height="10" rx="3" />
                      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
                    </svg>
                  )}
                </button>
              )}
              {busy ? (
                sending || status === "submitted" ? (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-brand-ink" role="status">
                    <Spinner className="h-4 w-4" />
                    <span className="sr-only">Sending</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => stop()}
                    aria-label="Stop"
                    title="Stop"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-page transition active:scale-90"
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="currentColor" />
                    </svg>
                  </button>
                )
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() && !photos.length}
                  aria-label="Send"
                  title="Send"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition hover:opacity-90 active:scale-90 disabled:bg-black/10 disabled:text-white dark:disabled:bg-white/15"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 19V5M6 11l6-6 6 6" />
                  </svg>
                </button>
              )}
            </div>
          <p className="mt-1.5 flex min-h-[16px] justify-between px-5 text-[11px] text-muted">
            {dictation.error ? (
              <span role="alert" className="text-red-700 dark:text-red-400">{dictation.error}</span>
            ) : dictation.listening ? (
              <span role="status" className="text-ink">Listening… tap the red button when you&apos;re done, then Send.</span>
            ) : (
              <span />
            )}
            {capped && <span>{lastCap.code === "premium_cap" ? "Premium limit reached" : "Daily limit reached"} · resets at midnight</span>}
            {!capped && (premiumLimited || left < 10) && (
              <span>
                {premiumLimited ? `${left} free question${left === 1 ? "" : "s"} left today` : `${left} message${left === 1 ? "" : "s"} left today`}
              </span>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
