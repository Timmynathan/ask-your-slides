"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CitationInfo } from "@/lib/study/format";
import type { ChatItem, CourseItem, TopicItem } from "@/lib/study/types";
import { Spinner } from "@/components/ui/spinner";
import { Answer } from "./answer";

type Meta = {
  citations?: CitationInfo[];
  fallback?: { topic: string; used: boolean } | null;
  remaining?: number;
};
type Msg = UIMessage<Meta>;

const DAILY_LIMIT = "Daily limit reached. Resets at midnight (WAT).";

interface Props {
  course: CourseItem;
  topic: TopicItem | null;
  chatId: string | null;
  remaining: number;
  /** The server's count after each answer, so the allowance survives switching chats. */
  onRemaining(remaining: number): void;
  onChatCreated(chat: ChatItem): void;
  onChatActive(id: string): void;
  onCite(slideKey: string): void;
  prefill: { text: string; n: number } | null;
}

function textOf(m: Msg | undefined): string {
  return (m?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
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
  remaining,
  onRemaining,
  onChatCreated,
  onChatActive,
  onCite,
  prefill,
}: Props) {
  const conversationId = useRef<string | null>(chatId);
  const [loadingHistory, setLoadingHistory] = useState(!!chatId);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [left, setLeft] = useState(remaining);
  const [input, setInput] = useState("");
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
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            conversation_id: body?.conversation_id,
            message: textOf(messages.at(-1)),
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
            }) => ({
              id: r.id,
              role: r.role,
              parts: [{ type: "text", text: r.content }],
              metadata: { citations: r.citations },
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
  if (prefill && prefill.n !== seenPrefill) {
    setSeenPrefill(prefill.n);
    setInput(prefill.text);
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

  // Follow the answer while it streams, unless the student has scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160)
      el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const busy = sending || status === "submitted" || status === "streaming";
  const errText = errorText(error);
  const capped = left <= 0 || errText === DAILY_LIMIT;
  useEffect(() => {
    if (errText === DAILY_LIMIT) onRemaining(0);
  }, [errText, onRemaining]);

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
      const pending = sendMessage(
        { text },
        { body: { conversation_id: conversationId.current } },
      );
      setSending(false); // from here the chat status (submitted/streaming) shows progress
      await pending;
    } finally {
      setSending(false);
    }
  }

  const last = messages.at(-1);
  const waitingForWords =
    status === "submitted" ||
    (status === "streaming" &&
      (last?.role !== "assistant" || !textOf(last).trim()));

  const starters = topic
    ? [
        { label: `Ask about ${topic.title}`, send: null },
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
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8">
          {loadingHistory && (
            <p className="text-sm text-neutral-500">Loading chat…</p>
          )}
          {historyError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {historyError}
            </p>
          )}

          {!loadingHistory && messages.length === 0 && (
            <div className="pt-[8vh] text-center">
              <h2 className="text-xl font-semibold tracking-tight">
                {topic ? topic.title : course.title}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-400">
                {topic
                  ? "Answers come from this topic's slides first, with a citation for every point."
                  : "Answers come from this course's slides, with a citation for every point."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {starters.map((s) => (
                  <button
                    key={s.label}
                    onClick={() =>
                      s.send ? submit(s.send) : inputRef.current?.focus()
                    }
                    disabled={capped || busy}
                    className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-400 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
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
                <li key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5 text-[15px] leading-relaxed dark:bg-neutral-800">
                    {textOf(m)}
                  </div>
                </li>
              ) : (
                <li key={m.id}>
                  <Answer
                    text={textOf(m)}
                    citations={m.metadata?.citations ?? []}
                    fallback={m.metadata?.fallback ?? null}
                    topicTitle={topic?.title ?? null}
                    courseCode={course.code}
                    sortOrder={course.sort_order}
                    onCite={onCite}
                  />
                </li>
              ),
            )}
          </ol>

          {waitingForWords && (
            <p
              className="mt-6 flex items-center gap-2 text-sm text-neutral-500"
              role="status"
            >
              <span
                className="inline-block h-2 w-2 animate-pulse rounded-full bg-neutral-400"
                aria-hidden
              />
              Searching your slides…
            </p>
          )}
          {errText && !capped && (
            <p
              role="alert"
              className="mt-4 text-sm text-red-700 dark:text-red-400"
            >
              {errText}
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
        <form
          className="mx-auto w-full max-w-3xl lg:px-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          {capped ? (
            <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              {DAILY_LIMIT}
            </p>
          ) : (
            <div className="flex items-end gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 focus-within:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-within:border-neutral-300">
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
                    submit(input);
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder={
                  topic
                    ? `Ask about ${topic.title}…`
                    : `Ask about ${course.title}…`
                }
                className="max-h-48 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[15px] outline-none [field-sizing:content] placeholder:text-neutral-400"
                aria-label="Your question"
              />
              {busy ? (
                sending || status === "submitted" ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white opacity-80 dark:bg-white dark:text-neutral-900"
                    role="status"
                  >
                    <Spinner className="h-3.5 w-3.5" />
                    Sending
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => stop()}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Stop
                  </button>
                )
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  Send
                </button>
              )}
            </div>
          )}
          <p className="mt-1.5 flex justify-between text-[11px] text-neutral-500">
            <span className="hidden sm:inline">
              Enter to send · Shift+Enter for a new line
            </span>
            {!capped && left < 10 && (
              <span>
                {left} message{left === 1 ? "" : "s"} left today
              </span>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
