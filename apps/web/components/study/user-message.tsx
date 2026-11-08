"use client";

// A sent question, with "Edit" and "Copy" under it (on hover with a mouse, always on touch screens),
// like ChatGPT and Claude. Editing turns the bubble into a box; "Send" replaces this question and
// everything after it with a fresh answer to the new wording.
import { useEffect, useRef, useState } from "react";

export function UserMessage({
  text,
  canEdit,
  onEdit,
}: {
  text: string;
  /** False while an answer is coming or the daily limit is reached. */
  canEdit: boolean;
  onEdit(text: string): void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = box.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const send = () => {
    const next = draft.trim();
    if (!next || !canEdit) return;
    setEditing(false);
    if (next !== text.trim()) onEdit(next);
  };

  if (editing) {
    return (
      <form
        className="w-full max-w-[85%] rounded-[22px] bg-sunken p-3 ring-2 ring-pau-200"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={box}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(text);
              setEditing(false);
            } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={4000}
          aria-label="Edit your question"
          className="max-h-60 min-h-[44px] w-full resize-none bg-transparent px-1 text-[15px] leading-relaxed text-ink outline-none [field-sizing:content]"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft(text);
              setEditing(false);
            }}
            className="rounded-full px-3.5 py-1.5 text-sm text-ink transition hover:bg-black/5 active:scale-95 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!draft.trim() || !canEdit}
            className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-medium text-brand-ink transition hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="group flex max-w-[85%] flex-col items-end">
      <div className="whitespace-pre-wrap rounded-[22px] bg-sunken px-4 py-2.5 text-[15px] leading-relaxed text-ink">{text}</div>
      <div className="mt-1 flex gap-0.5 text-muted opacity-100 transition-opacity focus-within:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
        <IconButton
          label={copied ? "Copied" : "Copy question"}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {}
          }}
        >
          {copied ? (
            <path d="M5 12.5 10 17.5 19 7" />
          ) : (
            <path d="M8.5 8.5V5.5A1.5 1.5 0 0 1 10 4h8.5A1.5 1.5 0 0 1 20 5.5V14a1.5 1.5 0 0 1-1.5 1.5h-3M5.5 8.5H14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 14 20H5.5A1.5 1.5 0 0 1 4 18.5V10a1.5 1.5 0 0 1 1.5-1.5Z" />
          )}
        </IconButton>
        {canEdit && (
          <IconButton
            label="Edit question"
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
          >
            <path d="M14.5 5.5 18.5 9.5M4 20l1-4.5L15.5 5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19 4 20Z" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-sunken hover:text-ink active:scale-90"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
