// Promo codes for course reps (PRD F12, owner 14 Nov 2026). The owner generates single-use codes in
// /admin/promo; a student types one in (onboarding or /pricing) and gets Finals for the code's days.
// The rules (one use per code, one code per student, not while already on Finals) live in the
// database function redeem_promo_code, under a row lock; this file only calls it.
import "server-only";
import { randomInt } from "node:crypto";
import type { adminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/admin";
import { PROMO_DAYS, PROMO_MAX_BATCH } from "./config";

type Db = ReturnType<typeof adminClient>;

// No 0/O, 1/I/L: codes are read out loud and typed on phones.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** "REP-7KQ2-M9XD": 8 random characters (31^8 ≈ 850 billion), easy to read and type. */
export function newPromoCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `REP-${part()}-${part()}`;
}

/** What a student typed → the stored form ("rep 7kq2 m9xd" → "REP-7KQ2-M9XD"). */
export function cleanPromoCode(typed: string): string {
  const raw = typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.startsWith("REP") && raw.length === 11) return `REP-${raw.slice(3, 7)}-${raw.slice(7)}`;
  return typed.toUpperCase().trim().replace(/\s+/g, "-");
}

export interface PromoCodeRow {
  id: string;
  code: string;
  days: number;
  note: string | null;
  created_at: string;
  redeemed_at: string | null;
  redeemed_email: string | null;
}

export async function createPromoCodes(db: Db, opts: { count: number; days?: number; note?: string | null; admin: string }): Promise<PromoCodeRow[]> {
  const count = Math.max(1, Math.min(PROMO_MAX_BATCH, Math.floor(opts.count)));
  const rows = Array.from({ length: count }, () => ({ code: newPromoCode(), days: opts.days ?? PROMO_DAYS, note: opts.note?.trim() || null, created_by: opts.admin }));
  return must(await db.from("promo_codes").insert(rows).select("id, code, days, note, created_at, redeemed_at, redeemed_email")) as PromoCodeRow[];
}

export async function listPromoCodes(db: Db): Promise<PromoCodeRow[]> {
  return must(await db.from("promo_codes").select("id, code, days, note, created_at, redeemed_at, redeemed_email").order("created_at", { ascending: false }).limit(500)) as PromoCodeRow[];
}

export type RedeemOutcome = "redeemed" | "not_found" | "used" | "already_yours" | "one_per_student" | "already_finals";

export async function redeemPromoCode(db: Db, opts: { userId: string; email: string; code: string; now: Date }): Promise<{ outcome: RedeemOutcome; endsAt: string | null }> {
  const rows = must(
    await db.rpc("redeem_promo_code", { p_user: opts.userId, p_email: opts.email, p_code: cleanPromoCode(opts.code), p_now: opts.now.toISOString() }),
  ) as { outcome: RedeemOutcome; ends_at: string | null }[];
  return { outcome: rows[0].outcome, endsAt: rows[0].ends_at };
}

/** What the student sees for each outcome. */
export const REDEEM_MESSAGES: Record<RedeemOutcome, string> = {
  redeemed: "Done! You're on Finals.",
  not_found: "That code doesn't exist. Check it and try again.",
  used: "That code has already been used.",
  already_yours: "You've already used this code.",
  one_per_student: "You've already used a promo code.",
  already_finals: "You're already on Finals, so keep this code for someone else.",
};
