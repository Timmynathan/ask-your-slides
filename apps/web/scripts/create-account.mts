// Owner tool: create (or fix) a student's account with a password, for a student whose PAU inbox
// never receives the sign-in code. The account is created already confirmed, so they log in with
// email + password at askyourslides.com/sign-in and go through onboarding as normal.
//
//   node scripts/create-account.mts student@pau.edu.ng
//
// Prints a one-time random password: give it to the student privately. If the account already
// exists (e.g. they started signing up), it is confirmed and given the new password instead.
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, "../../.."));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in the repo-root .env");
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const email = (process.argv[2] ?? "").trim().toLowerCase();
// Same rule as sign-up (the auth hook doesn't run for admin-created users, so check it here).
if (!/^[^\s@]+@pau\.edu\.ng$/.test(email)) {
  console.error("Usage: node scripts/create-account.mts someone@pau.edu.ng  (a PAU email address)");
  process.exit(1);
}

// Easy to read out or type on a phone: no 0/O, 1/l/I; 3 groups of 4.
const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
const password = `${group()}-${group()}-${group()}`;

const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;
const existing = list.users.find((u) => u.email?.toLowerCase() === email);

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  if (error) throw error;
  console.log(`Updated the existing account for ${email}: confirmed, new password set.`);
} else {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  console.log(`Created a confirmed account for ${email}.`);
}

// Prove the credentials work before handing them over.
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { error: signInError } = await anon.auth.signInWithPassword({ email, password });
if (signInError) throw new Error(`The account exists but signing in failed: ${signInError.message}`);
await anon.auth.signOut();

console.log(`\n  Email:     ${email}\n  Password:  ${password}\n`);
console.log("Checked: these credentials log in. Send them privately; they log in at https://askyourslides.com/sign-in");
