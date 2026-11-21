// Live check of "explain every slide" (owner, 21 Nov 2026): a throwaway ISMS student asks for every
// slide of two ISM414 decks (35 and 44 slides) on the live site; passes when every slide is cited and
// nothing is cut short. Costs about 1 US cent a run (Haiku). The student is deleted afterwards.
//   npm run check:walkthrough   (E2E_BASE_URL overrides the site)
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
process.loadEnvFile(path.resolve(import.meta.dirname, "../../../.env"));
const BASE = process.env.E2E_BASE_URL ?? "https://askyourslides.com";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const email = `walk-check-${Date.now()}@pau.edu.ng`;
const CASES = [
  { topic: "Texture mapping and materials", q: "I meant that you should explain every slide in week 10 in detail without using words already on the slide so that I have sth esle to write in exam other than my lecturer's words. Also explain the words in bold" },
  { topic: "Image processing and 3D visualisation", q: "explain every slide in this topic in detail, in your own words" },
];
let userId = "";
try {
  await db.auth.admin.createUser({ email, email_confirm: true });
  const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const res = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: link.properties!.email_otp }) });
  if (!res.ok) throw new Error(`sign-in ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const { data: u } = await db.from("profiles").select("id").eq("email", email).single();
  userId = u!.id;
  const up = await db.from("profiles").update({ onboarded: true, display_name: "Walk Check", study_partner: "ada", programme: "information-science-and-media-studies", level: 400 }).eq("id", userId);
  if (up.error) throw up.error;
  const { data: course } = await db.from("courses").select("id, code").eq("code", "ISM414").eq("programme", "information-science-and-media-studies").single();
  for (const c of CASES) {
    const { data: topic } = await db.from("topics").select("id").eq("course_id", course!.id).eq("title", c.topic).single();
    const { data: mats } = await db.from("materials").select("material_order, page_count").eq("course_id", course!.id).eq("topic_id", topic!.id).in("kind", ["slides", "notes"]);
    const { data: convo, error } = await db.from("conversations").insert({ user_id: userId, course_id: course!.id, topic_id: topic!.id }).select("id").single();
    if (error) throw error;
    const send = async (message: string) => {
      const t0 = Date.now();
      const r = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ conversation_id: convo!.id, message }) });
      const body = await r.text();
      const truncated = /"truncated":true/.test(body);
      await new Promise((done) => setTimeout(done, 4000)); // the trace is written after the stream ends
      const { data: tr } = await db.from("traces").select("output_tokens, cost_usd, errors, output_text").eq("conversation_id", convo!.id).order("created_at", { ascending: false }).limit(1).single();
      return { status: r.status, secs: Math.round((Date.now() - t0) / 1000), truncated, tr, body: r.ok ? "" : body.slice(0, 200) };
    };
    const report = (label: string, x: Awaited<ReturnType<typeof send>>) => {
      const text: string = x.tr?.output_text ?? "";
      const covered = new Set<string>();
      for (const m of text.matchAll(/\[\[s:ISM414-(\d+)-(\d+)\]\]/g)) covered.add(`${Number(m[1])}-${m[2]}`);
      const total = (mats ?? []).reduce((s, m) => s + m.page_count, 0);
      const inTopic = [...covered].filter((k) => (mats ?? []).some((m) => k.startsWith(`${m.material_order}-`))).length;
      const headings = (text.match(/\*\*Slide\s+\d+/gi) ?? []).length;
      const errs = ((x.tr?.errors ?? []) as { code: string }[]).map((e) => e.code);
      console.log(`${c.topic} | ${label}: http ${x.status} ${x.body}, ${x.secs}s, ${x.tr?.output_tokens} tokens, $${x.tr?.cost_usd}, slides cited ${inTopic}/${total}, slide headings ${headings}, cut short: ${x.truncated}, issues: ${[...new Set(errs)].join(",") || "none"}`);
      console.log(`   opens: ${JSON.stringify(text.slice(0, 160))}`);
      console.log(`   ends:  ${JSON.stringify(text.slice(-160))}`);
    };
    const first = await send(c.q);
    report("ask", first);
    if (first.truncated) report("keep going", await send("keep going"));
  }
} finally {
  if (userId) await db.auth.admin.deleteUser(userId);
}
