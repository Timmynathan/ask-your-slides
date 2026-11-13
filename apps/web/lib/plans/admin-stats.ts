// Plans numbers for the owner's /admin page (PRD F12): approved transfers and revenue in the period,
// active Finals plans (paid / comp), referral codes, and limit hits by kind. Service role only.
import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/admin";

type Db = ReturnType<typeof adminClient>;

export interface PlanStats {
  paid: number;
  revenueNaira: number;
  pending: number;
  activeFinals: { manual: number; comp: number };
  referrals: { code: string; paid: number; revenue: number; pending: number }[];
  limits: { feature: string; hits: number; students: number }[];
}

export async function planStats(db: Db, from: string | null, now = new Date()): Promise<PlanStats> {
  const nowIso = now.toISOString();
  const [payments, ents, refs, events] = await Promise.all([
    from ? db.from("payment_requests").select("status, amount_naira").gte("created_at", from) : db.from("payment_requests").select("status, amount_naira"),
    db.from("entitlements").select("source").lte("starts_at", nowIso).gt("ends_at", nowIso),
    db.from("referral_stats").select("referral_code, approved, revenue_naira, pending"),
    (from ? db.from("limit_events").select("feature, user_id").gte("created_at", from) : db.from("limit_events").select("feature, user_id")).limit(50_000),
  ]);
  const pay = must(payments) as { status: string; amount_naira: number }[];
  const ok = pay.filter((p) => p.status === "approved");
  const active = must(ents) as { source: "manual" | "comp" }[];
  const ev = must(events) as { feature: string; user_id: string }[];
  const byFeature = new Map<string, { hits: number; users: Set<string> }>();
  for (const e of ev) {
    const f = byFeature.get(e.feature) ?? { hits: 0, users: new Set<string>() };
    f.hits++;
    f.users.add(e.user_id);
    byFeature.set(e.feature, f);
  }
  return {
    paid: ok.length,
    revenueNaira: ok.reduce((s, p) => s + p.amount_naira, 0),
    pending: pay.filter((p) => p.status === "pending").length,
    activeFinals: { manual: active.filter((a) => a.source === "manual").length, comp: active.filter((a) => a.source === "comp").length },
    referrals: (must(refs) as { referral_code: string; approved: number; revenue_naira: number; pending: number }[]).map((r) => ({
      code: r.referral_code,
      paid: Number(r.approved),
      revenue: Number(r.revenue_naira),
      pending: Number(r.pending),
    })),
    limits: ["daily_cap", "premium_cap", "summary", "quiz", "past"].map((f) => ({ feature: f, hits: byFeature.get(f)?.hits ?? 0, students: byFeature.get(f)?.users.size ?? 0 })),
  };
}
