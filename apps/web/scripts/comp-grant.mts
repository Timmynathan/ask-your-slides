// Finals for free (PRD F12): for testers and influencers. Marked source: comp, ends at PLAN_END_DATE.
//   npm run plans:comp -- ada.obi@pau.edu.ng                 # grant
//   npm run plans:comp -- ada.obi@pau.edu.ng --note "TikTok"  # with a note
//   npm run plans:comp -- ada.obi@pau.edu.ng --revoke         # end their comp plan now
//   npm run plans:comp -- --list                              # every comp plan
// The student must have signed up first (their account is looked up by email).
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import path from "node:path";
import { PLAN_END_DATE } from "../lib/plans/config.ts";

const ROOT = path.resolve(import.meta.dirname, "../../..");
if (existsSync(path.join(ROOT, ".env"))) process.loadEnvFile(path.join(ROOT, ".env"));

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const email = args.find((a) => a.includes("@"))?.trim().toLowerCase();

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

if (flag("list")) {
  const rows = must(await db.from("entitlements").select("user_id, ends_at, note, created_at, profiles(email)").eq("source", "comp").order("created_at")) as unknown as {
    ends_at: string;
    note: string | null;
    profiles: { email: string };
  }[];
  const now = Date.now();
  for (const r of rows) console.log(`${r.profiles.email.padEnd(40)} ${new Date(r.ends_at).getTime() > now ? "active " : "ended  "} until ${r.ends_at.slice(0, 10)}  ${r.note ?? ""}`);
  console.log(`${rows.length} comp plan(s)`);
  process.exit(0);
}

if (!email) {
  console.error('Usage: npm run plans:comp -- <email> [--note "why"] [--revoke] | --list');
  process.exit(1);
}

const profile = must(await db.from("profiles").select("id, email").eq("email", email).maybeSingle()) as { id: string; email: string } | null;
if (!profile) {
  console.error(`No account for ${email}. They need to sign up first.`);
  process.exit(1);
}

if (flag("revoke")) {
  const now = new Date().toISOString();
  const ended = must(await db.from("entitlements").update({ ends_at: now }).eq("user_id", profile.id).eq("source", "comp").gt("ends_at", now).select("id")) as { id: string }[];
  console.log(ended.length ? `Ended ${ended.length} comp plan(s) for ${email}.` : `${email} has no active comp plan.`);
  process.exit(0);
}

if (new Date() >= PLAN_END_DATE) {
  console.error(`PLAN_END_DATE (${PLAN_END_DATE.toISOString()}) has passed: set the new date in lib/plans/config.ts first.`);
  process.exit(1);
}
const active = must(await db.from("entitlements").select("source, ends_at").eq("user_id", profile.id).gt("ends_at", new Date().toISOString())) as { source: string; ends_at: string }[];
if (active.length) {
  console.log(`${email} already has Finals (${active.map((a) => `${a.source} until ${a.ends_at.slice(0, 10)}`).join(", ")}). Nothing to do.`);
  process.exit(0);
}
const id = must(
  await db.rpc("grant_finals", { p_user_id: profile.id, p_ends_at: PLAN_END_DATE.toISOString(), p_source: "comp", p_reference: null, p_note: value("note") ?? null }),
) as string;
console.log(`Granted Finals (comp) to ${email} until ${PLAN_END_DATE.toISOString().slice(0, 10)}. Entitlement ${id}.`);
