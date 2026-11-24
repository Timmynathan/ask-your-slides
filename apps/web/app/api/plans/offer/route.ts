import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FREE_PAST_PROGRAMMES } from "@/lib/plans/config";
import { paymentsOpen } from "@/lib/plans/manual-pay";
import { planOffer } from "@/lib/plans/offer";

// GET → what the Upgrade pop-up shows (components/plans/upgrade-dialog.tsx): today's Finals offer and
// whether past questions are already free in the student's programme. Prices come from the plans config.
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("programme").eq("id", auth.user.id).single();
  return NextResponse.json({
    offer: { ...planOffer(new Date()), paymentsOpen: paymentsOpen() },
    freePast: FREE_PAST_PROGRAMMES.includes(profile?.programme ?? ""),
  });
}
