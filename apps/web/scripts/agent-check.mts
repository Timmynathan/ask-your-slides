// Phase 4 proof: real questions through the real /api/chat (real model, real slides), checked
// against PRD §10/§15. Signs in a temporary student (no email sent) and deletes it, with its
// conversations and traces, at the end. Costs about $0.01 in model calls.
//
//   npm run build && npm run check:agent
//   E2E_BASE_URL=http://localhost:3000 npm run check:agent   # against a running server
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT_ENV = path.resolve(import.meta.dirname, "../../../.env");
if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
const PORT = 3600 + Math.floor(Math.random() * 300);
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── tiny harness ──────────────────────────────────────────────────────────────
let failures = 0;
const warnings: string[] = [];
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
function note(label: string) {
  console.log(`  note ${label}`);
}

let cookie = "";
async function post(url: string, body: unknown) {
  return fetch(`${BASE}${url}`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(body) });
}

interface Answer {
  status: number;
  text: string;
  metadata: Record<string, any> | null;
  error?: string;
  trace: Record<string, any> | null;
}

async function ask(conversationId: string, message: string): Promise<Answer> {
  const res = await post("/api/chat", { conversation_id: conversationId, message });
  if (!res.ok) return { status: res.status, text: "", metadata: null, error: (await res.json()).error, trace: null };
  let text = "";
  let metadata: Record<string, any> | null = null;
  let error: string | undefined;
  for (const line of (await res.text()).split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const part = JSON.parse(line.slice(6));
    if (part.type === "text-delta") text += part.delta;
    if (part.messageMetadata) metadata = { ...(metadata ?? {}), ...part.messageMetadata };
    if (part.type === "error") error = part.errorText;
  }
  // The trace is written in onEnd, right after the stream closes.
  let trace = null;
  for (let i = 0; i < 20 && !trace; i++) {
    const { data } = await admin.from("traces").select("*").eq("conversation_id", conversationId)
      .eq("user_message", message).order("created_at", { ascending: false }).limit(1).maybeSingle();
    trace = data;
    if (!trace) await new Promise((r) => setTimeout(r, 300));
  }
  if (process.env.AGENT_CHECK_DUMP) {
    appendFileSync(process.env.AGENT_CHECK_DUMP, `\n\n=== Q: ${message}\n--- tools: ${(trace?.tool_calls ?? []).map((t: any) => `${t.name}(${JSON.stringify(t.input)}) ${t.detail?.scope_used ?? ""}`).join("; ")}\n--- answer:\n${text}\n`);
  }
  return { status: res.status, text, metadata, error, trace };
}

// ── deterministic checks (PRD §15): shared with the Proofline export ────────────
import { citedKeys, outsideGeneral, uncitedSentences } from "../lib/evals/checks.mts";
const keys = (a: Answer) => citedKeys(a.text);

function standardChecks(a: Answer, courseCode: string, opts: { expectCitations?: boolean } = {}) {
  check(a.status === 200 && !a.error, "answer streamed", a.error ?? String(a.status));
  const t = a.trace;
  check(!!t, "trace row written");
  if (!t) return;
  const tools: { name: string }[] = t.tool_calls ?? [];
  check(tools.length > 0, "a retrieval tool ran before answering", tools.map((x) => x.name).join(", "));
  const retrieved = new Set<string>(t.retrieved_slide_ids ?? []);
  check(keys(a).every((k) => retrieved.has(k)), "every shown citation was retrieved this turn");
  check(keys(a).every((k) => k.startsWith(`${courseCode}-`)), "every citation is in the chat's course");
  if (opts.expectCitations !== false) check(keys(a).length > 0, "answer cites the slides", `${new Set(keys(a)).size} slides`);
  if ((t.invalid_citations ?? []).length) note(`invalid citations removed by the server: ${t.invalid_citations.join(", ")}`);
  const uncited = uncitedSentences(a.text);
  if (uncited.length) warnings.push(`${courseCode}: ${uncited.length} uncited sentence(s) outside <general>: "${uncited[0].slice(0, 90)}…"`);
  const toolMs = (t.tool_calls ?? []).map((x: any) => `${x.name} ${x.latency_ms}ms`).join(", ");
  note(`tools: ${toolMs}`);
  note(`ttft ${t.ttft_ms} ms, total ${t.latency_ms} ms, ${t.input_tokens} in / ${t.output_tokens} out, $${t.cost_usd}, cache read ${t.cache_read_tokens}`);
}

