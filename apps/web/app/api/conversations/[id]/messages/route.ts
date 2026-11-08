import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** GET → the chat's messages, oldest first, each with the student's own rating (if any). RLS: only the owner's rows come back. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, citations, created_at, feedback(rating, reason)")
    .eq("conversation_id", id)
    .order("created_at")
    .limit(500);
  if (error) return NextResponse.json({ error: "Couldn't load this chat." }, { status: 500 });
  return NextResponse.json({ messages: data });
}
