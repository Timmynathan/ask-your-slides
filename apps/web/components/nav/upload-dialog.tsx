"use client";

// Upload your own pages (owner, 20 Nov 2026): pick the course, name it, add photos (camera or library)
// or one PDF. Photos are shrunk on the device first (long edge 1600 px, JPEG): a 3–5 MB phone photo
// becomes a few hundred KB, quicker on mobile data and the right size for reading. Files go straight
// to private storage through signed URLs; the server then reads them in the background.
import { useEffect, useRef, useState } from "react";
import { MAX_UPLOAD_PHOTOS } from "@/lib/plans/config";

const LONG_EDGE = 1600;

async function shrink(file: File): Promise<Blob> {
  if (file.type === "application/pdf") return file;
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`"${file.name}" can't be opened. Use a JPEG or PNG photo.`);
  });
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare that photo."))), "image/jpeg", 0.82));
}

export function UploadDialog({ courses, defaultCourseId, onClose, onDone }: { courses: { id: string; title: string }[]; defaultCourseId?: string; onClose(): void; onDone(): void }) {
  const [courseId, setCourseId] = useState(defaultCourseId && courses.some((c) => c.id === defaultCourseId) ? defaultCourseId : courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const pick = (list: FileList | null) => {
    setError(null);
    const chosen = Array.from(list ?? []);
    const pdf = chosen.find((f) => f.type === "application/pdf");
    if (pdf && chosen.length > 1) return setError("Upload one PDF on its own, or photos together.");
    if (chosen.length > MAX_UPLOAD_PHOTOS) return setError(`Up to ${MAX_UPLOAD_PHOTOS} photos at a time.`);
    setFiles(chosen);
    if (!title && chosen[0]) setTitle(pdf ? pdf.name.replace(/\.pdf$/i, "") : "My test photos");
  };

  async function upload() {
    if (!courseId || !files.length || !title.trim()) return;
    setError(null);
    try {
      setBusy("Preparing your pages…");
      const blobs = await Promise.all(files.map(shrink));
      setBusy("Uploading…");
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_id: courseId, title: title.trim(), files: blobs.map((b) => ({ type: b.type || "image/jpeg", size: b.size })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't start the upload.");
      await Promise.all(
        (body.uploads as string[]).map(async (url, i) => {
          const put = await fetch(url, { method: "PUT", headers: { "Content-Type": blobs[i].type || "image/jpeg", "x-upsert": "false" }, body: blobs[i] });
          if (!put.ok) throw new Error("A file didn't upload. Check your connection and try again.");
        }),
      );
      const read = await fetch(`/api/uploads/${body.id}/read`, { method: "POST" });
      if (!read.ok) throw new Error("Uploaded, but reading didn't start. Try again.");
      setDone(true);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const field = "h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-pau-200";
  const label = "mb-1.5 block text-[13px] font-medium text-ink";
  const removeFile = (i: number) => setFiles((f) => f.filter((_, j) => j !== i));
  const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="upload-title" className="pop-in w-full max-w-[440px] rounded-[24px] bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-pau-100 text-brand">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h2 id="upload-title" className="mt-4 font-heading text-xl text-ink">Reading your pages…</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
              This takes a minute. It will show under My files, and your study partner will use it in that course&apos;s chats.
            </p>
            <button type="button" onClick={onClose} className="mt-6 h-12 w-full rounded-full bg-brand text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98]">
              OK
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="upload-title" className="font-heading text-xl text-ink">Upload your own pages</h2>
                <p className="mt-1 text-[13.5px] leading-snug text-muted">Photos of a test or your notes, or a PDF. Only you can see them.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={!!busy}
                aria-label="Close"
                className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink disabled:opacity-40"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="upload-course" className={label}>
                  Course
                </label>
                {/* Our own arrow, with room on the right: the browser's sat against the edge. */}
                <div className="relative">
                  <select id="upload-course" value={courseId} onChange={(e) => setCourseId(e.target.value)} className={`${field} cursor-pointer appearance-none truncate pr-11`}>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              <div>
                <label htmlFor="upload-name" className={label}>
                  Name
                </label>
                <input id="upload-name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. CSC 420 mid-semester test" className={field} />
              </div>

              <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
              {files.length === 0 ? (
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-line-strong px-4 py-7 text-center transition hover:border-brand hover:bg-pau-50/50"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-pau-100 text-brand">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                  </span>
                  <span className="mt-3 text-[15px] font-medium text-ink">Take or choose photos</span>
                  <span className="mt-0.5 text-[12.5px] text-muted">Up to {MAX_UPLOAD_PHOTOS} photos, or one PDF</span>
                </button>
              ) : (
                <div className="rounded-2xl bg-sunken/60 p-2">
                  <ul className="max-h-44 space-y-1 overflow-y-auto">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-pau-100 text-brand">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            {f.type === "application/pdf" ? <path d="M7 3.5h7l4 4V20.5H7zM14 3.5v4h4" /> : <path d="M4 6h16v12H4zM4 15l4.5-4 3.5 3 2.5-2L20 16" />}
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-ink">{f.name}</span>
                          <span className="block text-[12px] text-muted">{kb(f.size)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          disabled={!!busy}
                          aria-label={`Remove ${f.name}`}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                            <path d="M6 6l12 12M18 6 6 18" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => input.current?.click()} disabled={!!busy} className="mt-1 w-full rounded-xl py-2 text-[13.5px] font-medium text-brand transition hover:bg-card">
                    Choose different files
                  </button>
                </div>
              )}
            </div>

            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={onClose} disabled={!!busy} className="h-12 flex-1 rounded-full text-[15px] text-ink ring-1 ring-line-strong transition hover:bg-sunken disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={upload}
                disabled={!!busy || !files.length || !title.trim() || !courseId}
                className="h-12 flex-1 rounded-full bg-brand text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ?? "Upload"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