// ── fixtures ──────────────────────────────────────────────────────────────────
async function ids(code: string, topic?: string) {
  const { data: c } = await admin.from("courses").select("id").eq("code", code).single();
  if (!topic) return { courseId: c!.id as string, topicId: null };
  const { data: t } = await admin.from("topics").select("id").eq("course_id", c!.id).eq("title", topic).single();
  return { courseId: c!.id as string, topicId: t!.id as string };
}
async function newChat(code: string, topic?: string) {
  const { courseId, topicId } = await ids(code, topic);
  const res = await post("/api/conversations", { course_id: courseId, topic_id: topicId });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`create conversation: ${res.status} ${JSON.stringify(body)}`);
  return body.conversation.id as string;
}

async function signIn(email: string) {
  await admin.auth.admin.createUser({ email, email_confirm: true });
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const res = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: data.properties!.email_otp }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const { data: u } = await admin.from("profiles").select("id").eq("email", email).single();
  return u!.id as string;
}

async function cleanup(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = data?.users.find((x) => x.email === email);
  if (!u) return;
  await admin.from("traces").delete().eq("user_id", u.id); // traces outlive users by design; test ones shouldn't
  await admin.auth.admin.deleteUser(u.id); // cascades to profile, conversations, messages, usage
}

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try { await fetch(`${BASE}/sign-in`); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error("server did not start");
}

