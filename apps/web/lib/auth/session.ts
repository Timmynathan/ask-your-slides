import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** For protected pages: the verified user, or a redirect to sign-in. Call inside <Suspense>. */
export async function requireUser() {
  const supabase = await createClient();
  // getUser() asks Supabase Auth to confirm the session, rather than trusting the cookie alone.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/sign-in");
  return { supabase, user: data.user };
}
