"use client";

// The general chat on the right of the dashboard (owner, 20 Nov 2026), wide screens only. Before the
// first question: the study partner greets the student with a typed line ("Hi Tolu, I'm Zara.") that
// erases itself and becomes "How can I help?", the other partners pop out from behind while the pointer is over the chat, "Change character" opens the partner
// picker, and suggestion chips fill the question box. A question goes to /api/chat/general, which
// picks the student's course whose slides match best and answers through that course's chat (same
// citations and plan limits). Each answer says which course it's from, with a link to continue the
// chat inside the course. "New chat" starts over.
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { Answer } from "@/components/study/answer";
import { PARTNER_IDS, PARTNERS, type PartnerId } from "@/lib/partners";
import type { CitationInfo } from "@/lib/study/format";

type Meta = { citations?: CitationInfo[]; fallback?: { topic: string; used: boolean } | null; remaining?: number };
type Msg = UIMessage<Meta>;
interface Picked {
  conversationId: string;
  courseId: string;
  label: string;
  href: string;
}

const SUGGESTIONS = ["What should I revise first?", "Quiz me on my courses", "Explain a hard topic simply", "Summarise a lecture for me"];

const textOf = (m: Msg | undefined) => (m?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join("");

/** The greeting in one place (owner, 20 Nov 2026): types `first`, holds it, erases it, then types
 *  `last`, which stays. */
function useGreeting(first: string, last: string) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    let cancelled = false;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      await wait(500);
      for (let i = 1; i <= first.length && !cancelled; i++) {
        setShown(first.slice(0, i));
        await wait(42);
      }
      await wait(1400);
      for (let i = first.length - 1; i >= 0 && !cancelled; i--) {
        setShown(first.slice(0, i));
        await wait(18);
      }
      await wait(250);
      for (let i = 1; i <= last.length && !cancelled; i++) {
        setShown(last.slice(0, i));
        await wait(48);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [first, last]);
  return shown;
}

/** `panel`: the column on the right of the dashboard (wide screens). `page`: the full Chat page from the
 *  sidebar (owner, 21 Nov 2026), on every screen size. */
