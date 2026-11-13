import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import { approveRequest, rejectRequest } from "@/lib/plans/payment-admin";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST /api/admin/payments {id, action: "approve" | "reject", note?} (owner only, PRD F12)
// Checked here on every call, not only by the page or the proxy: anyone else gets a plain 404.
// Approve grants Finals until PLAN_END_DATE (once per request); reject never grants.

const Body = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
});

const MESSAGES: Record<string, string> = {
  approved: "Approved. Finals is on.",
  already_approved: "Already approved.",
  rejected: "Rejected.",
  already_rejected: "Already rejected.",
  not_found: "No such request.",
  plan_over: "PLAN_END_DATE has passed: set the new date in lib/plans/config.ts first.",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !isAdminEmail(auth.user.email)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { id, action, note } = parsed.data;
  const db = adminClient();
  const admin = auth.user.email!.toLowerCase();

  if (action === "approve") {
    const outcome = await approveRequest(db, id, admin, { origin: new URL(request.url).origin });
    // A request that was rejected can't be approved here (approve rejects it as "rejected").
    const status = outcome === "approved" || outcome === "already_approved" ? 200 : outcome === "not_found" ? 404 : 409;
    return NextResponse.json({ outcome, message: outcome === "rejected" ? "This request was rejected; it can't be approved." : MESSAGES[outcome] }, { status });
  }
  const outcome = await rejectRequest(db, id, note ?? null, admin);
  const status = outcome === "rejected" || outcome === "already_rejected" ? 200 : outcome === "not_found" ? 404 : 409;
  return NextResponse.json({ outcome, message: outcome === "already_approved" ? "Already approved; it can't be rejected." : MESSAGES[outcome] }, { status });
}
