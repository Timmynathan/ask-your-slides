import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { embedDocuments } from "@/lib/agent/embed";
import type { adminClient } from "@/lib/supabase/admin";
import { MAX_UPLOAD_PDF_PAGES } from "@/lib/plans/config";
import { chunks, splitPages } from "./pages";

// Reading a student's upload (owner, 20 Nov 2026): the photos (or the PDF) go to Claude, which writes
// out every page as text; the pages are split into chunks, embedded and stored for that student's
// chats in that course. Runs after the upload request has answered (next/server after()), so the
// student sees "Reading your pages…" and keeps studying. Cost is stored on the upload row.

type Db = ReturnType<typeof adminClient>;

const READ_MODEL = process.env.CHAT_MODEL || "claude-haiku-5-5";
// Same prices the chat uses (lib/agent/run.ts), per million tokens.
const USD_PER_MTOK = { input: 0.1, output: 0.5 };

export const READ_PAGES_PROMPT = `These are a student's own pages: photos or a scan of a test, past paper, worksheet or notes, possibly handwritten.
Write out the text of every page, in order, exactly as written. Do not answer, solve or correct anything.
- Start each page with a line "=== Page N ===".
- Keep question numbers, marks, headings and the student's own answers or working if present.
- Equations in LaTeX between double dollar signs; tables as Markdown tables; describe a diagram in one short line in [brackets].
- Anything you can't read: [unreadable].
- A page with no text: [no text].`;

export async function readUpload(db: Db, uploadId: string): Promise<void> {
  const { data: up } = await db.from("user_uploads").select("id, user_id, course_id, title, kind, files").eq("id", uploadId).single();
  if (!up) return;
  try {
    await db.from("user_uploads").update({ status: "reading", error: null }).eq("id", uploadId);
    const files = await Promise.all(
      (up.files as string[]).map(async (path) => {
        const { data, error } = await db.storage.from("uploads").download(path);
        if (error || !data) throw new Error(`Couldn't open ${path}`);
        return { bytes: new Uint8Array(await data.arrayBuffer()), type: data.type || (path.endsWith(".pdf") ? "application/pdf" : "image/jpeg") };
      }),
    );
    for (const f of files) {
      if (f.type !== "application/pdf") continue;
      // Rough page count from the PDF itself ("/Type /Page" objects, not "/Pages").
      const pdfPages = (new TextDecoder("latin1").decode(f.bytes).match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
      if (pdfPages > MAX_UPLOAD_PDF_PAGES) throw new Error(`This PDF has ${pdfPages} pages; the limit is ${MAX_UPLOAD_PDF_PAGES}.`);
    }
    const content = [
      ...files.map((f) =>
        f.type === "application/pdf"
          ? ({ type: "file" as const, data: f.bytes, mediaType: "application/pdf" })
          : ({ type: "image" as const, image: f.bytes, mediaType: f.type }),
      ),
      { type: "text" as const, text: READ_PAGES_PROMPT },
    ];
    const { text, usage } = await generateText({
      model: anthropic(READ_MODEL),
      messages: [{ role: "user", content }],
      maxOutputTokens: 16_000,
      providerOptions: { anthropic: { thinking: { type: "disabled" } } },
    });
    const cost = ((usage.inputTokens ?? 0) * USD_PER_MTOK.input + (usage.outputTokens ?? 0) * USD_PER_MTOK.output) / 1e6;

    const pages = splitPages(text);
    const pieces = pages.flatMap((p) => chunks(p.text).map((c) => ({ page: p.page, text: c })));
    if (pieces.length === 0) throw new Error("No text could be read from these pages.");
    const vectors = await embedDocuments(pieces.map((p) => `${up.title}, page ${p.page}\n${p.text}`));
    await db.from("user_upload_chunks").delete().eq("upload_id", uploadId);
    const { error: insertError } = await db.from("user_upload_chunks").insert(
      pieces.map((p, i) => ({
        upload_id: uploadId,
        user_id: up.user_id,
        course_id: up.course_id,
        page: p.page,
        chunk_text: p.text,
        embedding: JSON.stringify(vectors[i]),
      })),
    );
    if (insertError) throw new Error(insertError.message);
    await db.from("user_uploads").update({ status: "ready", pages: pages.length, cost_usd: Number(cost.toFixed(5)) }).eq("id", uploadId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("readUpload failed", uploadId, message);
    await db.from("user_uploads").update({ status: "failed", error: message.slice(0, 300) }).eq("id", uploadId);
  }
}
