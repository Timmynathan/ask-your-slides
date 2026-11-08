// Shared by the /admin server page and the dashboard component (no secrets here).
export type Range = "7d" | "30d" | "90d" | "all";
export const RANGES: { id: Range; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
];

export function rangeStart(range: Range): string | null {
  const days = { "7d": 7, "30d": 30, "90d": 90, all: 0 }[range];
  return days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
}

/** Shape of public.admin_overview() (supabase/migrations/…_admin_overview.sql). */
export interface Overview {
  generated_at: string;
  from: string;
  totals: {
    students_signed_up: number; students_onboarded: number; new_students: number; active_students: number;
    questions: number; answers: number; answers_with_errors: number; cost_usd: number; cost_per_answer: number | null;
    avg_ttft_ms: number | null; p95_latency_ms: number | null; thumbs_up: number; thumbs_down: number;
    helping_avg: number | null; helping_n: number; returning_3plus: number; cap_hits: number;
  };
  daily: { day: string; questions: number; active: number; answers: number; cost_usd: number; avg_ttft_ms: number | null; thumbs_up: number; thumbs_down: number }[];
  reasons: { reason: string; n: number }[];
  thumbs_down: { created_at: string; reason: string | null; comment: string | null; course: string | null; student: string | null; question: string | null; answer: string | null; cost_usd: number | null; latency_ms: number | null }[];
  courses: { code: string; title: string; students: number; questions: number; cost_usd: number; thumbs_up: number; thumbs_down: number }[];
  partners: { partner: string; n: number }[];
  departments: { department: string; n: number }[];
  helping: { score: number; n: number }[];
  recent: {
    id: string; created_at: string; course: string | null; student: string | null; question: string; answer: string | null;
    cost_usd: number | null; ttft_ms: number | null; latency_ms: number | null; input_tokens: number | null; output_tokens: number | null;
    tools: string[]; cited: number; invalid_citations: number; errors: { code: string; detail?: string }[]; rating: 1 | -1 | null;
  }[];
  slowest: { created_at: string; course: string | null; question: string; latency_ms: number; ttft_ms: number | null; cost_usd: number | null }[];
  costliest: { created_at: string; course: string | null; question: string; cost_usd: number; input_tokens: number | null; output_tokens: number | null }[];
  error_codes: { code: string; n: number }[];
  students: {
    email: string; name: string | null; department: string | null; partner: string | null; joined: string; onboarded: boolean;
    questions: number; questions_all_time: number; cost_usd: number; last_active: string | null; thumbs_up: number; thumbs_down: number; helping: number | null;
  }[];
}
