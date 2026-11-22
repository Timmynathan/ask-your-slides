"use client";

// Saving a student's own pages from the browser (owner, 22 Nov 2026: the chat box's + takes PDFs too):
// ask the server for signed upload URLs, put each file straight into private storage, then start the
// background reading (lib/uploads/process.ts). Throws with a message the student can read.

export type UploadStatus = "uploading" | "reading" | "ready" | "failed";

export async function saveUpload(courseId: string, title: string, blobs: Blob[]): Promise<string> {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course_id: courseId, title: title.trim().slice(0, 120), files: blobs.map((b) => ({ type: b.type || "image/jpeg", size: b.size })) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Couldn't start the upload.");
  await Promise.all(
    (body.uploads as string[]).map(async (url, i) => {
      const put = await fetch(url, { method: "PUT", headers: { "Content-Type": blobs[i].type || "image/jpeg", "x-upsert": "false" }, body: blobs[i] });
      if (!put.ok) throw new Error("The file didn't upload. Check your connection and try again.");
    }),
  );
  const read = await fetch(`/api/uploads/${body.id}/read`, { method: "POST" });
  if (!read.ok) throw new Error("Uploaded, but reading didn't start. Try again.");
  return body.id as string;
}

/** The upload's status now (the background reading moves it from "reading" to "ready" or "failed"). */
export async function uploadStatus(id: string): Promise<{ status: UploadStatus; error: string | null; pages: number | null }> {
  const res = await fetch("/api/uploads", { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { uploads?: { id: string; status: UploadStatus; error: string | null; pages: number | null }[] };
  const up = body.uploads?.find((u) => u.id === id);
  return up ? { status: up.status, error: up.error, pages: up.pages } : { status: "failed", error: "Upload not found.", pages: null };
}
