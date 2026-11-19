import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/enrollments: a student adds courses of their own programme from other levels, and removes
// any course from My courses (own level → course_removals, other level → course_enrollments).
const STUDENT = { institution: "pau", programme: "computer-science", level: 400 };
const C400 = "55555555-5555-4555-8555-555555555555";
const C400B = "66666666-6666-4666-8666-666666666666";
const C300 = "11111111-1111-4111-8111-111111111111";
const C100 = "22222222-2222-4222-8222-222222222222";
const EMPTY = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

let filters: Record<string, unknown> = {};
const writes: { table: string; op: "upsert" | "delete"; user: string; course: string }[] = [];

// Courses the database holds for this programme (the route asks with eq filters).
const ROWS = [
  { id: C100, code: "COS101", code_confirmed: true, title: "Intro to CS", level: 100, sort_order: 5, materials: [{ count: 3 }] },
  { id: C400, code: "CSC402", code_confirmed: true, title: "Ethics", level: 400, sort_order: 2, materials: [{ count: 6 }] },
  { id: C300, code: "CSC301", code_confirmed: true, title: "Operating Systems", level: 300, sort_order: 9, materials: [{ count: 4 }] },
  { id: C400B, code: "CSC405", code_confirmed: true, title: "Project", level: 400, sort_order: 1, materials: [{ count: 2 }] },
  { id: EMPTY, code: "CSC399", code_confirmed: true, title: "Nothing yet", level: 300, sort_order: 10, materials: [{ count: 0 }] },
];
const OWNED: Record<string, string[]> = { course_enrollments: [C300], course_removals: [C400B] };

function coursesQuery() {
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => ((filters[k] = v), q),
    then: (ok: (r: unknown) => void) => ok({ data: ROWS, error: null }),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: STUDENT }) }) }) }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from: (table: string) => {
      if (table === "courses") return coursesQuery();
      return {
        select: () => ({ eq: async () => ({ data: OWNED[table].map((course_id) => ({ course_id })), error: null }) }),
        upsert: async (row: { user_id: string; course_id: string }) => (writes.push({ table, op: "upsert", user: row.user_id, course: row.course_id }), { error: null }),
        delete: () => ({ eq: (_k: string, user: string) => ({ eq: async (_k2: string, course: string) => (writes.push({ table, op: "delete", user, course }), { error: null }) }) }),
      };
    },
  }),
}));

const { GET, POST, DELETE } = await import("@/app/api/enrollments/route");
const req = (method: string, body: unknown) => new Request("http://localhost/api/enrollments", { method, body: JSON.stringify(body) });

describe("/api/enrollments", () => {
  beforeEach(() => {
    filters = {};
    writes.length = 0;
  });

  it("lists every level of the student's programme, highest first, only courses with materials", async () => {
    const body = await (await GET()).json();
    expect(filters).toMatchObject({ institution: "pau", programme: "computer-science" });
    expect(body.courses.map((c: { id: string }) => c.id)).toEqual([C400B, C400, C300, C100]);
    // Own level: in My courses unless removed. Other levels: only when added.
    expect(body.courses.map((c: { enrolled: boolean }) => c.enrolled)).toEqual([false, true, true, false]);
    expect(body.courses[2]).toMatchObject({ code: "CSC 301", level: 300 });
  });

  it("adds a course from another level", async () => {
    expect((await POST(req("POST", { course: C100 }))).status).toBe(200);
    expect(writes).toEqual([{ table: "course_enrollments", op: "upsert", user: "user-1", course: C100 }]);
  });

  it("removes a course of the student's own level, and brings it back", async () => {
    expect((await DELETE(req("DELETE", { course: C400 }))).status).toBe(200);
    expect((await POST(req("POST", { course: C400B }))).status).toBe(200);
    expect(writes).toEqual([
      { table: "course_removals", op: "upsert", user: "user-1", course: C400 },
      { table: "course_removals", op: "delete", user: "user-1", course: C400B },
    ]);
  });

  it("removes an added course from another level", async () => {
    expect((await DELETE(req("DELETE", { course: C300 }))).status).toBe(200);
    expect(writes).toEqual([{ table: "course_enrollments", op: "delete", user: "user-1", course: C300 }]);
  });

  it("refuses to add a course outside the student's programme, or one with nothing to study", async () => {
    expect((await POST(req("POST", { course: OTHER }))).status).toBe(400);
    expect((await POST(req("POST", { course: EMPTY }))).status).toBe(400);
    expect((await POST(req("POST", { course: "not-a-uuid" }))).status).toBe(400);
    expect(writes).toEqual([]);
  });
});
