import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

let client: SupabaseClient | undefined;

/** Service-role client: bypasses RLS. Server-only; used for retrieval, traces and usage. */
export function adminClient(): SupabaseClient {
  if (client) return client;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  client = createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

// supabase-js returns errors instead of throwing; this makes a failed query impossible to mistake
// for an empty result (same convention as support-agent's must()).
export function must<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new Error(`DB: ${result.error.message}${result.error.code ? ` (${result.error.code})` : ""}`);
  return result.data;
}
