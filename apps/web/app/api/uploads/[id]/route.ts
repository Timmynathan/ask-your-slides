import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// DELETE: the student removes one of their uploads: its files, its row and (by cascade) its chunks.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  // RLS: only the owner can see (and so delete) it.
  const { data: up } = await supabase.from("user_uploads").select("id, files").eq("id", id).maybeSingle();
  if (!up) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  const db = adminClient();
  if ((up.files as string[]).length) await db.storage.from("uploads").remove(up.files as string[]);
  const { error } = await supabase.from("user_uploads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Couldn't delete it. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