export function GeneralChatPanel({
  partner,
  firstName,
  onChangePartner,
  variant = "panel",
}: {
  partner: PartnerId;
  firstName: string | null;
  onChangePartner(): void;
  variant?: "panel" | "page";
}) {
  const page = variant === "page";
  const router = useRouter();
  const p = PARTNERS[partner];
  const hello = `Hi${firstName ? ` ${firstName}` : ""}, I'm ${p.name}.`;
  const greeting = useGreeting(hello, "How can I help?");
  const others = PARTNER_IDS.filter((id) => id !== partner);

  // The course this chat was routed to (from the first answer's response headers).
  const [picked, setPicked] = useState<Picked | null>(null);
  const pickedRef = useRef<Picked | null>(null);
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<Msg>({
        api: "/api/chat/general",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            message: textOf(messages.at(-1)),
            message_id: messages.at(-1)?.id,
            ...(pickedRef.current ? { conversation_id: pickedRef.current.conversationId } : {}),
          },
        }),
        // Read which course answered from the first response's headers.
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const id = res.headers.get("x-conversation-id");
          if (id && !pickedRef.current) {
            const next = {
              conversationId: id,
              courseId: res.headers.get("x-course-id") ?? "",
              label: decodeURIComponent(res.headers.get("x-course-label") ?? ""),
              href: decodeURIComponent(res.headers.get("x-course-href") ?? "/dashboard"),
            };
            pickedRef.current = next;
            setPicked(next);
          }
          if (!res.ok) {
            const body = await res.clone().json().catch(() => null);
            throw new Error(body?.error ?? "Something went wrong. Please try again.");
          }
          return res;
        },
      }),
    [],
  );
  const { messages, setMessages, sendMessage, status, error, clearError, stop } = useChat<Msg>({
    transport,
    generateId: () => crypto.randomUUID(),
    // The new chat appears under Recent chats in the sidebar.
    onFinish: () => router.refresh(),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const q = draft.trim();
    if (!q || busy) return;
    clearError();
    setDraft("");
    void sendMessage({ text: q });
  };
  const newChat = () => {
    stop();
    setMessages([]);
    pickedRef.current = null;
    setPicked(null);
    clearError();
  };

  return (
    <aside
      className={page ? "group/chat flex h-[100dvh] flex-col bg-page md:h-dvh" : "group/chat fixed inset-y-0 right-0 z-20 hidden w-[380px] flex-col border-l border-line bg-page xl:flex"}
      aria-label="Chat with your study partner"
    >
      {messages.length > 0 && (
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Mascot partner={partner} size={30} animated={false} />
          <span className="flex-1 truncate text-[15px] font-medium text-ink">{p.name}</span>
          <button type="button" onClick={newChat} className="rounded-full px-3 py-1.5 text-[13px] text-ink ring-1 ring-line transition hover:bg-sunken active:scale-95">
            New chat
          </button>
        </div>
      )}

      <div ref={scroller} className={`min-h-0 flex-1 overflow-y-auto px-5 pb-4 ${page ? "pt-14 sm:pt-20" : "pt-8"}`}>
        <div className={page ? "mx-auto w-full max-w-2xl" : ""}>
        {messages.length === 0 ? (
          <>
            {/* The partner, with the others peeking out from behind */}
            <div className="relative mx-auto h-[112px] w-[150px]">
              {others.map((id, i) => {
                // Final spot, and the offset back to the centre: each one waits hidden behind the chosen
                // partner, and all slide out together while the pointer is over the chat (owner, 20 Nov 2026).
                const spot = [
                  { left: 8, top: 54, size: 38 },
                  { left: 104, top: 52, size: 38 },
                  { left: 92, top: 0, size: 34 },
                ][i];
                const dx = 75 - (spot.left + spot.size / 2);
                const dy = 56 - (spot.top + spot.size / 2);
                return (
                  <span
                    key={id}
                    className="absolute z-0 [transform:translate(var(--dx),var(--dy))_scale(0.5)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform group-focus-within/chat:[transform:none] group-hover/chat:[transform:none] motion-reduce:transition-none"
                    style={{ left: spot.left, top: spot.top, ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` }}
                  >
                    <Mascot partner={id} size={spot.size} animated={false} />
                  </span>
                );
              })}
              <span className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                <Mascot partner={partner} size={96} mood="happy" animated={false} />
              </span>
            </div>
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={onChangePartner}
                // Shown with the other partners, while the pointer is over the chat.
                className="translate-y-1 rounded-full bg-sunken px-3 py-1 text-[12.5px] text-muted opacity-0 transition-[opacity,transform,color] duration-300 ease-out hover:text-ink focus:translate-y-0 focus:opacity-100 active:scale-95 group-hover/chat:translate-y-0 group-hover/chat:opacity-100"
              >
                Change character
              </button>
            </div>
            <h2 className="mt-6 min-h-[1.4em] text-center font-heading text-[26px] text-ink" aria-label="How can I help?">
              {greeting}
              <span className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[2px] animate-pulse bg-ink/70 align-baseline" aria-hidden />
            </h2>
            <p className="mx-auto mt-2 max-w-[17rem] text-center text-[13px] text-muted">Ask about any of your courses. I&apos;ll find the right slides.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setDraft(s);
                    box.current?.focus();
                  }}
                  className="rounded-full bg-card px-3.5 py-2 text-[13.5px] text-ink ring-1 ring-line transition hover:ring-brand active:scale-95"
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        ) : (
          <ol className="space-y-5">
            {picked && (
              <li className="rounded-2xl bg-sunken/70 px-3.5 py-2.5 text-[12.5px] text-muted">
                From <span className="font-medium text-ink">{picked.label}</span>.{" "}
                <Link href={picked.href} className="font-medium text-brand underline-offset-4 hover:underline">
                  Continue in the course
                </Link>
              </li>
            )}
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-[18px] rounded-br-md bg-brand px-4 py-2.5 text-[14.5px] text-brand-ink">{textOf(m)}</p>
                </li>
              ) : (
                <li key={m.id} className="text-[14.5px]">
                  <Answer
                    text={textOf(m)}
                    citations={m.metadata?.citations ?? []}
                    fallback={m.metadata?.fallback ?? null}
                    topicTitle={null}
                    courseName={picked?.label.split(" · ")[0] ?? "your course"}
                    courseId={picked?.courseId ?? ""}
                    sortOrder={0}
                    // A cited slide opens in the course, in this chat.
                    onCite={() => picked && router.push(picked.href)}
                    partnerName={p.name}
                  />
                </li>
              ),
            )}
            {status === "submitted" && (
              <li className="flex items-center gap-2 text-[13.5px] text-muted">
                <Mascot partner={partner} size={24} mood="thinking" animated={false} />
                {p.name} is finding the right slides…
              </li>
            )}
            {error && <li className="rounded-2xl bg-red-50 px-4 py-3 text-[13.5px] text-red-800">{error.message}</li>}
          </ol>
        )}
        </div>
      </div>

      <form onSubmit={send} className={`m-4 rounded-[22px] bg-card p-2 ring-1 ring-line-strong focus-within:ring-brand ${page ? "sm:mx-auto sm:mb-6 sm:w-full sm:max-w-2xl" : ""}`}>
        <textarea
          ref={box}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) send(e);
          }}
          rows={2}
          placeholder={`Ask ${p.name} anything about your courses…`}
          aria-label="Your question"
          className="w-full resize-none bg-transparent px-3 py-2 text-[15px] text-ink outline-none placeholder:text-muted"
        />
        <div className="flex justify-end">
          {busy ? (
            <button type="button" onClick={() => stop()} aria-label="Stop" className="grid h-9 w-9 place-items-center rounded-full bg-brand text-brand-ink transition hover:opacity-90 active:scale-90">
              <span className="h-3 w-3 rounded-sm bg-current" />
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim()} aria-label="Send" className="grid h-9 w-9 place-items-center rounded-full bg-brand text-brand-ink transition hover:opacity-90 active:scale-90 disabled:opacity-40">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
