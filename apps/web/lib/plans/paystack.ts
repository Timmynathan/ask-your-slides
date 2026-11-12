// Paystack one-time payments for Finals (PRD F12). A plan is granted ONLY here, after the server
// has confirmed the payment with Paystack itself: a signed webhook, or the verify endpoint. The
// browser's return from Paystack proves nothing on its own. Granting is idempotent on the
// Paystack reference (grant_finals), so a replayed webhook, or webhook + verify, grants once.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { adminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/admin";
import { PLAN_END_DATE } from "./config";

type Db = ReturnType<typeof adminClient>;

const API = "https://api.paystack.co";
/** Card, bank transfer and USSD only. */
export const CHANNELS = ["card", "bank_transfer", "ussd"] as const;

/** The secret key, refusing a live key until the owner sets PAYSTACK_LIVE=1 (go-live checklist). */
export function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  if (key.startsWith("sk_live_") && process.env.PAYSTACK_LIVE !== "1") {
    throw new Error("A live Paystack key is set but PAYSTACK_LIVE is not 1: still in test mode");
  }
  return key;
}

/** Payments can start: a key is set (and a live key only with PAYSTACK_LIVE=1). Until then the
 *  buttons say "Payments open soon" and checkout refuses without creating anything. */
export function paymentsOpen(): boolean {
  try {
    secretKey();
    return true;
  } catch {
    return false;
  }
}

/** Paystack signs each webhook body with HMAC-SHA512 of the raw body, keyed by the secret key. */
export function validSignature(rawBody: string, signature: string | null, key = secretKey()): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A Paystack transaction as /transaction/verify and the charge.success webhook describe it. */
export interface PaystackTransaction {
  reference: string;
  status: string; // "success" | "failed" | "abandoned" | …
  amount: number; // kobo
  currency: string;
  paid_at?: string | null;
  channel?: string;
}

export async function initializeTransaction(opts: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
  fetcher?: typeof fetch;
}): Promise<{ authorization_url: string; reference: string }> {
  const res = await (opts.fetcher ?? fetch)(`${API}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: opts.email,
      amount: opts.amountKobo,
      currency: "NGN",
      reference: opts.reference,
      callback_url: opts.callbackUrl,
      channels: CHANNELS,
      metadata: opts.metadata,
    }),
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: { authorization_url: string; reference: string } } | null;
  if (!res.ok || !json?.status || !json.data) throw new Error(`Paystack initialize failed: ${json?.message ?? res.status}`);
  return json.data;
}

export async function verifyTransaction(reference: string, fetcher: typeof fetch = fetch): Promise<PaystackTransaction | null> {
  const res = await fetcher(`${API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; data?: PaystackTransaction } | null;
  if (!res.ok || !json?.status || !json.data) return null;
  return json.data;
}

export type SettleResult =
  | { outcome: "granted"; entitlementId: string }
  | { outcome: "already_granted"; entitlementId: string | null }
  | { outcome: "not_paid"; status: string }
  | { outcome: "mismatch"; reason: string }
  | { outcome: "unknown_reference" };

/**
 * Records what Paystack confirmed for one of our references and, if it is a full successful
 * payment, grants Finals. `tx` must come from Paystack (verify endpoint, or a webhook whose
 * signature was checked). Safe to call any number of times for the same reference.
 */
export async function settlePayment(db: Db, tx: PaystackTransaction, rawEvent: unknown): Promise<SettleResult> {
  const payment = must(
    await db.from("payments").select("id, user_id, plan, amount_kobo, currency, status").eq("reference", tx.reference).maybeSingle(),
  ) as { id: string; user_id: string; plan: string; amount_kobo: number; currency: string; status: string } | null;
  if (!payment) return { outcome: "unknown_reference" };

  if (tx.status !== "success") {
    if (payment.status === "pending" && (tx.status === "failed" || tx.status === "abandoned")) {
      must(await db.from("payments").update({ status: tx.status, raw_event: rawEvent }).eq("id", payment.id).eq("status", "pending"));
    }
    return { outcome: "not_paid", status: tx.status };
  }
  // The amount and currency the server asked for at checkout, not whatever the browser sent.
  if (tx.currency !== payment.currency || tx.amount < payment.amount_kobo) {
    must(await db.from("payments").update({ raw_event: rawEvent }).eq("id", payment.id));
    return { outcome: "mismatch", reason: `paid ${tx.amount} ${tx.currency}, expected ${payment.amount_kobo} ${payment.currency}` };
  }

  const already = payment.status === "success";
  const entitlementId = must(
    await db.rpc("grant_finals", {
      p_user_id: payment.user_id,
      p_ends_at: PLAN_END_DATE.toISOString(),
      p_source: "paystack",
      p_reference: tx.reference,
      p_note: null,
    }),
  ) as string | null;
  if (!already) {
    must(
      await db
        .from("payments")
        .update({ status: "success", paid_at: tx.paid_at ?? new Date().toISOString(), raw_event: rawEvent })
        .eq("id", payment.id),
    );
  }
  return already ? { outcome: "already_granted", entitlementId } : { outcome: "granted", entitlementId: entitlementId! };
}

/** References we create: unguessable, and recognisable in the Paystack dashboard. */
export function newReference(): string {
  return `ays_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Optional referral code typed at checkout: upper-cased; anything that isn't a plausible code is dropped. */
export function cleanReferral(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  return /^[A-Z0-9_-]{2,32}$/.test(c) ? c : null;
}
