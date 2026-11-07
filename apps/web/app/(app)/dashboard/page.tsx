import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard · PAU Study Assistant" };

// Phase 3 placeholder: proves a signed-in student can read course data through RLS.
// The real dashboard and chat arrive in phase 5.
async function Dashboard() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: courses, error }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase.from("courses").select("code, title, topics(count)").order("sort_order"),
  ]);
  return (
    <>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Signed in as {profile?.display_name ? `${profile.display_name} (${user.email})` : user.email}
      </p>
      {error ? (
        <p role="alert" className="mt-6 text-sm text-red-700">Couldn&apos;t load courses.</p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {courses?.map((c) => (
            <li key={c.code} className="px-3 py-2.5">
              <span className="font-medium">{c.code.replace(/^([A-Z]+)/, "$1 ")}</span>{" "}
              <span className="text-neutral-700 dark:text-neutral-300">— {c.title}</span>
              <span className="block text-xs text-neutral-500">{(c.topics as { count: number }[])[0]?.count ?? 0} topics</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your courses</h1>
        <form action="/api/auth/sign-out" method="post">
          <button className="text-sm text-neutral-600 underline dark:text-neutral-400">Sign out</button>
        </form>
      </div>
      <Suspense fallback={<p className="mt-6 text-sm text-neutral-500">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
