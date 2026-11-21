"use client";

// Upload your own pages (owner, 20 Nov 2026): pick the course, name it, add photos (camera or library)
// or one PDF. Photos are shrunk on the device first (long edge 1600 px, JPEG): a 3–5 MB phone photo
// becomes a few hundred KB, quicker on mobile data and the right size for reading. Files go straight
// to private storage through signed URLs; the server then reads them in the background.
import { useEffect, useRef, useState } from "react";
import { MAX_UPLOAD_PHOTOS } from "@/lib/plans/config";
import { shrinkImage } from "@/lib/ui/shrink-image";
import { Camera, Check, ChevronDown, FileText, Image as ImageIcon, X } from "lucide-react";

async function shrink(file: File): Promise<Blob> {
  return file.type === "application/pdf" ? file : shrinkImage(file);
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
              <Check size={22} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
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
                <X size={18} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
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
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted">
                    <ChevronDown size={18} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
                  </span>
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
                    <Camera size={22} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
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
                          {f.type === "application/pdf" ? <FileText size={16} absoluteStrokeWidth strokeWidth={1.5} aria-hidden /> : <ImageIcon size={16} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />}
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
                          <X size={15} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
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
