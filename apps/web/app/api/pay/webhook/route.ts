import { NextResponse } from "next/server";
import { settlePayment, validSignature, verifyTransaction, type PaystackTransaction } from "@/lib/plans/paystack";
import { adminClient } from "@/lib/supabase/admin";

// POST /api/pay/webhook: Paystack → us (set this URL in the Paystack dashboard).
// 1. The x-paystack-signature header must be the HMAC-SHA512 of the raw body with our secret key;
//    anything else is refused before the body is even parsed.
// 2. charge.success: the transaction is re-read from Paystack's verify endpoint, and only that
//    answer is used to grant (settlePayment checks amount and currency, and grants once per
//    reference, so replays are harmless).

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let event: { event?: string; data?: Partial<PaystackTransaction> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (event.event !== "charge.success" || typeof event.data?.reference !== "string") {
    return NextResponse.json({ ok: true, ignored: event.event ?? null });
  }

  const tx = await verifyTransaction(event.data.reference);
  if (!tx) {
    // Paystack retries webhooks that don't get a 200; let it, so a verify outage isn't lost.
    return NextResponse.json({ error: "couldn't verify with Paystack" }, { status: 502 });
  }
  const result = await settlePayment(adminClient(), tx, event);
  if (result.outcome === "mismatch") console.error("payment mismatch", tx.reference, result.reason);
  return NextResponse.json({ ok: true, outcome: result.outcome });
}
