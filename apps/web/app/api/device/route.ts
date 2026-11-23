import { NextResponse } from "next/server";
import { z } from "zod";
import { readDevice } from "@/lib/device";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST {touch} from components/nav/device-beacon.tsx, at most once a day per device: records the kind of
// device, its system and browser for the admin dashboard (table user_devices; labels only, no raw text).
const Body = z.object({ touch: z.number().int().min(0).max(20).optional() });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => ({})));
  const device = readDevice(request.headers.get("user-agent") ?? "", body.success ? body.data.touch ?? 0 : 0);
  const { error } = await adminClient()
    .from("user_devices")
    .upsert({ user_id: auth.user.id, ...device, last_seen: new Date().toISOString() }, { onConflict: "user_id,kind,os,browser" });
  // Before the migration is pushed the table is missing: nothing to record, and nothing for the student to see.
  return NextResponse.json({ ok: !error });
}
