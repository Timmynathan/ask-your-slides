import { NextResponse } from "next/server";
import { z } from "zod";
import { PLAN_END_DATE } from "@/lib/plans/config";
import { planState } from "@/lib/plans/entitlement";
import { finalsPrice } from "@/lib/plans/limits";
import { cleanReferral, initializeTransaction, newReference, paymentsOpen } from "@/lib/plans/paystack";
import { adminClient, must } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST /api/pay/checkout {referral_code?} → {authorization_url}
// Starts a one-time Finals payment (PRD F12). The SERVER decides the price (₦3,000 before
// PRICE_CHANGE_DATE, ₦5,000 after) and records it on the payment, so the webhook can check that
// what Paystack collected is what we asked for.

const Body = z.object({ referral_code: z.string().max(64).optional() }).catch({});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  if (!paymentsOpen()) return NextResponse.json({ error: "Payments open soon." }, { status: 503 });
  const body = Body.parse(await request.json().catch(() => ({})));
  const now = new Date();
  if (now >= PLAN_END_DATE) {
    return NextResponse.json({ error: "Finals for this semester has ended." }, { status: 410 });
  }

  const db = adminClient();
  const state = await planState(db, auth.user.id, now);
  if (state.plan === "finals") {
    return NextResponse.json({ error: "You already have Finals." }, { status: 409 });
  }

  const naira = finalsPrice(now);
  const reference = newReference();
  const referral = cleanReferral(body.referral_code);
  must(
    await db.from("payments").insert({
      user_id: auth.user.id,
      reference,
      plan: "finals",
      amount_kobo: naira * 100,
      currency: "NGN",
      status: "pending",
      referral_code: referral,
    }),
  );

  const origin = new URL(request.url).origin;
  try {
    const tx = await initializeTransaction({
      email: auth.user.email,
      amountKobo: naira * 100,
      reference,
      callbackUrl: `${origin}/pay/return`,
      metadata: { user_id: auth.user.id, plan: "finals", referral_code: referral },
    });
    return NextResponse.json({ authorization_url: tx.authorization_url, reference, amount: naira });
  } catch (e) {
    console.error("checkout failed", e);
    await db.from("payments").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json({ error: "Couldn't start the payment. Try again." }, { status: 502 });
  }
}
