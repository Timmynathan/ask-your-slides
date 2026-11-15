// Past questions on Free vs Finals, and where each answer comes from (PRD F10/F12, answer design v2).
// Finals only (owner, 14 Nov 2026), except programmes with very few papers (15 Nov): Free gets nothing from /api/past or /api/past/attempt (the
// database is an in-memory stand-in; the plan lookup is mocked).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canPractise } from "@/lib/past/access";
import { GENERAL_NOTICE, GROUNDING_LABEL, groundingOf, paperSummary } from "@/lib/past/map";
import { FREE_PAST_PROGRAMMES, FREE_PRACTICE_PER_COURSE } from "@/lib/plans/config";

type Row = Record<string, unknown>;
let t: Record<string, Row[]>;
let plan: "free" | "finals";
const logged: unknown[] = [];

function makeDb() {
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    const match = () => (t[table] ?? []).filter((r) => filters.every(([k, v]) => (k === "past_questions.course_id" ? t.past_questions.find((q) => q.id === r.question_id)?.course_id === v : r[k] === v)));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      in: () => q,
      order: () => q,
      limit: () => q,
      single: async () => ({ data: match()[0] ?? null, error: match()[0] ? null : { message: "none" } }),
      maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
      insert: async (row: Row) => ((t[table] ??= []).push({ ...row, created_at: new Date().toISOString() }), { data: null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: match(), error: null }),
    };
    return q;
  };
  return { from };
}

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => makeDb(),
  must: <T,>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, ...makeDb() }) }));
vi.mock("@/lib/past/feature", () => ({ PAST_QUESTIONS_LIVE: true }));
vi.mock("@/lib/plans/entitlement", () => ({
  planState: async () => ({ plan, endsAt: null, createdAt: new Date() }),
  logLimitEvent: async (_db: unknown, e: unknown) => void logged.push(e),
}));

const attempt = (await import("@/app/api/past/attempt/route")).POST;
const reveal = (id: string) => attempt(new Request("http://localhost/api/past/attempt", { method: "POST", body: JSON.stringify({ question_id: id, reveal: true }) }));
const getPast = async (course: string) => (await import("@/app/api/past/route")).GET(new Request(`http://localhost/api/past?course=${course}`));
const Q = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

beforeEach(() => {
  plan = "free";
  logged.length = 0;
  const q = (n: number, course: string, relevance: string) => ({
    id: Q(n), course_id: course, paper_id: null, number: `Q${n}`, parent_id: null, text: "Explain.", marks: 5, type: "explain",
    relevance, model_answer: "<general>An answer.</general>", marking_scheme: [], answer_key: null, answer_explanation: null,
  });
  t = { past_questions: [q(1, "c1", "covered"), q(2, "c1", "not_covered"), q(3, "c2", "partial")], practice_attempts: [], slides: [], past_papers: [], question_topics: [],
    courses: [{ id: "c1", programme: "economics" }, { id: "c2", programme: "mass-communication" }] };
});

describe("Free gets no past questions; Finals gets everything", () => {
  it("Free: the list and every question are refused, and the refusal is logged", async () => {
    expect(FREE_PRACTICE_PER_COURSE).toBe(0);
    const list = await getPast("00000000-0000-4000-8000-0000000000c1");
    const body = await list.json();
    expect(body).toMatchObject({ locked: true, code: "past", plan: "free" });
    expect(body.questions).toBeUndefined(); // nothing is sent
    for (const n of [1, 2]) {
      const r = await reveal(Q(n));
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ code: "past", plan: "free" });
    }
    expect(logged).toEqual(expect.arrayContaining([expect.objectContaining({ feature: "past", courseId: "c1" })]));
  });

  it("Free: a programme with very few papers (FREE_PAST_PROGRAMMES) is open to everyone", async () => {
    expect(FREE_PAST_PROGRAMMES).toContain("mass-communication");
    expect((await reveal(Q(3))).status).toBe(200); // c2 is Mass Comm
    const pastPlanOf = (await import("@/lib/past/access")).pastPlan;
    const db = makeDb() as never;
    expect(await pastPlanOf(db, "c2", "free")).toBe("finals");
    expect(await pastPlanOf(db, "c1", "free")).toBe("free");
    expect(logged).toEqual([]);
  });

  it("Finals practises everything", async () => {
    plan = "finals";
    for (const n of [1, 2, 3]) expect((await reveal(Q(n))).status).toBe(200);
    expect(logged).toEqual([]);
  });

  it("canPractise mirrors the rule for the UI", () => {
    expect(canPractise({ plan: "free", freeQuestions: [], freeLimit: FREE_PRACTICE_PER_COURSE }, "a")).toBe(false);
    expect(canPractise({ plan: "finals", freeQuestions: [], freeLimit: FREE_PRACTICE_PER_COURSE }, "b")).toBe(true);
  });
});

describe("grounding", () => {
  it("comes from relevance and is sent with the answer", async () => {
    expect([groundingOf("covered"), groundingOf("partial"), groundingOf("not_covered"), groundingOf(null)]).toEqual(["slides", "partial", "general", null]);
    expect(GROUNDING_LABEL.general).toBe("Not from your slides");
    expect(GENERAL_NOTICE).toBe("Not from your slides. Either this topic hasn't been uploaded yet, or it isn't in this year's slides.");
    plan = "finals";
    expect(await (await reveal(Q(2))).json()).toMatchObject({ mode: "revealed", grounding: "general" });
  });

  it("each course lists its papers, newest first", () => {
    expect(paperSummary([{ session: "2024/2025", type: "exam" }, { session: "2025/2026", type: "test" }, { session: "2025/2026", type: "exam" }])).toBe(
      "3 papers: 2025/26 exam, 2025/26 test, 2024/25 exam",
    );
  });
});
