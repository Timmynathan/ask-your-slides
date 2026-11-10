// Golden cases (PRD §15, F11) + programme isolation, through the real app.
//
//   npm run build && npm run check:golden            (from the repo root, or --prefix apps/web)
//   GOLDEN=evals/golden/isms.json ...                 (default: every evals/golden/*.json)
//
// 1. For each case: a temporary student of the case file's programme asks the question in a new chat
//    (real /api/chat: real model, real slides); checks what was cited, by type: Word section, notebook
//    cells, code lines, image-only slide; student work labelled when asked and absent when not; the
//    "not covered" opening.
// 2. Isolation: a CS student and an ISMS student each try the other programme's course page, slide
//    preview and chat creation: all refused; their own work.
// Temporary students, their chats and traces are deleted at the end. About $0.01 per run.
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { citedKeys } from "../lib/evals/checks.mts";

const REPO = path.resolve(import.meta.dirname, "../../..");
if (existsSync(path.join(REPO, ".env"))) process.loadEnvFile(path.join(REPO, ".env"));
const PORT = 3500 + Math.floor(Math.random() * 90);
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const NOT_COVERED = /^\s*your slides don't cover this/i;
const STUDENT_WORK = /this comes from a student group presentation, not the lecturer's slides/i;

interface Case {
  id: string;
  course: string;
  topic?: string;
  question: string;
  cite_any?: string[];
  cite_type?: "docx" | "notebook" | "code" | "image_only";
  student_work?: boolean;
  no_student_work?: boolean;
  not_covered?: boolean;
  why?: string;
}

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// ── a signed-in temporary student ─────────────────────────
interface Student {
  email: string;
  id: string;
  cookie: string;
}
const students: Student[] = [];

async function student(programme: string): Promise<Student> {
  const email = `golden-${programme.slice(0, 8)}-${Date.now()}-${students.length}@pau.edu.ng`;
  await admin.auth.admin.createUser({ email, email_confirm: true });
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const res = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: data.properties!.email_otp }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const { data: p } = await admin.from("profiles").select("id").eq("email", email).single();
  await admin.from("profiles").update({ onboarded: true, study_partner: "ada", programme, level: 400 }).eq("id", p!.id);
  const s = { email, id: p!.id as string, cookie };
  students.push(s);
  return s;
}

const call = (s: Student, url: string, init: RequestInit = {}) =>
  fetch(`${BASE}${url}`, { ...init, headers: { "Content-Type": "application/json", cookie: s.cookie, ...(init.headers ?? {}) } });

async function courseIds(code: string, programme: string, topic?: string) {
  const { data: c } = await admin.from("courses").select("id").eq("code", code).eq("programme", programme).single();
  if (!topic) return { courseId: c!.id as string, topicId: null };
  const { data: t } = await admin.from("topics").select("id").eq("course_id", c!.id).eq("title", topic).single();
  return { courseId: c!.id as string, topicId: t!.id as string };
}

async function ask(s: Student, conversationId: string, message: string) {
  const res = await call(s, "/api/chat", { method: "POST", body: JSON.stringify({ conversation_id: conversationId, message }) });
  if (!res.ok) return { status: res.status, text: "", citations: [] as any[], error: (await res.json()).error as string };
  let text = "";
  let meta: Record<string, any> = {};
  let error: string | undefined;
  for (const line of (await res.text()).split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const part = JSON.parse(line.slice(6));
    if (part.type === "text-delta") text += part.delta;
    if (part.messageMetadata) meta = { ...meta, ...part.messageMetadata };
    if (part.type === "error") error = part.errorText;
  }
  return { status: res.status, text, citations: (meta.citations ?? []) as any[], error };
}

/** What kind of chunk each cited key is: docx section, notebook cells, code lines, image-only slide, plain. */
async function kinds(courseId: string, keys: string[]) {
  if (!keys.length) return new Map<string, { type: string; source: string }>();
  const { data } = await admin
    .from("slides")
    .select("slide_key, label, view, body_text, visual_description, materials(source_file, source)")
    .eq("course_id", courseId)
    .in("slide_key", keys);
  return new Map(
    (data ?? []).map((r: any) => {
      const file: string = r.materials?.source_file ?? "";
      const type = r.view?.type === "notebook" ? "notebook" : r.view?.type === "code" ? "code" : file.endsWith(".docx") ? "docx"
        : !(r.body_text ?? "").trim() && (r.visual_description ?? "").trim() ? "image_only" : "page";
      return [r.slide_key as string, { type, source: r.materials?.source as string }];
    }),
  );
}

