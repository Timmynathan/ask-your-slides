"use client";

// The sidebar's Upload button until uploading your own notes is built (owner's plan, step 4): a small
// dialog that says what is coming, so the button is never a dead end.
import { useEffect } from "react";

export function UploadSoon({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="upload-title" className="pop-in w-full max-w-sm rounded-[22px] bg-card p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-pau-100 text-brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" />
          </svg>
        </span>
        <h2 id="upload-title" className="mt-4 font-heading text-xl text-ink">Upload your own notes</h2>
        <p className="mt-2 text-[15px] text-muted">Coming soon: add your own notes or slides to a course, and your study partner will use them in its answers.</p>
        <button type="button" onClick={onClose} className="mt-6 w-full rounded-full bg-brand py-3 text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98]">
          OK
        </button>
      </div>
    </div>
  );
}
