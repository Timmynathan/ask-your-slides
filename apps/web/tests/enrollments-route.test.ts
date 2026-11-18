import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/enrollments: a student adds courses from their own programme at other levels only.
const STUDENT = { institution: "pau", programme: "computer-science", level: 400 };
const C300 = "11111111-1111-4111-8111-111111111111";
const C100 = "22222222-2222-4222-8222-222222222222";
const EMPTY = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

let filters: Record<string, unknown> = {};
const upsert = vi.fn(async () => ({ error: null }));
const del = vi.fn();

// Courses the database holds for this programme at other levels (the route asks with eq/neq filters).
const ROWS = [
  { id: C100, code: "COS101", code_confirmed: true, title: "Intro to CS", level: 100, sort_order: 5, materials: [{ count: 3 }] },
  { id: C300, code: "CSC301", code_confirmed: true, title: "Operating Systems", level: 300, sort_order: 9, materials: [{ count: 4 }] },
  { id: EMPTY, code: "CSC399", code_confirmed: true, title: "Nothing yet", level: 300, sort_order: 10, materials: [{ count: 0 }] },
];

function coursesQuery() {
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => ((filters[k] = v), q),
    neq: (k: string, v: unknown) => ((filters[`not_${k}`] = v), q),
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
        select: () => ({ eq: async () => ({ data: [{ course_id: C300 }], error: null }) }),
        upsert,
        delete: () => ({ eq: (_k: string, user: string) => ({ eq: async (_k2: string, course: string) => (del(user, course), { error: null }) }) }),
      };
    },
  }),
}));

const { GET, POST, DELETE } = await import("@/app/api/enrollments/route");
const req = (method: string, body: unknown) => new Request("http://localhost/api/enrollments", { method, body: JSON.stringify(body) });

describe("/api/enrollments", () => {
  beforeEach(() => {
    filters = {};
    upsert.mockClear();
    del.mockClear();
  });

  it("lists the student's programme at other levels, highest level first, only courses with materials", async () => {
    const body = await (await GET()).json();
    expect(filters).toMatchObject({ institution: "pau", programme: "computer-science", not_level: 400 });
    expect(body.courses.map((c: { id: string }) => c.id)).toEqual([C300, C100]);
    expect(body.courses[0]).toMatchObject({ code: "CSC 301", level: 300, enrolled: true });
    expect(body.courses[1]).toMatchObject({ enrolled: false });
  });

  it("adds an offered course", async () => {
    const res = await POST(req("POST", { course: C100 }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({ user_id: "user-1", course_id: C100 }, expect.anything());
  });

  it("refuses a course outside the student's programme, or one with nothing to study", async () => {
    expect((await POST(req("POST", { course: OTHER }))).status).toBe(400);
    expect((await POST(req("POST", { course: EMPTY }))).status).toBe(400);
    expect((await POST(req("POST", { course: "not-a-uuid" }))).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("removes only the student's own enrolment", async () => {
    expect((await DELETE(req("DELETE", { course: C300 }))).status).toBe(200);
    expect(del).toHaveBeenCalledWith("user-1", C300);
  });
});
