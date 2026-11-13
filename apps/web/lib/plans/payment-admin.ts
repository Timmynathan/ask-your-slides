// Admin decisions on payment requests (PRD F12, /admin/payments). Approving is the ONLY way a
// transfer becomes Finals: approve_payment_request() locks the request row, so a double click
// grants one plan; the amount was fixed when the student made the request (price lock). The
// student sees a "You're on Finals" pop-up the next time they open the app (no email).
import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/admin";
import { PLAN_END_DATE } from "./config";

type Db = ReturnType<typeof adminClient>;

export type ApproveOutcome = "approved" | "already_approved" | "rejected" | "not_found" | "plan_over";
export type RejectOutcome = "rejected" | "already_rejected" | "already_approved" | "not_found";

export interface AdminRequestRow {
  id: string;
  email: string;
  reference: string;
  amount_naira: number;
  referral_code: string | null;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

const COLUMNS = "id, email, reference, amount_naira, referral_code, status, note, decided_by, decided_at, created_at";

export async function listRequests(db: Db): Promise<{ pending: AdminRequestRow[]; recent: AdminRequestRow[] }> {
  const [pending, recent] = await Promise.all([
    db.from("payment_requests").select(COLUMNS).eq("status", "pending").order("created_at", { ascending: false }).limit(500),
    db.from("payment_requests").select(COLUMNS).neq("status", "pending").order("decided_at", { ascending: false }).limit(30),
  ]);
  return { pending: must(pending) as AdminRequestRow[], recent: must(recent) as AdminRequestRow[] };
}

export async function approveRequest(db: Db, id: string, admin: string, now = new Date()): Promise<ApproveOutcome> {
  if (now >= PLAN_END_DATE) return "plan_over";
  const [row] = must(await db.rpc("approve_payment_request", { p_request_id: id, p_ends_at: PLAN_END_DATE.toISOString(), p_admin: admin })) as {
    outcome: ApproveOutcome;
    entitlement_id: string | null;
  }[];
  return row?.outcome ?? "not_found";
}

export async function rejectRequest(db: Db, id: string, note: string | null, admin: string): Promise<RejectOutcome> {
  return must(await db.rpc("reject_payment_request", { p_request_id: id, p_note: (note ?? "").slice(0, 500), p_admin: admin })) as RejectOutcome;
}
