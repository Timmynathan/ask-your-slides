// Paying for Finals by bank transfer (PRD F12). The student transfers to the owner's account with
// their reference in the description, sends the receipt on WhatsApp, and a payment request waits
// as 'pending'. Finals is granted ONLY by an admin approval (/admin/payments), never here.
//
// Bank details and the WhatsApp number come from env vars (Vercel + apps/web/.env.local):
//   BANK_NAME, BANK_ACCOUNT_NUMBER, BANK_ACCOUNT_NAME, WHATSAPP_NUMBER (international, digits only)
// Until all four are set, "Get Finals" shows "Payments open soon".
import "server-only";
import { randomInt } from "node:crypto";
import type { adminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/admin";
import { naira } from "./offer";

type Db = ReturnType<typeof adminClient>;

export interface PaymentDetails {
  bankName: string;
  accountNumber: string;
  accountName: string;
  /** International format, digits only (e.g. 234…). */
  whatsapp: string;
}

/** The transfer details, or null while any of them is missing. */
export function paymentDetails(env: Record<string, string | undefined> = process.env): PaymentDetails | null {
  const bankName = env.BANK_NAME?.trim();
  const accountNumber = env.BANK_ACCOUNT_NUMBER?.replace(/\s/g, "");
  const accountName = env.BANK_ACCOUNT_NAME?.trim();
  const whatsapp = env.WHATSAPP_NUMBER?.replace(/\D/g, "");
  if (!bankName || !accountNumber || !accountName || !whatsapp) return null;
  return { bankName, accountNumber, accountName, whatsapp };
}

export function paymentsOpen(): boolean {
  return paymentDetails() !== null;
}

// No 0/O, 1/I/L: a reference is read off a screen and typed into a banking app.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newReference(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `AYS-${s}`;
}

/** The student's transfer reference: made once, kept for good. */
export async function referenceFor(db: Db, userId: string): Promise<string> {
  const existing = must(await db.from("payment_references").select("reference").eq("user_id", userId).maybeSingle()) as { reference: string } | null;
  if (existing) return existing.reference;
  // The reference comes back from the insert itself: an identical read in the same render would
  // be served from React's fetch memo (still "none").
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await db
      .from("payment_references")
      .upsert({ user_id: userId, reference: newReference() }, { onConflict: "user_id", ignoreDuplicates: true })
      .select("reference")
      .maybeSingle();
    if (data) return (data as { reference: string }).reference;
    // 23505 = the random reference was taken by someone else: draw again.
    if (error && error.code !== "23505") throw new Error(error.message);
    if (!error) {
      // Ignored: a parallel request made this student's reference first.
      const made = must(await db.from("payment_references").select("reference, user_id").eq("user_id", userId).single()) as { reference: string };
      return made.reference;
    }
  }
  throw new Error("Couldn't make a payment reference.");
}

export function cleanReferral(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  return /^[A-Z0-9_-]{2,32}$/.test(c) ? c : null;
}

export function whatsappText(r: { amount: number; email: string; reference: string }): string {
  return `Hi, I've paid ${naira(r.amount)} for AskYourSlides Finals. Email: ${r.email}. Reference: ${r.reference}. Receipt attached.`;
}

export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export interface PaymentRequestRow {
  id: string;
  reference: string;
  amount_naira: number;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
}

/** The student's most recent request (pending, approved or rejected), or null. */
export async function latestRequest(db: Db, userId: string): Promise<PaymentRequestRow | null> {
  const rows = must(
    await db.from("payment_requests").select("id, reference, amount_naira, status, note, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
  ) as PaymentRequestRow[];
  return rows[0] ?? null;
}
