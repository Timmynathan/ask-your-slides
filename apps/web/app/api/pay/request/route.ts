import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_PENDING_REQUESTS_A_DAY, PLAN_END_DATE } from "@/lib/plans/config";
import { planState } from "@/lib/plans/entitlement";
import { finalsPrice, lagosDayStart } from "@/lib/plans/limits";
import { cleanReferral, paymentDetails, referenceFor, whatsappText, whatsappUrl } from "@/lib/plans/manual-pay";
import { adminClient, must } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST /api/pay/request {referral_code?} → {reference, amount, whatsapp_url, status: "pending"}
// "I've sent it": records a pending payment request (PRD F12) and hands back the WhatsApp link
// with the receipt message filled in. This NEVER grants Finals: only an admin approval does.
// The SERVER decides the amount now and stores it on the request (price lock: a request made
// before PRICE_CHANGE_DATE stays at the early price, whenever it's approved).

const Body = z.object({ referral_code: z.string().max(64).optional() }).catch({});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const details = paymentDetails();
  if (!details) return NextResponse.json({ error: "Payments open soon." }, { status: 503 });
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

  const email = auth.user.email.toLowerCase();
  const reference = await referenceFor(db, auth.user.id);
  const amount = finalsPrice(now);
  const [row] = must(
    await db.rpc("create_payment_request", {
      p_user_id: auth.user.id,
      p_email: email,
      p_reference: reference,
      p_amount: amount,
      p_referral: cleanReferral(body.referral_code),
      p_since: lagosDayStart(now).toISOString(),
      p_max_pending: MAX_PENDING_REQUESTS_A_DAY,
    }),
  ) as { allowed: boolean; request_id: string | null; pending_today: number }[];
  if (!row?.allowed) {
    return NextResponse.json(
      { error: `You've sent ${MAX_PENDING_REQUESTS_A_DAY} payment requests today. We'll check them soon; message us on WhatsApp if it's urgent.` },
      { status: 429 },
    );
  }

  return NextResponse.json({
    status: "pending",
    request_id: row.request_id,
    reference,
    amount,
    whatsapp_url: whatsappUrl(details.whatsapp, whatsappText({ amount, email, reference })),
  });
}
