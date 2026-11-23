// Behaviour check (owner, 23 Nov 2026, option A): does the live bot still follow its rules?
//
// Runs the committed cases in evals/behaviour/cases.json against the live site. They are questions we
// wrote (the repository is public, so no student's real question goes in it), each with what the answer
// must and must not contain, plus the general rules every answer is held to (lib/evals/answer-rules.mts).
// Each case gets a throwaway student in the case's programme, which is deleted afterwards.
// About half a US cent per case (Haiku), so about 5 cents a run.
//
//   npm run check:behaviour                    every case, against https://askyourslides.com
//   npm run check:behaviour -- calculation     only these cases (by id)
//   E2E_BASE_URL=http://localhost:3000 npm run check:behaviour
//
// Runs by itself after a deploy that changes the bot (.github/workflows/behaviour-check.yml).
// Exit code 1 if any case fails, so the commit gets a red cross and GitHub emails the owner.
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { judge } from "../lib/evals/answer-rules.mts";

const ROOT = path.resolve(import.meta.dirname, "../../..");
if (existsSync(path.join(ROOT, ".env"))) process.loadEnvFile(path.join(ROOT, ".env"));
const BASE = process.env.E2E_BASE_URL ?? "https://askyourslides.com";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

interface Case {
  id: string;
  what: string;
  programme: string;
  level: number;
  course: string;
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
  must?: string[];
  mustNot?: string[];
}
const only = process.argv.slice(2);
const cases = (JSON.parse(readFileSync(path.join(import.meta.dirname, "../evals/behaviour/cases.json"), "utf8")) as Case[]).filter((c) => !only.length || only.includes(c.id));

interface Result {
  id: string;
  what: string;
  pass: boolean;
  fails: string[];
  warnings: string[];
  secs: number;
  cost: number;
  prompt: string | null;
  answer: string;
}
const broken = (c: Case, why: string): Result => ({ id: c.id, what: c.what, pass: false, fails: [`could not run: ${why}`], warnings: [], secs: 0, cost: 0, prompt: null, answer: "" });

async function run(c: Case): Promise<Result> {
  const { data: course } = await db.from("courses").select("id").eq("programme", c.programme).eq("code", c.course).single();
  if (!course) return broken(c, `no course ${c.programme}/${c.course}`);
  const email = `behaviour-check-${c.id}-${Date.now()}@pau.edu.ng`;
  let userId = "";
  try {
    const { data: created, error: createError } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (createError) throw createError;
    userId = created.user.id;
    const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
    const res = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: link.properties!.email_otp }) });
    if (!res.ok) throw new Error(`sign-in ${res.status}`);
    const cookie = res.headers.getSetCookie().map((x) => x.split(";")[0]).join("; ");
    const up = await db.from("profiles").update({ onboarded: true, display_name: "Tolu", study_partner: "zara", programme: c.programme, level: c.level }).eq("id", userId);
    if (up.error) throw up.error;
    const { data: conv, error } = await db.from("conversations").insert({ user_id: userId, course_id: course.id }).select("id").single();
    if (error) throw error;
    if (c.history?.length) {
      const start = Date.now() - 3600_000;
      const ins = await db.from("messages").insert(
        c.history.map((m, i) => ({ conversation_id: conv.id, user_id: userId, role: m.role, content: m.content, created_at: new Date(start + i * 60_000).toISOString() })),
      );
      if (ins.error) throw ins.error;
    }
    const t0 = Date.now();
    const r = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ conversation_id: conv.id, message: c.question }) });
    const body = await r.text();
    let tr: { output_text: string | null; cost_usd: number | null; errors: { code: string }[] | null; prompt_version?: string | null } | null = null;
    for (let i = 0; i < 15 && !tr; i++) {
      await new Promise((done) => setTimeout(done, 1000)); // the trace is written after the stream ends
      tr = (await db.from("traces").select("output_text, cost_usd, errors, prompt_version").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
    }
    const answer = tr?.output_text ?? "";
    const { fails, warnings } = judge({ answer, httpOk: r.ok, body, errors: tr?.errors ?? [], must: c.must, mustNot: c.mustNot });
    return { id: c.id, what: c.what, pass: !fails.length, fails, warnings, secs: Math.round((Date.now() - t0) / 1000), cost: Number(tr?.cost_usd ?? 0), prompt: tr?.prompt_version ?? null, answer };
  } finally {
    if (userId) await db.auth.admin.deleteUser(userId);
  }
}

const results: Result[] = [];
for (let i = 0; i < cases.length; i += 3) {
  results.push(...(await Promise.all(cases.slice(i, i + 3).map((c) => run(c).catch((e) => broken(c, String(e)))))));
}
let cost = 0;
let failed = 0;
for (const r of results) {
  cost += r.cost;
  if (!r.pass) failed++;
  console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.what}${r.fails.length ? ` — ${r.fails.join("; ")}` : ""}${r.warnings.length ? ` [warn: ${r.warnings.join("; ")}]` : ""} (${r.secs}s)`);
  if (!r.pass && r.answer) console.log(`  answer: ${r.answer.replace(/\s+/g, " ").slice(0, 400)}`);
}
const prompts = [...new Set(results.map((r) => r.prompt).filter(Boolean))];
console.log(`\n${results.length - failed}/${results.length} passed · cost $${cost.toFixed(4)} · prompt ${prompts.join(", ") || "unknown"} · ${BASE}`);
process.exit(failed ? 1 : 0);
