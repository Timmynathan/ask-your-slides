import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";

// The study workspace lives at /study/[course]; /dashboard opens the first course.
async function OpenFirstCourse() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("courses").select("code").order("sort_order").limit(1).maybeSingle();
  if (data) redirect(`/study/${data.code}`);
  return <p className="p-8 text-sm text-neutral-600">No courses are available yet.</p>;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-neutral-500">Loading…</div>}>
      <OpenFirstCourse />
    </Suspense>
  );
}
