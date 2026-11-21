// Sends the owner-approved emails in data/emails/drafts.json from hello@askyourslides.com through
// Resend (the service that already sends the sign-in codes). Plain text, one at a time, replies go to
// hello@askyourslides.com, with a copy (BCC) to hello@ so the owner has them too. Nothing is sent unless the draft has "approved": true AND --send is given;
// without --send it only lists what would go out. Sent emails are marked "sent" in the file, so a
// second run never sends twice.
//
//   npx tsx scripts/send-student-emails.mts          # dry run: who would get what
//   npx tsx scripts/send-student-emails.mts --send   # send the approved, unsent ones
//
// Needs RESEND_API_KEY in the repo-root .env (Resend dashboard > API Keys, "Sending access").
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
process.loadEnvFile(path.join(ROOT, ".env"));
const FILE = path.join(ROOT, "data/emails/drafts.json");
const FROM = "Timmy from Ask Your Slides <hello@askyourslides.com>";
const REPLY_TO = "hello@askyourslides.com";
const send = process.argv.includes("--send");

type Draft = { id: number; to: string; name: string; subject: string; body: string; approved: boolean; sent?: string };
const drafts = JSON.parse(readFileSync(FILE, "utf8")) as Draft[];
const ready = drafts.filter((d) => d.approved && !d.sent);
console.log(`${drafts.length} drafts · ${drafts.filter((d) => d.approved).length} approved · ${drafts.filter((d) => d.sent).length} already sent · ${ready.length} to send`);
for (const d of ready) console.log(`  #${d.id} ${d.name} <${d.to}> · ${d.subject}`);
if (!send) {
  console.log("\nDry run: nothing sent. Add --send to send these.");
  process.exit(0);
}
const key = process.env.RESEND_API_KEY;
if (!key) {
  console.error("RESEND_API_KEY is not set in the repo-root .env.");
  process.exit(1);
}
for (const d of ready) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    // A copy to hello@ (BCC), so the owner sees every email sent in the same inbox as the replies.
    body: JSON.stringify({ from: FROM, to: [d.to], bcc: [REPLY_TO], reply_to: REPLY_TO, subject: d.subject, text: d.body }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    console.error(`  #${d.id} ${d.name}: failed (${res.status}) ${body.message ?? ""}. Stopping; nothing after this was sent.`);
    break;
  }
  d.sent = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(drafts, null, 1));
  console.log(`  #${d.id} ${d.name}: sent`);
  await new Promise((r) => setTimeout(r, 700)); // Resend allows about 2 a second
}
