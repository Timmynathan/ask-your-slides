// How good is the first search? (owner, 23 Nov 2026: "is our chunking effective?")
//
// Free: no model or embedding calls. It reads the traces of real students' answers. Each trace records
// the slides the server's first search returned (top 8) and the slides the final answer cited (after
// any further searches or reads by the model). The cited slides are treated as the answer key:
// "silver" labels, not hand-checked, but they are the slides the answer actually rested on.
//
//   npm run check:retrieval              (from apps/web)
//   RETRIEVAL_SINCE=2026-11-20 npm run check:retrieval
//
// Reports:
//   hit rate       the first search found at least one slide the answer cited
//   recall         share of all cited slides that the first search found
//   misses         cited slides the first search didn't find, by where they were:
//                  right next to a found slide (±1, ±2 in the same file), elsewhere in a found file,
//                  or in another file
//   thin slides    the same split for slides with little text (< THIN chars): the chunking question
//   neighbours     what returning each found slide's neighbours would have recovered, and its cost
//                  (extra slides handed to the model per question)
// Writes the details to data/evals/retrieval-report.md.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

const ROOT = path.resolve(import.meta.dirname, "../../..");
nextEnv.loadEnvConfig(ROOT);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const THIN = 80;
const SINCE = process.env.RETRIEVAL_SINCE ?? "2026-01-01";
// Accounts made by test scripts (deleted afterwards; their traces remain).
const TEST_EMAIL = /^(?:[a-z]+-)+(?:check|shot|ui|test|e2e)[-\w]*@|^pills-|^plans-ui-/i;

interface Trace {
  id: string;
  user_id: string;
  course_id: string;
  user_message: string;
  history_length: number;
  tool_calls: { name: string; input: Record<string, unknown>; slide_keys: string[] }[];
  citations: { slide_key: string }[];
  created_at: string;
}

const parse = (key: string) => {
  const m = key.match(/^(.*)-(\d{2,3})-(\d{1,3})$/);
  return m ? { material: `${m[1]}-${m[2]}`, n: Number(m[3]) } : null;
};

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const traces = await all<Trace>((a, b) =>
  admin.from("traces").select("id, user_id, course_id, user_message, history_length, tool_calls, citations, created_at").gte("created_at", SINCE).order("created_at").range(a, b),
);
const profiles = await all<{ id: string; email: string | null }>((a, b) => admin.from("profiles").select("id, email").range(a, b));
const realUser = new Map(profiles.filter((p) => p.email && !TEST_EMAIL.test(p.email)).map((p) => [p.id, p.email!]));

const cases = traces.filter(
  (t) => realUser.has(t.user_id) && t.tool_calls?.[0]?.name === "search_slides" && (t.citations ?? []).length > 0,
);

// Text length of every slide involved, to tell thin slides apart.
const keysByCourse = new Map<string, Set<string>>();
for (const t of cases) {
  const s = keysByCourse.get(t.course_id) ?? new Set<string>();
  for (const k of t.tool_calls[0].slide_keys) s.add(k);
  for (const c of t.citations) s.add(c.slide_key);
  keysByCourse.set(t.course_id, s);
}
const bodyLen = new Map<string, number>(); // `${course}:${key}` → characters of slide text
for (const [course, keys] of keysByCourse) {
  const list = [...keys];
  for (let i = 0; i < list.length; i += 200) {
    const { data } = await admin.from("slides").select("slide_key, body_text").eq("course_id", course).in("slide_key", list.slice(i, i + 200));
    for (const r of data ?? []) bodyLen.set(`${course}:${r.slide_key}`, (r.body_text ?? "").trim().length);
  }
}
const isThin = (course: string, key: string) => (bodyLen.get(`${course}:${key}`) ?? 0) < THIN;

let hits = 0;
let cited = 0;
let found = 0;
const missWhere = { neighbour1: 0, neighbour2: 0, sameFile: 0, otherFile: 0 };
const thin = { cited: 0, found: 0 };
const normal = { cited: 0, found: 0 };
const expand = { all1: 0, thin1: 0, all1Extra: 0, thin1Extra: 0 };
const thinShareOfResults = { thin: 0, total: 0 };
const rows: string[] = [];
let longQueries = 0;
// Questions answered from searches alone vs answers that read whole files on purpose (summaries,
// walkthroughs, overviews): the second kind cites far more than any 8 results could hold.
const byType = { focused: { n: 0, hit: 0, recallSum: 0, cited: 0, found: 0 }, longRead: { n: 0, hit: 0, recallSum: 0, cited: 0, found: 0 } };

