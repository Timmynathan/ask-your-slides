"use client";

// Confirm before deleting the account: what goes, that it can't be undone, and type DELETE to enable
// the button (no accidental clicks). On success the student lands on sign-in with a notice.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "./spinner";

export function DeleteAccountDialog({ onClose }: { onClose(): void }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !inFlight.current && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const remove = async () => {
    if (typed !== "DELETE" || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't delete your account. Try again.");
      router.replace("/sign-in?deleted=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete your account. Try again.");
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4" onClick={() => !inFlight.current && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete your account"
        onClick={(e) => e.stopPropagation()}
        className="pop-in w-full max-w-md rounded-[28px] bg-page p-6 text-left shadow-xl"
      >
        <h2 className="text-[20px] text-ink">Delete your account?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          This permanently deletes your profile, all your chats and your ratings. It can&apos;t be undone. You can sign up again later
          with the same PAU email.
        </p>
        <label className="mt-5 block text-sm text-ink">
          Type <span className="font-semibold">DELETE</span> to confirm
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && remove()}
            autoComplete="off"
            aria-label="Type DELETE to confirm"
            className="mt-2 w-full rounded-full bg-sunken px-4 py-2.5 text-[15px] text-ink outline-none focus:ring-2 focus:ring-red-300"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full px-4 py-2 text-sm text-ink transition hover:bg-sunken disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={typed !== "DELETE" || busy}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 active:scale-95 disabled:opacity-40"
          >
            {busy && <Spinner className="h-3.5 w-3.5" />}
            {busy ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </div>
    </div>
  );
}