// ── run ───────────────────────────────────────────────────────────────────────
async function main() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/SUPABASE|ANTHROPIC|VOYAGE|DATABASE_URL|PRIVACY/.test(k)) delete env[k];
  const server = process.env.E2E_BASE_URL ? null : spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore", env,
  });
  const email = `agent-check-${Date.now()}@pau.edu.ng`;
  if (process.env.AGENT_CHECK_DUMP) writeFileSync(process.env.AGENT_CHECK_DUMP, `agent-check ${new Date().toISOString()}\n`);
  try {
    await waitForServer();
    const userId = await signIn(email);

    console.log("\n1. Whole-course question (CSC420)");
    const c1 = await newChat("CSC420");
    let a = await ask(c1, "What is a B+ tree index and why do databases use it?");
    standardChecks(a, "CSC420");
    check(keys(a).some((k) => k.startsWith("CSC420-02-")), "cites the Transactions and Indexing slides", keys(a).join(" "));

    console.log("\n2. Follow-up in the same chat (history)");
    a = await ask(c1, "How is that different from a hash index?");
    standardChecks(a, "CSC420");
    check(a.trace?.history_length === 2, "previous turn sent as history", String(a.trace?.history_length));

    console.log("\n3. Topic chat, question inside the topic (CSC420 › Transactions and indexing)");
    const c3 = await newChat("CSC420", "Transactions and indexing");
    a = await ask(c3, "What does ACID stand for?");
    standardChecks(a, "CSC420");
    const search3 = (a.trace?.tool_calls ?? []).find((t: any) => t.name === "search_slides");
    check(search3?.detail?.scope_used === "topic", "searched the topic, no fallback", JSON.stringify(search3?.detail?.scope_used));
    check(a.metadata?.fallback?.used === false, "no fallback label", JSON.stringify(a.metadata?.fallback));

    console.log("\n4. Topic chat, question from another topic → labelled fallback");
    a = await ask(c3, "What's the difference between a function and a stored procedure?");
    standardChecks(a, "CSC420");
    const search4 = (a.trace?.tool_calls ?? []).find((t: any) => t.name === "search_slides");
    check(search4?.detail?.scope_used === "course_fallback", "server widened to the whole course (not the model)", JSON.stringify(search4?.input) + " " + search4?.detail?.scope_used);
    check(keys(a).some((k) => k.startsWith("CSC420-05-")), "cites the Functions, procedures and triggers slides", keys(a).join(" "));
    check(a.metadata?.fallback?.used === true, "server sends the fallback label", JSON.stringify(a.metadata?.fallback));

    console.log("\n5. Not in the slides (CSC418 IoT)");
    const c5 = await newChat("CSC418");
    a = await ask(c5, "How does proof-of-stake consensus work in Ethereum?");
    standardChecks(a, "CSC418", { expectCitations: false });
    check(/^\s*your slides don't cover this/i.test(a.text), "starts with \"Your slides don't cover this.\"", a.text.slice(0, 60));
    check(/<general>[\s\S]+<\/general>/.test(a.text), "general knowledge is inside <general>");

    console.log("\n6. Summary of a lecture (INS401 › Managing project risk)");
    const c6 = await newChat("INS401");
    a = await ask(c6, "Summarize the lecture on managing project risk.");
    standardChecks(a, "INS401");
    check((a.trace?.tool_calls ?? []).some((t: any) => t.name === "get_material_pages"), "read the material in order (get_material_pages)");
    const nums = keys(a).filter((k) => k.startsWith("INS401-10-")).map((k) => Number(k.split("-")[2]));
    const { data: risk } = await admin.from("materials").select("page_count").eq("lms_cmid", 84705).single();
    const spread = nums.length ? (Math.max(...nums) - Math.min(...nums) + 1) / risk!.page_count : 0;
    check(spread >= 0.5, "citations span the deck, not just the first slides", `slides ${Math.min(...nums)}–${Math.max(...nums)} of ${risk!.page_count}`);

    console.log("\n7. Quiz (CSC402 › Privacy)");
    const c7 = await newChat("CSC402", "Privacy");
    a = await ask(c7, "Quiz me on contextual integrity.");
    standardChecks(a, "CSC402", { expectCitations: false });
    const questions = (outsideGeneral(a.text).match(/\?/g) ?? []).length;
    check(questions >= 1 && questions <= 3, "asks a question (one at a time)", `${questions} question marks`);
    check(!/^\s*\**(the )?(correct )?answer\**\s*(is|:)/im.test(a.text) && !/correct answer is/i.test(a.text), "does not reveal the answer", a.text.slice(0, 160).replace(/\n/g, " "));

    console.log("\n8. Reading with a repaired (OCR) text layer (CSC402 Nissenbaum)");
    const c8 = await newChat("CSC402");
    a = await ask(c8, "What does Nissenbaum argue about relying on use regulation instead of collection limits?");
    standardChecks(a, "CSC402");
    check(keys(a).some((k) => k.startsWith("CSC402-08-")), "cites the Nissenbaum reading", keys(a).join(" "));

    console.log("\n9. Guards");
    let res = await post("/api/chat", { conversation_id: crypto.randomUUID(), message: "hi" });
    check(res.status === 404, "someone else's / unknown conversation → 404", String(res.status));
    const before = (await admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", c1)).count;
    await admin.from("usage_daily").update({ message_count: 1000 }).eq("user_id", userId);
    res = await post("/api/chat", { conversation_id: c1, message: "One more?" });
    const body = await res.json();
    check(res.status === 429 && body.error === "Daily limit reached. Resets at midnight (WAT).", "daily cap blocks with the PRD message", `${res.status} ${body.error}`);
    const after = (await admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", c1)).count;
    check(before === after, "nothing saved or sent to the model when capped");
    res = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: c1, message: "x" }) });
    check(res.status === 401, "signed-out request → 401", String(res.status));

    console.log("\n10. Proofline export (before cleanup)");
    const { execFileSync } = await import("node:child_process");
    const { readFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const outFile = path.join(tmpdir(), `traces-check-${Date.now()}.jsonl`);
    const today = new Date(Date.now() + 3600_000).toISOString().slice(0, 10); // WAT date
    execFileSync("node", [path.resolve(import.meta.dirname, "export-traces.mts"), "--since", today, "--out", outFile], { stdio: "ignore" });
    const lines = readFileSync(outFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    rmSync(outFile);
    const ours = lines.filter((l) => typeof l.input.user_message === "string" && l.output);
    check(ours.length >= 8, "export has a line per answer (8 answers above)", `${ours.length} lines`);
    const sample = ours.find((l) => l.input.topic === "Transactions and indexing");
    check(!!sample && !!sample.checks && sample.checks.retrieval_before_answer && sample.checks.citations_in_retrieved, "lines carry topic, deterministic checks and metrics", JSON.stringify(sample?.checks));
    check(ours.every((l) => !String(l.input.student ?? "").includes("-")), "student ids are pseudonymised", String(sample?.input.student));
  } finally {
    await cleanup(email);
    server?.kill();
  }
  if (warnings.length) {
    console.log("\nWarnings (heuristic, for review — not failures):");
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nPhase 4 agent check: all checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
