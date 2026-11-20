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

  const field = "mt-1.5 w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-[15px] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-pau-200";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-5" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="upload-title" className="pop-in w-full max-w-md rounded-[22px] bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center">
            <h2 id="upload-title" className="font-heading text-xl text-ink">Reading your pages…</h2>
            <p className="mt-2 text-[15px] text-muted">
              This takes a minute. Keep studying: it will show under My files, and your study partner will use it in that course&apos;s chats.
            </p>
            <button type="button" onClick={onClose} className="mt-6 w-full rounded-full bg-brand py-3 text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98]">
              OK
            </button>
          </div>
        ) : (
          <>
            <h2 id="upload-title" className="font-heading text-xl text-ink">Upload your own pages</h2>
            <p className="mt-1 text-[14px] text-muted">Photos of a test or your notes, or a PDF. Your study partner will use them in that course&apos;s chats. Only you can see them.</p>

            <label className="mt-5 block text-sm font-medium text-ink">
              Course
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={field}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block text-sm font-medium text-ink">
              Name
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. CSC 420 mid-semester test" className={field} />
            </label>

            <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="mt-4 flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-line-strong px-4 py-6 text-center transition hover:border-brand"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-brand" aria-hidden>
                <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <span className="text-[15px] font-medium text-ink">{files.length ? `${files.length} ${files.length === 1 ? "file" : "files"} chosen` : "Take or choose photos"}</span>
              <span className="text-[12.5px] text-muted">Up to {MAX_UPLOAD_PHOTOS} photos, or one PDF</span>
            </button>

            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={onClose} disabled={!!busy} className="flex-1 rounded-full py-3 text-[15px] text-ink ring-1 ring-line-strong transition hover:bg-sunken disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={upload}
                disabled={!!busy || !files.length || !title.trim() || !courseId}
                className="flex-1 rounded-full bg-brand py-3 text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
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
