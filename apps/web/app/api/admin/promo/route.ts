import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import { PROMO_DAYS, PROMO_MAX_BATCH } from "@/lib/plans/config";
import { createPromoCodes } from "@/lib/plans/promo";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST /api/admin/promo {count, days?, note?} → new single-use promo codes (owner only, PRD F12).
// Checked here on every call: anyone else gets a plain 404.

const Body = z.object({
  count: z.number().int().min(1).max(PROMO_MAX_BATCH),
  days: z.number().int().min(1).max(60).default(PROMO_DAYS),
  note: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !isAdminEmail(auth.user.email)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Pick 1 to ${PROMO_MAX_BATCH} codes and 1 to 60 days.` }, { status: 400 });
  const codes = await createPromoCodes(adminClient(), { ...parsed.data, admin: auth.user.email!.toLowerCase() });
  return NextResponse.json({ codes });
}