for (const t of cases) {
  const first = t.tool_calls[0];
  const got = new Set(first.slide_keys);
  const want = [...new Set(t.citations.map((c) => c.slide_key))];
  if (String(first.input.query ?? "").length > 500) longQueries++;
  for (const k of got) {
    thinShareOfResults.total++;
    if (isThin(t.course_id, k)) thinShareOfResults.thin++;
  }
  const foundHere = want.filter((k) => got.has(k));
  if (foundHere.length) hits++;
  const type = t.tool_calls.some((c) => c.name === "get_material_pages" || c.name === "list_topics") ? byType.longRead : byType.focused;
  type.n++;
  if (foundHere.length) type.hit++;
  type.recallSum += foundHere.length / want.length;
  type.cited += want.length;
  type.found += foundHere.length;
  cited += want.length;
  found += foundHere.length;

  const gotParsed = [...got].map((k) => ({ key: k, ...parse(k)! })).filter((g) => g.material);
  // Neighbour expansion: ±1 of every found slide, or only of thin found slides.
  const plusOne = (onlyThin: boolean) => {
    const s = new Set<string>();
    for (const g of gotParsed) {
      if (onlyThin && !isThin(t.course_id, g.key)) continue;
      for (const d of [-1, 1]) if (g.n + d >= 1) s.add(`${g.material}-${g.n + d}`);
    }
    for (const k of got) s.delete(k);
    return s;
  };
  const allNb = plusOne(false);
  const thinNb = plusOne(true);
  expand.all1Extra += allNb.size;
  expand.thin1Extra += thinNb.size;

  const missed: string[] = [];
  for (const k of want) {
    const bucket = isThin(t.course_id, k) ? thin : normal;
    bucket.cited++;
    if (got.has(k)) {
      bucket.found++;
      continue;
    }
    missed.push(k);
    const p = parse(k);
    const near = p ? gotParsed.filter((g) => g.material === p.material).map((g) => Math.abs(g.n - p.n)) : [];
    const d = near.length ? Math.min(...near) : Infinity;
    if (d === 1) missWhere.neighbour1++;
    else if (d === 2) missWhere.neighbour2++;
    else if (d !== Infinity) missWhere.sameFile++;
    else missWhere.otherFile++;
    if (allNb.has(k)) expand.all1++;
    if (thinNb.has(k)) expand.thin1++;
  }
  rows.push(
    `| ${t.created_at.slice(0, 10)} | ${t.user_message.replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 70)} | ${foundHere.length}/${want.length} | ${missed.join(", ")} |`,
  );
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "n/a");
const missedTotal = cited - found;
const summary = [
  `Answers checked: ${cases.length} (real students, first step a search, at least one citation; since ${SINCE})`,
  ``,
  `First search found at least one cited slide: ${hits}/${cases.length} (${pct(hits, cases.length)})`,
  `Cited slides found by the first search (recall@8): ${found}/${cited} (${pct(found, cited)})`,
  ...(["focused", "longRead"] as const).map((k) => {
    const b = byType[k];
    return `  ${k === "focused" ? "answered from searches only" : "also read whole files / topic list"}: ${b.n} answers, hit ${pct(b.hit, b.n)}, recall ${pct(b.found, b.cited)} of ${b.cited} cited (average per answer ${pct(b.recallSum, b.n)})`;
  }),
  `  normal slides: ${normal.found}/${normal.cited} (${pct(normal.found, normal.cited)})`,
  `  thin slides (< ${THIN} chars): ${thin.found}/${thin.cited} (${pct(thin.found, thin.cited)})`,
  `Thin slides among first-search results: ${pct(thinShareOfResults.thin, thinShareOfResults.total)}`,
  ``,
  `Cited slides the first search missed: ${missedTotal} (the model found them itself with more searches or reads)`,
  `  right next to a found slide (±1): ${missWhere.neighbour1} (${pct(missWhere.neighbour1, missedTotal)})`,
  `  two slides away (±2): ${missWhere.neighbour2} (${pct(missWhere.neighbour2, missedTotal)})`,
  `  elsewhere in a file the search found: ${missWhere.sameFile} (${pct(missWhere.sameFile, missedTotal)})`,
  `  in a file the search didn't touch: ${missWhere.otherFile} (${pct(missWhere.otherFile, missedTotal)})`,
  ``,
  `If each found slide came with its neighbours (±1):`,
  `  every found slide: recovers ${expand.all1} of ${missedTotal} misses, ${(expand.all1Extra / (cases.length || 1)).toFixed(1)} extra slides per question`,
  `  only thin found slides: recovers ${expand.thin1} of ${missedTotal} misses, ${(expand.thin1Extra / (cases.length || 1)).toFixed(1)} extra slides per question`,
  ``,
  `First-search queries over 500 characters (follow-ups carrying earlier text): ${longQueries}`,
].join("\n");

console.log(summary);
mkdirSync(path.join(ROOT, "data/evals"), { recursive: true });
const out = path.join(ROOT, "data/evals/retrieval-report.md");
writeFileSync(
  out,
  `# First-search check, ${new Date().toISOString().slice(0, 16).replace("T", " ")}\n\n\`\`\`\n${summary}\n\`\`\`\n\n| Date | Question | Found/cited | Missed |\n|---|---|---|---|\n${rows.join("\n")}\n`,
);
console.log(`\nDetails: ${path.relative(ROOT, out)}`);
