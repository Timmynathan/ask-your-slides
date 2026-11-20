// Splitting a read-out upload into pages and chunks (lib/uploads/process.ts). Pure, so it's tested.

export const CHUNK_CHARS = 1200;

/** "=== Page N ===" sections → pages; blank "[no text]" pages dropped; no markers → one page. */
export function splitPages(text: string): { page: number; text: string }[] {
  const parts = text.split(/^===\s*Page\s+(\d+)\s*===\s*$/im);
  const pages: { page: number; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const body = (parts[i + 1] ?? "").trim();
    if (body && !/^\[no text\]$/i.test(body)) pages.push({ page: Number(parts[i]), text: body });
  }
  if (pages.length === 0 && text.trim()) pages.push({ page: 1, text: text.trim() });
  return pages;
}

/** Page-sized pieces of at most CHUNK_CHARS, split on blank lines where possible. */
export function chunks(page: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const para of page.split(/\n\s*\n/)) {
    if (cur && (cur + "\n\n" + para).length > CHUNK_CHARS) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${para}` : para;
    while (cur.length > CHUNK_CHARS * 1.5) {
      out.push(cur.slice(0, CHUNK_CHARS));
      cur = cur.slice(CHUNK_CHARS);
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

