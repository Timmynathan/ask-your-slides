// Admin decisions on payment requests (PRD F12, /admin/payments). Approving is the ONLY way a
// transfer becomes Finals: approve_payment_request() locks the request row, so a double click
// grants one plan; the amount was fixed when the student made the request (price lock).
import "server-only";
import { adminEmails, sendEmail } from "@/lib/email";
import type { adminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/admin";
import { FINALS_DAILY, PLAN_END_DATE, TIME_ZONE } from "./config";
import { naira } from "./offer";

type Db = ReturnType<typeof adminClient>;

export type ApproveOutcome = "approved" | "already_approved" | "rejected" | "not_found" | "plan_over";
export type RejectOutcome = "rejected" | "already_rejected" | "already_approved" | "not_found";

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: TIME_ZONE });

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

export async function approveRequest(db: Db, id: string, admin: string, opts: { now?: Date; origin: string }): Promise<ApproveOutcome> {
  if ((opts.now ?? new Date()) >= PLAN_END_DATE) return "plan_over";
  const [row] = must(await db.rpc("approve_payment_request", { p_request_id: id, p_ends_at: PLAN_END_DATE.toISOString(), p_admin: admin })) as {
    outcome: ApproveOutcome;
    entitlement_id: string | null;
  }[];
  if (row?.outcome === "approved") {
    const req = must(await db.from("payment_requests").select("email, reference, amount_naira").eq("id", id).single()) as Pick<AdminRequestRow, "email" | "reference" | "amount_naira">;
    await sendEmail({
      to: req.email,
      subject: "Finals is on — AskYourSlides",
      text: [
        `Your transfer of ${naira(req.amount_naira)} (reference ${req.reference}) is confirmed.`,
        "",
        `Finals is on until ${longDate.format(PLAN_END_DATE)}: ${FINALS_DAILY} messages a day, every course, unlimited summaries and quiz mode.`,
        "",
        `Start studying: ${opts.origin}/dashboard`,
        "",
        "Good luck with your exams.",
      ].join("\n"),
    });
  }
  return row?.outcome ?? "not_found";
}

export async function rejectRequest(db: Db, id: string, note: string | null, admin: string): Promise<RejectOutcome> {
  return must(await db.rpc("reject_payment_request", { p_request_id: id, p_note: (note ?? "").slice(0, 500), p_admin: admin })) as RejectOutcome;
}

/** Tells the owner(s) a new request is waiting. Never throws. */
export async function notifyNewRequest(r: { email: string; reference: string; amount: number; referral: string | null }, origin: string) {
  const to = adminEmails();
  if (!to.length) return;
  await sendEmail({
    to,
    subject: `New payment: ${naira(r.amount)} · ${r.reference}`,
    text: [
      `${r.email} says they've paid ${naira(r.amount)} for Finals.`,
      `Reference: ${r.reference}`,
      `Referral code: ${r.referral ?? "none"}`,
      "",
      "Check the transfer and the WhatsApp receipt, then approve or reject:",
      `${origin}/admin/payments`,
    ].join("\n"),
  });
}
