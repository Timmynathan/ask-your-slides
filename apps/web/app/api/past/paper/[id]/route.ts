import { NextResponse } from "next/server";
import { PAST_QUESTIONS_LIVE } from "@/lib/past/feature";
import { planState } from "@/lib/plans/entitlement";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// GET /api/past/paper/<paper id> → the original paper's cleaned pages (PRD F10): signed image URLs,
// in order. Finals only, like every past question. The paper row is read as the student, so RLS
// decides whether they may see this course at all. Images: ingestion/past_pages.py.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_TTL_SECONDS = 60 * 60;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!UUID.test(id) || !PAST_QUESTIONS_LIVE) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const db = adminClient();
  const [{ data: paper }, state] = await Promise.all([
    supabase.from("past_papers").select("id, course_id").eq("id", id).maybeSingle(),
    planState(db, auth.user.id, new Date()),
  ]);
  if (!paper) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (state.plan !== "finals") return NextResponse.json({ locked: true, code: "past", pages: [] });

  const storage = db.storage.from("slides");
  const base = `${paper.course_id}/past/${paper.id}`;
  const { data: list } = await storage.download(`${base}/pages.json`);
  if (!list) return NextResponse.json({ pages: [] }); // not cleaned yet: the panel shows questions only
  const shown = ((JSON.parse(await list.text()) as { pages: number[] }).pages ?? []).filter((n) => Number.isInteger(n));
  const { data: signed } = await storage.createSignedUrls(shown.map((n) => `${base}/${n}.webp`), URL_TTL_SECONDS);
  const pages = shown.map((n, i) => ({ n, url: signed?.[i]?.signedUrl ?? null })).filter((p): p is { n: number; url: string } => !!p.url);
  return NextResponse.json({ pages }, { headers: { "Cache-Control": "private, max-age=600" } });
}
