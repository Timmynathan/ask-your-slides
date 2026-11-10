import { NextResponse } from "next/server";
import { z } from "zod";
import { programmeChoices } from "@/lib/programmes";
import { createClient } from "@/lib/supabase/server";

// Runs as the student: RLS + column grants allow only display_name, onboarded, study_partner,
// department, programme and level. A programme + level must be one the catalog offers (PRD F11).
const Body = z
  .object({
    display_name: z.string().trim().max(60).nullable().optional(),
    study_partner: z.enum(["tobi", "ada", "musa", "zara"]).optional(),
    onboarded: z.boolean().optional(),
    programme: z.string().trim().min(1).max(80).optional(),
    level: z.number().int().min(100).max(900).optional(),
  })
  .strict()
  .refine((b) => (b.programme === undefined) === (b.level === undefined), "Choose a programme and a level.");

/** POST {display_name?, study_partner?, onboarded?, programme?, level?} → updates the signed-in student's profile. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid profile update." }, { status: 400 });
  const update: Record<string, unknown> = { ...parsed.data };
  if (update.display_name !== undefined) update.display_name = update.display_name || null;
  if (parsed.data.programme !== undefined) {
    const choice = (await programmeChoices(supabase)).find((p) => p.programme === parsed.data.programme);
    if (!choice || !choice.levels.includes(parsed.data.level!)) {
      return NextResponse.json({ error: "Choose one of the programmes listed." }, { status: 400 });
    }
    update.department = choice.department; // shown by the partner and the admin dashboard
  }
  const { error } = await supabase.from("profiles").update(update).eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
