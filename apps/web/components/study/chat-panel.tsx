"use client";

import { LIMIT_CODES, type LimitCode } from "@/components/plans/pricing-sheet";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CitationInfo } from "@/lib/study/format";
import type { ChatItem, CourseItem, TopicItem } from "@/lib/study/types";
import { Mascot } from "@/components/mascot/mascot";
import { Spinner } from "@/components/ui/spinner";
import { fill, PARTNERS, pick, type PartnerId } from "@/lib/partners";
import { Answer } from "./answer";
import { AnswerActions, type Rating } from "./answer-actions";
import { PulseCard } from "./pulse-card";
import { UserMessage } from "./user-message";
import { useDictation } from "@/lib/ui/use-dictation";
import { courseName } from "@/lib/study/course-code";

type Meta = {
  citations?: CitationInfo[];
  fallback?: { topic: string; used: boolean } | null;
  remaining?: number;
  feedback?: Rating;
};
type Msg = UIMessage<Meta>;

const DAILY_LIMIT = "Daily limit reached. Resets at midnight (WAT).";

interface Props {
  course: CourseItem;
  topic: TopicItem | null;
  chatId: string | null;
  partner: PartnerId;
  studentName: string | null;
  remaining: number;
  /** The server's count after each answer, so the allowance survives switching chats. */
  onRemaining(remaining: number): void;
  onChatCreated(chat: ChatItem): void;
  onChatActive(id: string): void;
  onCite(slideKey: string): void;
  prefill: { text: string; n: number; slideKey?: string } | null;
  /** "Is this helping you study?": due after the 10th question, until answered (or "Not now"). */
  pulseDue: boolean;
  onQuestion(): void;
  onPulseDone(answered: boolean): void;
  /** PRD F12. */
  plan: "free" | "finals";
  /** Free + premium course: "free questions" wording. */
  premiumLimited: boolean;
  /** The limit already reached, if the student arrives capped. */
  capCode: "daily_cap" | "premium_cap";
  resetsAt: string;
  /** A limit or lock stopped the student: open the pricing sheet. */
  onLimit(code: LimitCode, resetsAt: string | null): void;
}

function textOf(m: Msg | undefined): string {
  return (m?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
}

/** The server's refusal code (lib/plans/gate.ts), if this error is a plan limit or lock. */
function limitOf(e: Error | undefined): { code: LimitCode; resetsAt: string | null } | null {
  if (!e) return null;
  try {
    const j = JSON.parse(e.message) as { code?: string; resets_at?: string | null };
    return LIMIT_CODES.includes(j.code as LimitCode) ? { code: j.code as LimitCode, resetsAt: j.resets_at ?? null } : null;
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

export function ChatPanel({
  course,
  topic,
  chatId,
  partner,
  studentName,
  remaining,
  onRemaining,
  onChatCreated,
  onChatActive,
  onCite,
  prefill,
  pulseDue,
  onQuestion,
  onPulseDone,
  plan,
  premiumLimited,
  capCode,
  resetsAt,
  onLimit,
}: Props) {
  const p = PARTNERS[partner];
  const conversationId = useRef<string | null>(chatId);
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
    if (limit.code === "quiz" || limit.code === "summary") {
      setMessages((prev) => (prev.at(-1)?.role === "user" ? prev.slice(0, -1) : prev));
      clearError();
    } else {
      onRemaining(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per refusal
  }, [error]);

  async function submit(raw: string) {
    const text = raw.trim();
    if (!text || busy || capped) return;
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
      const pending = sendMessage(
        { text },
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

  const last = messages.at(-1);
  const waitingForWords =
    status === "submitted" ||
    (status === "streaming" &&
      (last?.role !== "assistant" || !textOf(last).trim()));

  const starters = topic
    ? [
        {
          label: "Explain like I missed class",
          send: `Explain "${topic.title}" like I missed the class.`,
        },
        {
          label: "Summarize this topic",
          send: `Summarize the topic "${topic.title}".`,
        },
        {
          label: "Quiz me on this topic",
          send: `Quiz me on "${topic.title}".`,
        },
      ]
    : [
        { label: "Ask a question", send: null },
        {
          label: "Course overview",
          send: "Give me an overview of the whole course.",
        },
        { label: "Quiz me", send: "Quiz me on this course." },
      ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
            <div className="flex flex-col items-center pt-[10vh] text-center">
              <Mascot partner={partner} size={76} mood="happy" />
              <h2 className="mt-5 text-[28px] font-normal tracking-tight text-ink">{topic ? topic.title : course.title}</h2>
              <p className="pop-in mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted">
                {fill(pick(p.greetings, `${course.id}-${topic?.id ?? ""}`), studentName)}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {starters.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => (s.send ? submit(s.send) : inputRef.current?.focus())}
                    disabled={capped || busy}
                    className="rounded-full bg-sunken/70 px-4 py-2 text-sm text-ink transition hover:bg-sunken active:scale-95 disabled:opacity-50"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ol className="space-y-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} data-message="user" className="flex justify-end">
                  <UserMessage text={textOf(m)} canEdit={!busy && !capped} onEdit={(t) => editQuestion(m.id, t)} />
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
                  {!(busy && m.id === last?.id) && <AnswerActions messageId={m.id} text={textOf(m)} initial={m.metadata?.feedback ?? null} />}
                  </div>
                </li>
              ),
            )}
          </ol>

          {pulseDue && !busy && messages.length > 0 && (
            <PulseCard partner={partner} name={studentName} onDone={() => onPulseDone(true)} onLater={() => onPulseDone(false)} />
          )}

          {waitingForWords && (
            <p className="mt-6 flex items-center gap-3 text-sm text-muted" role="status">
              <Mascot partner={partner} size={28} mood="thinking" />
              <span className="flex items-center gap-1.5">
                {pick(p.thinking, String(messages.length))}
                <span className="sr-only">Searching your slides…</span>
                <span className="flex gap-0.5" aria-hidden>
                  <span className="h-1 w-1 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
                  <span className="h-1 w-1 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
                  <span className="h-1 w-1 animate-bounce rounded-full bg-muted" />
                </span>
              </span>
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
          {capped ? (
            <div className="flex items-center gap-3 rounded-[28px] bg-sunken/70 px-4 py-3 text-sm text-ink">
              <Mascot partner={partner} size={36} />
              <p className="min-w-0 flex-1">
                {fill(p.capped, studentName)}
                <span className="sr-only"> {DAILY_LIMIT}</span>
              </p>
              {plan === "free" && (
                <button
                  type="button"
                  onClick={() => onLimit(lastCap.code, lastCap.resetsAt)}
                  className="shrink-0 rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-brand-ink transition hover:opacity-90 active:scale-95"
                >
                  Get Finals
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-end gap-1.5 rounded-[28px] bg-sunken/70 py-2 pl-5 pr-2 transition focus-within:bg-sunken focus-within:ring-2 focus-within:ring-pau-200">
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
                  disabled={!input.trim()}
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
          )}
          <p className="mt-1.5 flex min-h-[16px] justify-between px-5 text-[11px] text-muted">
            {dictation.error ? (
              <span role="alert" className="text-red-700 dark:text-red-400">{dictation.error}</span>
            ) : dictation.listening ? (
              <span role="status" className="text-ink">Listening… tap the red button when you&apos;re done, then Send.</span>
            ) : (
              <span />
            )}
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