async function runCases(file: string) {
  const spec = JSON.parse(readFileSync(file, "utf8")) as { programme: string; cases: Case[] };
  console.log(`\n${path.relative(REPO, file)} (${spec.cases.length} cases, programme ${spec.programme})`);
  const s = await student(spec.programme);
  for (const c of spec.cases) {
    console.log(`\n[${c.id}] ${c.course}${c.topic ? ` › ${c.topic}` : ""}: ${c.question}`);
    const { courseId, topicId } = await courseIds(c.course, spec.programme, c.topic);
    const conv = await call(s, "/api/conversations", { method: "POST", body: JSON.stringify({ course_id: courseId, topic_id: topicId }) });
    const body = await conv.json();
    if (conv.status !== 201) {
      check(false, "chat created", `${conv.status} ${JSON.stringify(body)}`);
      continue;
    }
    const a = await ask(s, body.conversation.id, c.question);
    check(a.status === 200 && !a.error && a.text.length > 40, "answered", a.error ?? `${a.text.length} chars`);
    const keys = [...new Set(citedKeys(a.text))];
    const info = await kinds(courseId, keys);
    const shown = keys.map((k) => `${k}(${info.get(k)?.type ?? "?"})`).join(" ");
    if (c.cite_any) {
      const hit = keys.filter((k) => c.cite_any!.some((p) => k.startsWith(`${p}-`)));
      check(hit.length > 0, `cites ${c.cite_any.join(" or ")}`, shown || "no citations");
      if (c.cite_type) {
        check(hit.some((k) => info.get(k)?.type === c.cite_type), `the cited chunk is ${c.cite_type.replace("_", "-")}`, shown);
        if (c.cite_type !== "image_only") {
          const chip = a.citations.find((x) => hit.includes(x.slide_key));
          check(!!chip?.label, "its chip names the section/cells/lines, not a page", JSON.stringify(chip?.label ?? null));
        }
      }
    }
    if (c.student_work) {
      check(keys.some((k) => info.get(k)?.source === "student"), "uses the student presentation");
      check(STUDENT_WORK.test(a.text), "says it comes from a student group presentation", a.text.slice(0, 140).replace(/\n/g, " "));
      check(a.citations.some((x) => x.student_work), "its chip is marked as student work");
    }
    if (c.no_student_work) {
      check(!keys.some((k) => info.get(k)?.source === "student"), "does not use student work", shown || "no citations");
    }
    if (c.not_covered) {
      check(NOT_COVERED.test(a.text), "opens with \"Your slides don't cover this\"", a.text.slice(0, 80).replace(/\n/g, " "));
    }
  }
}

async function isolation() {
  console.log("\nProgramme isolation (CS ↔ ISMS) through the app");
  const cs = await student("computer-science");
  const isms = await student("information-science-and-media-studies");
  const pairs: [Student, string, Student, string][] = [
    [cs, "computer-science", isms, "information-science-and-media-studies"],
    [isms, "information-science-and-media-studies", cs, "computer-science"],
  ];
  for (const [me, mine, , theirs] of pairs) {
    const label = mine === "computer-science" ? "CS student" : "ISMS student";
    const { data: own } = await admin.from("courses").select("code").eq("programme", mine);
    const { data: other } = await admin.from("courses").select("id, code").eq("programme", theirs);
    const otherCodes = (other ?? []).map((c) => c.code);
    const dash = await (await call(me, "/dashboard")).text();
    check((own ?? []).every((c) => dash.includes(c.code.replace(/^([A-Z]+)/, "$1 "))), `${label}: My courses lists their own programme's courses`);
    check(!otherCodes.some((c) => dash.includes(c.replace(/^([A-Z]+)/, "$1 "))), `${label}: My courses lists none of the other programme's`, otherCodes.join(","));
    const target = other![0];
    const page = await (await call(me, `/study/${target.code}`)).text();
    check(page.includes("Page not found") && !page.includes(target.code.replace(/^([A-Z]+)/, "$1 ") + "</"), `${label}: /study/${target.code} is 'Page not found'`);
    const { data: slide } = await admin.from("slides").select("slide_key").eq("course_id", target.id).limit(1).single();
    const prev = await call(me, `/api/slides/${slide!.slide_key}?course=${target.id}`);
    check(prev.status === 404, `${label}: the other programme's slide preview is refused`, String(prev.status));
    const conv = await call(me, "/api/conversations", { method: "POST", body: JSON.stringify({ course_id: target.id, topic_id: null }) });
    check(conv.status !== 201, `${label}: can't start a chat in the other programme's course`, String(conv.status));
    const { count } = await admin.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", me.id).eq("course_id", target.id);
    check(count === 0, `${label}: nothing was created`);
  }
}

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const s of students) {
    const u = data?.users.find((x) => x.email === s.email);
    if (!u) continue;
    await admin.from("traces").delete().eq("user_id", u.id);
    await admin.auth.admin.deleteUser(u.id); // cascades to profile, conversations, messages, usage
  }
}

async function main() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/SUPABASE|ANTHROPIC|VOYAGE|DATABASE_URL|PRIVACY/.test(k)) delete env[k];
  const server = process.env.E2E_BASE_URL ? null : spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore", env,
  });
  try {
    for (let i = 0; i < 80; i++) {
      try { await fetch(`${BASE}/sign-in`); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }
    const dir = path.join(REPO, "evals", "golden");
    const files = process.env.GOLDEN ? [path.resolve(REPO, process.env.GOLDEN)] : readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
    for (const f of files) await runCases(f);
    await isolation();
  } finally {
    await cleanup();
    server?.kill();
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nGolden cases + isolation: all checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
