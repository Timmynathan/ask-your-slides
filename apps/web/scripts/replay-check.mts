// Replays real questions that went badly (owner's answer review, 21 Nov 2026) on the live site and
// checks the new answers. Each case re-creates the original conversation up to that question for a
// throwaway student in the same programme and level, asks the question again, and checks the
// answer: the case's own must / mustNot patterns plus the general rules (no "slides only outline
// this", no talk about searching, no citations inside <general>, no stripped citations, no apology
// opening). The cases hold students' real questions, so they live in data/ (never committed).
// Costs about half a US cent per case (Haiku). Every throwaway student is deleted afterwards.
//
//   npm run check:replay                  all cases in data/evals/replay-cases.json
//   npm run check:replay -- 90 130        only these cases
// Answers and results are written to data/evals/replay-results.json for reading.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { judge } from "../lib/evals/answer-rules.mts";

const ROOT = path.resolve(import.meta.dirname, "../../..");
process.loadEnvFile(path.join(ROOT, ".env"));
const BASE = process.env.E2E_BASE_URL ?? "https://askyourslides.com";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

type Case = { id: number; student: string; when: string; question: string; what: string; must?: string[]; mustNot?: string[] };
const only = process.argv.slice(2).map(Number).filter(Boolean);
const cases = (JSON.parse(readFileSync(path.join(ROOT, "data/evals/replay-cases.json"), "utf8")) as Case[]).filter((c) => !only.length || only.includes(c.id));

async function run(c: Case) {
  // The original question, its conversation and everything said before it.
  const { data: hits } = await db.from("messages").select("id, conversation_id, user_id, created_at").eq("role", "user").eq("content", c.question).gte("created_at", `${c.when}:00`).lte("created_at", `${c.when}:59.999`);
  const orig = hits?.[0];
  if (!orig) return { id: c.id, error: "original question not found" };
  const { data: convo } = await db.from("conversations").select("course_id, topic_id").eq("id", orig.conversation_id).single();
  const { data: before } = await db.from("messages").select("role, content, created_at").eq("conversation_id", orig.conversation_id).lt("created_at", orig.created_at).order("created_at");
  const { data: who } = await db.from("profiles").select("programme, level, department, study_partner").eq("id", orig.user_id).single();

  const email = `replay-${c.id}-${Date.now()}@pau.edu.ng`;
  let userId = "";
  try {
    await db.auth.admin.createUser({ email, email_confirm: true });
    const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
    const res = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: link.properties!.email_otp }) });
    if (!res.ok) throw new Error(`sign-in ${res.status}`);
    const cookie = res.headers.getSetCookie().map((x) => x.split(";")[0]).join("; ");
    const { data: me } = await db.from("profiles").select("id").eq("email", email).single();
    userId = me!.id;
    const up = await db.from("profiles").update({ onboarded: true, display_name: c.student, study_partner: who?.study_partner ?? "ada", programme: who?.programme, level: who?.level, department: who?.department }).eq("id", userId);
    if (up.error) throw up.error;
    const { data: conv, error } = await db.from("conversations").insert({ user_id: userId, course_id: convo!.course_id, topic_id: convo!.topic_id }).select("id").single();
    if (error) throw error;
    const start = Date.now() - 3600_000;
    if (before?.length) {
      const ins = await db.from("messages").insert(
        before.map((m, i) => ({ conversation_id: conv!.id, user_id: userId, role: m.role, content: m.content, created_at: new Date(start + i * 60_000).toISOString() })),
      );
      if (ins.error) throw ins.error;
    }
    const t0 = Date.now();
    const r = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ conversation_id: conv!.id, message: c.question }) });
    const body = await r.text();
    await new Promise((done) => setTimeout(done, 4000)); // the trace is written after the stream ends
    const { data: tr } = await db.from("traces").select("output_text, output_tokens, cost_usd, errors").eq("conversation_id", conv!.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const answer: string = tr?.output_text ?? "";
    const { fails, warnings } = judge({ answer, httpOk: r.ok, body, errors: (tr?.errors ?? []) as { code: string }[], must: c.must, mustNot: c.mustNot });
    return { id: c.id, what: c.what, pass: !fails.length, fails, warnings, secs: Math.round((Date.now() - t0) / 1000), tokens: tr?.output_tokens, cost: tr?.cost_usd, question: c.question, answer };
  } finally {
    if (userId) await db.auth.admin.deleteUser(userId);
  }
}

// Three at a time: quick, and gentle on the live site.
const results: Awaited<ReturnType<typeof run>>[] = [];
for (let i = 0; i < cases.length; i += 3) results.push(...(await Promise.all(cases.slice(i, i + 3).map((c) => run(c).catch((e) => ({ id: c.id, error: String(e) }))))));
writeFileSync(path.join(ROOT, "data/evals/replay-results.json"), JSON.stringify(results, null, 1));
let cost = 0;
for (const r of results) {
  if ("error" in r && r.error) console.log(`#${r.id} ERROR ${r.error}`);
  else if ("pass" in r) {
    cost += Number(r.cost ?? 0);
    console.log(`#${r.id} ${r.pass ? "PASS" : "FAIL"} ${r.what}${r.fails?.length ? ` — ${r.fails.join("; ")}` : ""}${r.warnings?.length ? ` [warn: ${r.warnings.join("; ")}]` : ""} (${r.secs}s)`);
  }
}
const passed = results.filter((r) => "pass" in r && r.pass).length;
console.log(`\n${passed}/${results.length} passed · cost $${cost.toFixed(4)} · answers in data/evals/replay-results.json`);
