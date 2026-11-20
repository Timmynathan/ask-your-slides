import { after, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readUpload } from "@/lib/uploads/process";

export const maxDuration = 300;

// POST: the browser has put the files in storage; read them now (after the response, so the student
// isn't kept waiting). Only the owner's own upload, and only once (status 'uploading').
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: up } = await supabase.from("user_uploads").select("id, status").eq("id", id).maybeSingle();
  if (!up) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  if (up.status !== "uploading") return NextResponse.json({ ok: true, status: up.status });
  const db = adminClient();
  await db.from("user_uploads").update({ status: "reading" }).eq("id", id).eq("status", "uploading");
  after(() => readUpload(db, id));
  return NextResponse.json({ ok: true, status: "reading" }, { status: 202 });
}
