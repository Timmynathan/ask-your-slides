import { NextResponse } from "next/server";
import { z } from "zod";
import { REDEEM_MESSAGES, redeemPromoCode } from "@/lib/plans/promo";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST /api/promo/redeem {code} → Finals for the code's days (PRD F12, course-rep promo codes).
// The database decides (one use per code, one code per student, not while already on Finals).

const Body = z.object({ code: z.string().trim().min(4).max(40) });

const STATUS = { redeemed: 200, already_yours: 409, used: 409, one_per_student: 409, already_finals: 409, not_found: 404 } as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ outcome: "not_found", error: REDEEM_MESSAGES.not_found }, { status: 400 });

  const { outcome, endsAt } = await redeemPromoCode(adminClient(), { userId: auth.user.id, email: auth.user.email ?? "", code: parsed.data.code, now: new Date() });
  if (outcome === "redeemed") return NextResponse.json({ outcome, ends_at: endsAt, message: REDEEM_MESSAGES.redeemed });
  return NextResponse.json({ outcome, error: REDEEM_MESSAGES[outcome] }, { status: STATUS[outcome] });
}
