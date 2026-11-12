import { NextResponse } from "next/server";
import { planState } from "@/lib/plans/entitlement";
import { settlePayment, verifyTransaction } from "@/lib/plans/paystack";
import { adminClient, must } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// GET /api/pay/verify?reference=… → {status, plan}
// After Paystack sends the student back: asks Paystack (server to server) whether that payment
// went through, and grants Finals if it did. Works even if the webhook hasn't arrived yet; the
// grant is idempotent, so webhook and verify together still grant once. Only the student who
// started the payment can verify it.

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const reference = new URL(request.url).searchParams.get("reference") ?? "";
  if (!/^ays_[a-f0-9]{32}$/.test(reference)) return NextResponse.json({ error: "Unknown payment." }, { status: 400 });

  const db = adminClient();
  const payment = must(await db.from("payments").select("user_id, status").eq("reference", reference).maybeSingle()) as
    | { user_id: string; status: string }
    | null;
  if (!payment || payment.user_id !== auth.user.id) return NextResponse.json({ error: "Unknown payment." }, { status: 404 });

  if (payment.status !== "success") {
    const tx = await verifyTransaction(reference);
    if (tx) await settlePayment(db, tx, { source: "verify", data: tx });
  }
  const state = await planState(db, auth.user.id, new Date());
  const after = must(await db.from("payments").select("status").eq("reference", reference).single()) as { status: string };
  return NextResponse.json({ status: after.status, plan: state.plan, ends_at: state.endsAt?.toISOString() ?? null });
}
