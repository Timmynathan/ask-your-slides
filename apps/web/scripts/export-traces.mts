// Proofline export (PRD §15, F9): one JSON line per assistant turn.
//   npm run export:traces -- --since 2026-11-21 [--until 2026-12-05] [--out evals/exports/x.jsonl]
// Format: evals/README.md. Output contains student questions: it goes to evals/exports/ (git-ignored).
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { scoreTrace } from "../lib/evals/checks.mts";

const ROOT = path.resolve(import.meta.dirname, "../../..");
if (existsSync(path.join(ROOT, ".env"))) process.loadEnvFile(path.join(ROOT, ".env"));

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const since = arg("since");
const until = arg("until");
if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  console.error("Usage: npm run export:traces -- --since YYYY-MM-DD [--until YYYY-MM-DD] [--out file.jsonl]");
  process.exit(1);
}
const out = path.resolve(ROOT, arg("out") ?? `evals/exports/traces-${since}${until ? `-to-${until}` : ""}.jsonl`);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Stable pseudonym per student: Proofline can group by student without seeing who they are.
const salt = process.env.SUPABASE_SECRET_KEY!.slice(-16);
const pseudonym = (id: string | null) => (id ? createHash("sha256").update(salt + id).digest("hex").slice(0, 16) : null);

const rows: any[] = [];
for (let from = 0; ; from += 1000) {
  let q = db
    .from("traces")
    .select("*, courses(code, title), conversations(topic_id, topics(title))")
    .gte("created_at", `${since}T00:00:00+01:00`) // WAT
    .order("created_at")
    .range(from, from + 999);
  if (until) q = q.lt("created_at", `${until}T00:00:00+01:00`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  rows.push(...data);
  if (data.length < 1000) break;
}

const messageIds = rows.map((r) => r.message_id).filter(Boolean);
const feedback = new Map<string, unknown[]>();
for (let i = 0; i < messageIds.length; i += 500) {
  const { data } = await db.from("feedback").select("message_id, rating, reason, comment, created_at").in("message_id", messageIds.slice(i, i + 500));
  for (const f of data ?? []) feedback.set(f.message_id, [...(feedback.get(f.message_id) ?? []), f]);
}

const lines = rows.map((r) =>
  JSON.stringify({
    schema: "pau-study-assistant/trace@1",
    id: r.id,
    created_at: r.created_at,
    model: r.model,
    input: {
      user_message: r.user_message,
      course: r.courses?.code ?? null,
      topic: r.conversations?.topics?.title ?? null,
      conversation_id: r.conversation_id,
      student: pseudonym(r.user_id),
      history_length: r.history_length,
    },
    tool_calls: r.tool_calls,
    retrieved_slide_keys: r.retrieved_slide_ids,
    output: { text: r.output_text, citations: r.citations, invalid_citations_removed: r.invalid_citations },
    metrics: {
      input_tokens: r.input_tokens, output_tokens: r.output_tokens, cache_read_tokens: r.cache_read_tokens,
      cache_write_tokens: r.cache_write_tokens, cost_usd: Number(r.cost_usd), latency_ms: r.latency_ms, ttft_ms: r.ttft_ms,
    },
    errors: r.errors,
    feedback: feedback.get(r.message_id) ?? [],
    checks: scoreTrace(r, r.courses?.code ?? ""),
  }),
);

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n") + (lines.length ? "\n" : ""));
console.log(`${lines.length} traces → ${path.relative(ROOT, out)}`);
