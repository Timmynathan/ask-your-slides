import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// PRD F7: thumbs up / down on an answer, with an optional reason on a thumbs down.
// Runs as the student: RLS allows rating only their own assistant messages.
const Body = z
  .object({
    message_id: z.string().uuid(),
    rating: z.union([z.literal(1), z.literal(-1), z.literal(0)]), // 0 = take the rating back
    reason: z.enum(["wrong", "not_in_slides", "too_long", "other"]).nullable().optional(),
    comment: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

/** POST {message_id, rating: 1 | -1 | 0, reason?, comment?} → saves (or clears) the student's rating. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  const { message_id, rating, reason, comment } = parsed.data;

  if (rating === 0) {
    const { error } = await supabase.from("feedback").delete().eq("message_id", message_id).eq("user_id", auth.user.id);
    if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const { error } = await supabase.from("feedback").upsert(
    {
      message_id,
      user_id: auth.user.id,
      rating,
      reason: rating === -1 ? reason ?? null : null,
      comment: rating === -1 ? comment || null : null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "message_id,user_id" },
  );
  if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: error.code === "42501" ? 403 : 500 });
  return NextResponse.json({ ok: true });
}
