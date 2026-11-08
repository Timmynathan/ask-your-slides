import "server-only";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Does a confirmed account exist for this email? (Confirmed = the student proved the address with a
 * code, or the owner created it.) Used so "Create account" doesn't send a code to someone who
 * already has an account, and "Forgot password" doesn't to someone who has none.
 * Pages through the auth users with the service role; fine at pilot scale (thousands).
 */
export async function confirmedAccountExists(email: string): Promise<boolean> {
  const admin = adminClient();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return !!hit.email_confirmed_at;
    if (data.users.length < 1000) return false;
  }
  return false;
}
