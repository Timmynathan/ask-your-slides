import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Secrets live in the repo-root .env (shared with ingestion). On Vercel they come from project
// settings and this file is absent. Node's own loader, not @next/env's loadEnvConfig: that one
// caches its first call (Next's, for apps/web) and silently ignores a second directory.
// Variables already set in the environment win.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Inline the public values into every bundle (pages, routes and the proxy alike).
  // Server-only secrets are NOT listed: they stay in process.env and never reach the browser.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    NEXT_PUBLIC_PRIVACY_CONTACT: process.env.NEXT_PUBLIC_PRIVACY_CONTACT ?? "",
    // "1" shows "Continue with Microsoft" (once the Azure provider is configured in Supabase).
    NEXT_PUBLIC_MICROSOFT_LOGIN: process.env.NEXT_PUBLIC_MICROSOFT_LOGIN ?? "",
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // A page loaded ahead on hover (components/ui/hover-link.tsx) is reused for 30 s instead of
    // being fetched again on click (owner, 21 Nov 2026: courses were slow to open). A new chat
    // refreshes it (workspace.tsx), so lists don't show stale chats.
    staleTimes: { dynamic: 30 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
