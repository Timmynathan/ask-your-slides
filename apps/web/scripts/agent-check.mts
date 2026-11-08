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
    check(/^\s*your slides don't cover this, but here's the idea:/i.test(a.text), "starts with \"Your slides don't cover this, but here's the idea:\"", a.text.slice(0, 70));
    check(outsideGeneral(a.text).replace(/your slides don't cover this, but here's the idea:/i, "").trim().length < 40 && (a.text.match(/<general>([\s\S]*?)<\/general>/)?.[1].length ?? 0) > 400,
      "then answers properly (not briefly), inside <general>", `${a.text.length} chars`);
    check(/<general>[\s\S]+<\/general>/.test(a.text), "general knowledge is inside <general>");

    console.log("\n5b. Thin slides teach, not refuse (CSC419 › Backend development)");
    const c5b = await newChat("CSC419", "Backend development");
    a = await ask(c5b, "Explain authorization.");
    standardChecks(a, "CSC419");
    check(/your slides only outline this/i.test(a.text.slice(0, 200)), "opens with \"Your slides only outline this…\"", a.text.slice(0, 80).replace(/\n/g, " "));
    const taught = [...a.text.matchAll(/<general>([\s\S]*?)<\/general>/g)].map((m) => m[1]).join("").length;
    check(taught > 500, "explains each point fully in <general>", `${taught} chars of explanation`);

    console.log("\n5c. 'Explain like I missed class' (CSC420 › Transactions and indexing)");
    const c5c = await newChat("CSC420", "Transactions and indexing");
    a = await ask(c5c, 'Explain "Transactions and indexing" like I missed the class.');
    standardChecks(a, "CSC420");
    const taught2 = [...a.text.matchAll(/<general>([\s\S]*?)<\/general>/g)].map((m) => m[1]).join("").length;
    check(keys(a).length >= 4 && taught2 > 400, "anchors on the slides and teaches beyond them", `${new Set(keys(a)).size} slides cited, ${taught2} chars of explanation`);

    console.log("\n6. Summary of a lecture (INS401 › Managing project risk)");
    const c6 = await newChat("INS401");
    a = await ask(c6, "Summarize the lecture on managing project risk.");
    standardChecks(a, "INS401");
    check((a.trace?.tool_calls ?? []).some((t: any) => t.name === "get_material_pages"), "read the material in order (get_material_pages)");
    const nums = keys(a).filter((k) => k.startsWith("INS401-10-")).map((k) => Number(k.split("-")[2]));
    const { data: risk } = await admin.from("materials").select("page_count").eq("lms_cmid", 84705).single();
    const spread = nums.length ? (Math.max(...nums) - Math.min(...nums) + 1) / risk!.page_count : 0;
    check(spread >= 0.5, "citations span the deck, not just the first slides", `slides ${Math.min(...nums)}–${Math.max(...nums)} of ${risk!.page_count}`);

    console.log("\n6b. Topic summary across all of the topic's decks (INS401 › Managing project teams)");
    const c6b = await newChat("INS401", "Managing project teams");
    a = await ask(c6b, "Summarize this topic.");
    standardChecks(a, "INS401");
    const { data: teamMats } = await admin.from("materials").select("material_order, kind, topics!inner(title), courses!inner(code)")
      .eq("courses.code", "INS401").eq("topics.title", "Managing project teams").in("kind", ["slides", "notes"]);
    const teamPrefixes = (teamMats ?? []).map((m: any) => `INS401-${String(m.material_order).padStart(2, "0")}-`);
    check(teamPrefixes.length >= 2 && teamPrefixes.every((p) => keys(a).some((k) => k.startsWith(p))),
      "a topic summary cites every deck in the topic (F5)", `${teamPrefixes.join(" ")} vs ${[...new Set(keys(a).map((k) => k.split("-").slice(0, 2).join("-")))].join(" ")}`);

    console.log("\n6c. Course overview (CSC419: outline + one section per topic)");
    const c6c = await newChat("CSC419");
    a = await ask(c6c, "Give me an overview of the whole course.");
    standardChecks(a, "CSC419");
    const { data: c419 } = await admin.from("materials").select("material_order, kind, topic_id, courses!inner(code)").eq("courses.code", "CSC419");
    const byOrder = new Map((c419 ?? []).map((m: any) => [String(m.material_order).padStart(2, "0"), m]));
    const citedTopics = new Set(keys(a).map((k) => byOrder.get(k.split("-")[1])?.topic_id).filter(Boolean));
    const topicCount = new Set((c419 ?? []).map((m: any) => m.topic_id).filter(Boolean)).size;
    check(citedTopics.size >= topicCount, "the overview covers every topic (F5)", `${citedTopics.size} of ${topicCount} topics cited`);
    const outlineKeys = (c419 ?? []).filter((m: any) => m.kind === "outline").map((m: any) => `CSC419-${String(m.material_order).padStart(2, "0")}`);
    const toolText = JSON.stringify(a.trace?.tool_calls ?? []);
    check(outlineKeys.some((o) => keys(a).some((k) => k.startsWith(o + "-")) || toolText.includes(o)), "the overview uses the course outline (F5)", outlineKeys.join(" "));
    // A section starts with a heading, or a bold title at the start of a line ("**1. Deployment.** …").
    const headings = (a.text.match(/^\s*(#{1,4} |\*\*[^*]+\*\*|\d+\.\s+\*\*)/gm) ?? []).length;
    check(headings >= topicCount, "one section per topic", `${headings} section headings for ${topicCount} topics` + (headings >= topicCount ? "" : `\n${a.text.slice(0, 900)}`));

    console.log("\n7. Quiz (CSC402 › Privacy)");
    const c7 = await newChat("CSC402", "Privacy");
    a = await ask(c7, "Quiz me on contextual integrity.");
    standardChecks(a, "CSC402", { expectCitations: false });
    const questions = (outsideGeneral(a.text).match(/\?/g) ?? []).length;
    check(questions >= 1 && questions <= 3, "asks a question (one at a time)", `${questions} question marks`);
    check(!/^\s*\**(the )?(correct )?answer\**\s*(is|:)/im.test(a.text) && !/correct answer is/i.test(a.text), "does not reveal the answer", a.text.slice(0, 160).replace(/\n/g, " "));
    // The student answers; the partner marks it and cites the slide with the right answer (F6).
    a = await ask(c7, "I think it means information should only flow in ways that match the norms of the context it was shared in.");
    standardChecks(a, "CSC402");
    check(/\b(correct|right|spot on|exactly|well done|good|partly|partially|not quite|incorrect|close)\b/i.test(outsideGeneral(a.text).slice(0, 400)), "marks the student's answer", a.text.slice(0, 120).replace(/\n/g, " "));

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
  console.log(failures ? `\n${failures} check(s) failed` : "\nAgent check (phases 4 and 6): all checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
