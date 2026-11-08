import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// "Delete my account": removes the student and everything tied to them. Deleting the auth user
// cascades to the profile and from there to conversations, messages, feedback, the 1–5 answer and
// daily usage. Traces (question + answer logs) only lose their user link on cascade, so they are
// deleted here first. Irreversible, so the body must carry an explicit confirmation.
const Body = z.object({ confirm: z.literal("DELETE") }).strict();

export async function DELETE(request: Request) {
  const supabase = await createClient();
  // getUser(), not getClaims(): confirm with Supabase Auth itself before deleting anything.
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!Body.safeParse(await request.json().catch(() => null)).success) {
    return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  }
  const id = auth.user.id;
  const admin = adminClient();

  const { error: traceError } = await admin.from("traces").delete().eq("user_id", id);
  if (traceError) return NextResponse.json({ error: "Couldn't delete your account. Try again." }, { status: 500 });
  // End this browser's session (clears the cookies) before the user disappears.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: "Couldn't delete your account. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
