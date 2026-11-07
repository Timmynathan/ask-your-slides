import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Runs as the student: RLS + column grants allow only display_name, onboarded and study_partner.
const Body = z
  .object({
    display_name: z.string().trim().max(60).nullable().optional(),
    study_partner: z.enum(["tobi", "ada", "musa", "zara"]).optional(),
    onboarded: z.boolean().optional(),
  })
  .strict();

/** POST {display_name?, study_partner?, onboarded?} → updates the signed-in student's profile. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile update." }, { status: 400 });
  const update = { ...parsed.data };
  if (update.display_name !== undefined) update.display_name = update.display_name || null;
  const { error } = await supabase.from("profiles").update(update).eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
