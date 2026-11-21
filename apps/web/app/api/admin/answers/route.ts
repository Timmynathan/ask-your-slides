import { NextResponse } from "next/server";
import { isAdminEmail, rangeStart } from "@/lib/admin";
import { RANGES, type Overview, type Range } from "@/lib/admin-shared";
import { splitErrors } from "@/lib/admin/error-codes";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// /admin Answers, one page at a time (owner, 21 Nov 2026: the overview held only the latest 150
// answers, mostly test runs, so just 18 students' answers showed). Every student answer in the
// period; test runs (no student: the account was deleted) left out. Filters and search apply to
// all of them before paging.
//   GET ?range=7d&page=1&filter=all|down|errors|slow&q=…  → { rows, total, page, pages }
const PER_PAGE = 25;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !isAdminEmail(auth.user.email)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const url = new URL(request.url);
  const range = (RANGES.find((r) => r.id === url.searchParams.get("range"))?.id ?? "7d") as Range;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const filter = url.searchParams.get("filter") ?? "all";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const db = adminClient();
  const from = rangeStart(range);

  // A light list of every student answer in the period, to filter and count.
  type Light = { id: string; created_at: string; user_id: string | null; message_id: string | null; errors: { code: string }[]; latency_ms: number | null; user_message: string };
  let light: Light[] = [];
  for (let off = 0; ; off += 1000) {
    let query = db.from("traces").select("id, created_at, user_id, message_id, errors, latency_ms, user_message").eq("kind", "chat").not("user_id", "is", null).order("created_at", { ascending: false }).range(off, off + 999);
    if (from) query = query.gte("created_at", from);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Couldn't load answers." }, { status: 500 });
    light = light.concat((data ?? []) as Light[]);
    if (!data || data.length < 1000) break;
  }
  let down = new Set<string>();
  if (filter === "down") {
    const { data } = await db.from("feedback").select("message_id").eq("rating", -1);
    down = new Set((data ?? []).map((f) => f.message_id as string));
  }
  const kept = light.filter(
    (r) =>
      (filter === "all" ||
        (filter === "down" && r.message_id && down.has(r.message_id)) ||
        (filter === "errors" && splitErrors(r.errors ?? []).problems.length > 0) ||
        (filter === "slow" && (r.latency_ms ?? 0) > 15000)) &&
      (!q || r.user_message.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(kept.length / PER_PAGE));
  const ids = kept.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((r) => r.id);
  if (!ids.length) return NextResponse.json({ rows: [], total: kept.length, page, pages });

  const { data: full, error } = await db
    .from("traces")
    .select("id, created_at, user_message, output_text, cost_usd, ttft_ms, latency_ms, input_tokens, output_tokens, tool_calls, citations, invalid_citations, errors, message_id, courses(code), profiles(email)")
    .in("id", ids);
  if (error) return NextResponse.json({ error: "Couldn't load answers." }, { status: 500 });
  const msgIds = (full ?? []).map((r) => r.message_id).filter(Boolean) as string[];
  const { data: ratings } = msgIds.length ? await db.from("feedback").select("message_id, rating").in("message_id", msgIds) : { data: [] };
  const rating = new Map((ratings ?? []).map((f) => [f.message_id as string, f.rating as 1 | -1]));
  const byId = new Map((full ?? []).map((r) => [r.id as string, r]));
  const rows: Overview["recent"] = ids.map((id) => {
    const r = byId.get(id)!;
    return {
      id,
      created_at: r.created_at,
      course: (r.courses as unknown as { code: string } | null)?.code ?? null,
      student: (r.profiles as unknown as { email: string } | null)?.email ?? null,
      question: r.user_message,
      answer: (r.output_text ?? "").slice(0, 4000),
      cost_usd: r.cost_usd,
      ttft_ms: r.ttft_ms,
      latency_ms: r.latency_ms,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      tools: ((r.tool_calls ?? []) as { name: string }[]).map((t) => t.name),
      cited: ((r.citations ?? []) as unknown[]).length,
      invalid_citations: ((r.invalid_citations ?? []) as unknown[]).length,
      errors: (r.errors ?? []) as { code: string; detail?: string }[],
      rating: r.message_id ? rating.get(r.message_id) ?? null : null,
    };
  });
  return NextResponse.json({ rows, total: kept.length, page, pages });
}
