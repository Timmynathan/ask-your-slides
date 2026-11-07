import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabasePublishableKey, supabaseUrl, withSessionLifetime } from "./config";

/** Per-request client that acts as the signed-in student (RLS applies). */
export async function createClient() {
  // Everything a signed-in Supabase client does is per-request, and supabase-js reads the clock
  // (token expiry). Tell Next before that happens, or Cache Components flags `Date.now()`.
  await connection();
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, withSessionLifetime(options)));
        } catch {
          // Called from a Server Component, which can't set cookies. The proxy refreshes the
          // session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
