import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tool, type Tool, type ToolSet } from "ai";
import { z } from "zod";
import { must } from "@/lib/supabase/admin";
import { embedQuery } from "./embed";
import { chunkBody, decideFallback, DEFAULT_KINDS, matchSlides, type SlideHit } from "./retrieval";
import { MATERIAL_KEY_RE, parseMaterialKey } from "@/lib/study/course-code";
import { calculate } from "./calculator";
import { solveLp, solveTransport } from "./optimizer";

// ── Context ──────────────────────────────────────────────────────────────────
// course and topic come from the conversation row, never from the model (PRD §10.2): no tool
// takes a course or topic id, so the model cannot reach another course.

export interface Citation {
  slide_key: string;
  slide_id: string;
  material_title: string;
  material_kind: string;
  slide_number: number;
  topic_title: string | null;
  outside_topic: boolean;
  /** Word section / notebook cells / code lines; the chip shows it instead of "Slide n". */
  label?: string | null;
  student_work?: boolean;
}

export interface ToolLogEntry {
  name: string;
  purpose: string;
  input: unknown;
  status: ToolStatus;
  slide_keys: string[];
  latency_ms: number;
  detail?: Record<string, unknown>;
  error?: string;
}

export interface AgentContext {
  db: SupabaseClient; // service role: RLS is bypassed, so every query below filters by courseId
  courseId: string;
  courseCode: string;
  courseTitle: string;
  topicId: string | null;
  topicTitle: string | null;
  /** Calculation course (course.yaml calculation_heavy): calculate and optimize are offered. */
  calculationHeavy?: boolean;
  /** slide_key → citation info: every slide a tool returned this turn. The only citable set. */
  retrieved: Map<string, Citation>;
  toolLog: ToolLogEntry[];
  fellBack: boolean;
  readMaterial: boolean;
  /** Every value calculate/optimize returned this turn (traces; the golden check compares answers to them). */
  computed: string[];
  abortSignal?: AbortSignal;
}

export function newContext(base: Omit<AgentContext, "retrieved" | "toolLog" | "fellBack" | "readMaterial" | "computed">): AgentContext {
  return { ...base, retrieved: new Map(), toolLog: [], fellBack: false, readMaterial: false, computed: [] };
}

// ── Tool definition helper (support-agent convention) ───────────────────────

type ToolStatus = "ok" | "not_found" | "refused" | "failed";

interface ToolOutcome {
  status: ToolStatus;
  result: Record<string, unknown>; // what the model receives
  slideKeys?: string[];
  detail?: Record<string, unknown>; // extra fields for the trace only
  error?: string;
}

interface ToolDefinition<S extends z.ZodObject> {
  name: string;
  purpose: string;
  description: string;
  input: S;
  handler(ctx: AgentContext, input: z.infer<S>): Promise<ToolOutcome>;
}

function refused(reason: string, messageForAgent: string): ToolOutcome {
  return { status: "refused", result: { ok: false, reason, message_for_agent: messageForAgent } };
}

function failure(error: unknown): ToolOutcome {
  return {
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    result: {
      ok: false,
      message_for_agent:
        "The course materials can't be searched right now. Tell the student you couldn't check their slides " +
        "this time and suggest trying again in a moment. Do not answer from memory as if it came from the slides.",
    },
  };
}

function defineTool<S extends z.ZodObject>(def: ToolDefinition<S>) {
  return {
    ...def,
    /** Validated, timed, logged, and never throws: a failure becomes an outcome the model can act on. */
    async run(ctx: AgentContext, input: z.infer<S>): Promise<Record<string, unknown>> {
      const started = Date.now();
      let outcome: ToolOutcome;
      try {
        outcome = await def.handler(ctx, input);
      } catch (e) {
        outcome = failure(e);
      }
      ctx.toolLog.push({
        name: def.name,
        purpose: def.purpose,
        input,
        status: outcome.status,
        slide_keys: outcome.slideKeys ?? [],
        latency_ms: Date.now() - started,
        detail: outcome.detail,
        error: outcome.error,
      });
      return outcome.result;
    },
    /** The AI SDK tool for one turn: the model supplies only the input; ctx comes from the server. */
    forTurn(ctx: AgentContext): Tool {
      return tool({
        description: def.description,
        inputSchema: def.input,
        execute: (input: z.infer<S>) => this.run(ctx, input),
      }) as Tool;
    },
  };
}

function remember(
  ctx: AgentContext,
  h: Pick<SlideHit, "slide_key" | "slide_id" | "material_title" | "material_kind" | "slide_number" | "topic_title" | "topic_id"> &
    Partial<Pick<SlideHit, "label" | "material_source">>,
) {
  ctx.retrieved.set(h.slide_key, {
    ...(h.label ? { label: h.label } : {}),
    ...(h.material_source === "student" ? { student_work: true } : {}),
    slide_key: h.slide_key,
    slide_id: h.slide_id,
    material_title: h.material_title,
    material_kind: h.material_kind,
    slide_number: h.slide_number,
    topic_title: h.topic_title,
    outside_topic: !!ctx.topicId && h.topic_id !== ctx.topicId,
  });
}

// ── search_slides ────────────────────────────────────────────────────────────

const MAX_SEARCH_RESULTS = 8; // PRD §10.6
// Below this, no result is about the question (unrelated matches score ~0.2; real ones 0.39+ across
// the pilot courses): the materials don't cover it (rule 6, not the thin-slides rule 5).
export const NO_MATCH_SIMILARITY = 0.3;

export const searchSlides = defineTool({
  name: "search_slides",
  purpose: "Find the slides/pages of this course that answer a question",
  description:
    "Hybrid search over this course's materials. Returns the best-matching slides/pages with their slide_key " +
    "(cite as [[s:slide_key]]), material, kind and topic. In a topic chat it searches the topic first and widens " +
    "to the whole course only when another topic matches clearly better; those results have outside_topic: true. " +
    "Use scope 'course' to search the whole course on purpose (e.g. connecting topics). Outlines and 'other' " +
    "materials are left out unless you include them.",
  input: z.object({
    query: z.string().trim().min(1).max(500).describe("What to look for, in the student's words plus key terms"),
    k: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional().describe("How many results (default 8)"),
    scope: z.enum(["topic", "course"]).optional().describe("Topic chats only: 'course' searches the whole course"),
    include: z
      .array(z.enum(["outline", "other"]))
      .optional()
      .describe("Also search these kinds: 'outline' for course structure/assessment, 'other' when the student asks for that document"),
  }),
  async handler(ctx, { query, k = MAX_SEARCH_RESULTS, scope, include = [] }) {
    const embedding = await embedQuery(query, ctx.abortSignal);
    const kinds = [...DEFAULT_KINDS, ...include];
    const base = { courseId: ctx.courseId, embedding, query, k, kinds };

    let hits: SlideHit[];
    let fellBack = false;
    let detail: Record<string, unknown> = { scope_used: "course" };
    if (ctx.topicId && scope !== "course") {
      const [inTopic, courseWide] = await Promise.all([
        matchSlides(ctx.db, { ...base, topicId: ctx.topicId }),
        matchSlides(ctx.db, base),
      ]);
      const decision = decideFallback(inTopic, courseWide, ctx.topicId);
      fellBack = decision.fellBack;
      hits = fellBack ? courseWide : inTopic;
      detail = { scope_used: fellBack ? "course_fallback" : "topic", ...decision };
      if (fellBack) ctx.fellBack = true;
    } else {
      hits = await matchSlides(ctx.db, base);
    }

    hits.forEach((h) => remember(ctx, h));
    const results = hits.map((h) => ({
      slide_key: h.slide_key,
      material: h.material_title,
      kind: h.material_kind,
      topic: h.topic_title ?? "course-level",
      ...(ctx.topicId ? { outside_topic: h.topic_id !== ctx.topicId } : {}),
      ...(h.label ? { location: h.label } : { slide: `${h.slide_number} of ${h.page_count}` }),
      ...(h.material_source === "student" ? { student_work: true } : {}),
      title: h.title,
      content: chunkBody(h.chunk_text),
      neighbours: { previous: h.prev_title, next: h.next_title },
    }));
    return {
      status: hits.length ? "ok" : "not_found",
      slideKeys: hits.map((h) => h.slide_key),
      detail: { ...detail, similarities: hits.map((h) => h.similarity) },
      result: {
        ok: true,
        scope_used: detail.scope_used,
        fell_back: fellBack,
        ...(fellBack ? { note: `The "${ctx.topicTitle}" materials don't cover this well; these results are from the whole course.` } : {}),
        ...(hits.length && hits.every((h) => (h.similarity ?? 0) < NO_MATCH_SIMILARITY)
          ? { coverage: "none" }
          : {}),
        results,
      },
    };
  },
});

// ── list_topics ──────────────────────────────────────────────────────────────

interface MaterialRow {
  id: string;
  material_order: number;
  title: string;
  kind: string;
  page_count: number;
  lms_section: string | null;
  topic_id: string | null;
  source?: "lecturer" | "student";
}

export function materialKey(courseCode: string, order: number) {
  return `${courseCode}-${String(order).padStart(2, "0")}`;
}

export const listTopics = defineTool({
  name: "list_topics",
  purpose: "Show the course structure: topics in order and the materials in each",
  description:
    "Lists this course's topics in teaching order, each with its materials (material key, title, kind, number of " +
    "pages, LMS section, which is often the week's dates), plus course-level materials such as the outline. Use it " +
    "for summaries, overviews, 'what's in this course' and to resolve requests like 'week 3' or 'the last lecture'.",
  input: z.object({}),
  async handler(ctx) {
    const [topics, materials] = await Promise.all([
      ctx.db.from("topics").select("id, topic_order, title").eq("course_id", ctx.courseId).order("topic_order"),
      ctx.db
        .from("materials")
        .select("id, material_order, title, kind, page_count, lms_section, topic_id, source")
        .eq("course_id", ctx.courseId)
        .order("material_order"),
    ]);
    const mats = must(materials) as MaterialRow[];
    const describe = (m: MaterialRow) => ({
      material: materialKey(ctx.courseCode, m.material_order),
      title: m.title,
      kind: m.kind,
      pages: m.page_count,
      lms_section: m.lms_section,
      ...(m.source === "student" ? { student_work: true } : {}),
    });
    return {
      status: "ok",
      result: {
        ok: true,
        course: ctx.courseTitle,
        topics: (must(topics) as { id: string; topic_order: number; title: string }[]).map((t) => ({
          order: t.topic_order,
          title: t.title,
          ...(t.id === ctx.topicId ? { this_chat: true } : {}),
          materials: mats.filter((m) => m.topic_id === t.id).map(describe),
        })),
        course_level_materials: mats.filter((m) => !m.topic_id).map(describe),
      },
    };
  },
});

// ── get_material_pages ───────────────────────────────────────────────────────

const MAX_PAGES_PER_CALL = 40; // PRD §10.6
const MAX_CHARS_PER_PAGE = 1500; // keeps a 40-page read of a dense reading within budget

export const getMaterialPages = defineTool({
  name: "get_material_pages",
  purpose: "Read a material's slides/pages in order (for summaries)",
  description:
    "Returns the slides/pages of one material in order, at most 40 per call (use from/to for longer ones). " +
    "Take the material key from list_topics, e.g. 'CSC420-02'. Each page has a slide_key to cite.",
  input: z.object({
    material: z.string().trim().regex(MATERIAL_KEY_RE, "Use a material key from list_topics, e.g. CSC420-02"),
    from: z.number().int().min(1).optional(),
    to: z.number().int().min(1).optional(),
  }),
  async handler(ctx, { material, from = 1, to }) {
    const { code, order } = parseMaterialKey(material)!;
    if (code !== ctx.courseCode) {
      return refused("other_course", `${material} is not in ${ctx.courseCode}. Use a material key from list_topics.`);
    }
    const mat = must(
      await ctx.db
        .from("materials")
        .select("id, title, kind, page_count, topic_id, source, topics(title)")
        .eq("course_id", ctx.courseId)
        .eq("material_order", Number(order))
        .maybeSingle(),
    ) as (MaterialRow & { topics: { title: string } | null }) | null;
    if (!mat) return refused("not_found", `There is no material ${material}. Call list_topics for the right key.`);

    const last = Math.min(to ?? from + MAX_PAGES_PER_CALL - 1, from + MAX_PAGES_PER_CALL - 1, mat.page_count);
    const rows = must(
      await ctx.db
        .from("slides")
        .select("id, slide_key, slide_number, title, chunk_text, label")
        .eq("material_id", mat.id)
        .gte("slide_number", from)
        .lte("slide_number", last)
        .order("slide_number"),
    ) as { id: string; slide_key: string; slide_number: number; title: string | null; chunk_text: string; label: string | null }[];

    ctx.readMaterial = true;
    rows.forEach((r) =>
      remember(ctx, {
        slide_key: r.slide_key, slide_id: r.id, material_title: mat.title, material_kind: mat.kind,
        slide_number: r.slide_number, topic_title: mat.topics?.title ?? null, topic_id: mat.topic_id,
        label: r.label, material_source: mat.source,
      }),
    );
    return {
      status: rows.length ? "ok" : "not_found",
      slideKeys: rows.map((r) => r.slide_key),
      result: {
        ok: true,
        material,
        title: mat.title,
        kind: mat.kind,
        topic: mat.topics?.title ?? "course-level",
        ...(mat.source === "student" ? { student_work: true } : {}),
        pages: `${from}–${last} of ${mat.page_count}`,
        ...(last < mat.page_count ? { more: `Call again with from: ${last + 1} for the rest.` } : {}),
        slides: rows.map((r) => {
          const body = chunkBody(r.chunk_text);
          return {
            slide_key: r.slide_key,
            ...(r.label ? { location: r.label } : { slide: r.slide_number }),
            title: r.title,
            content: body.length > MAX_CHARS_PER_PAGE ? `${body.slice(0, MAX_CHARS_PER_PAGE)}…` : body,
          };
        }),
      },
    };
  },
});

// ── The tool set handed to the model ─────────────────────────────────────────

// ── Calculation courses: the model writes the calculation, the server works out the numbers ──

const calcStep = z.object({
  name: z.string().trim().max(40).optional().describe("Optional variable name for this step's result, e.g. ke, wacc, npv_a"),
  expr: z.string().trim().min(1).max(600).describe("A maths expression; may use names from earlier steps"),
});

export const calculateTool = defineTool({
  name: "calculate",
  purpose: "Work out numbers exactly (worked examples, checks)",
  description:
    "Evaluates calculations exactly. Use it for EVERY number you state that is computed (not copied from a slide): " +
    "never do arithmetic yourself. Send all steps of one calculation in one call; each step may name its result for later steps. " +
    "Syntax: + - * / ^, parentheses, sqrt, exp, log (natural), log10, abs, round(x, n), sum, mean, median, std, variance, " +
    "max, min, matrices [[1,2],[3,4]], inv, transpose, det, multiply, units ('5 kN / 20 cm^2 to MPa', '1500 rpm to Hz'). " +
    "Finance (positive amounts; cash flow 0 is today): npv(rate, [cf0, cf1, ...]), irr([cf0, cf1, ...]), pv(rate, n, payment, future?), " +
    "fv(rate, n, payment, present?), pmt(rate, n, present, future?), annuity(rate, n) (annuity factor), discount(rate, n) (discount factor), " +
    "cagr(start, end, years), wavg(values, weights) (e.g. WACC). Econometrics: ols(X, y) = least-squares coefficients (put a column of 1s in X for the intercept). " +
    "Rates are decimals (12% = 0.12). Returns each step's value; show the student the steps.",
  input: z.object({ steps: z.array(calcStep).min(1).max(30) }),
  async handler(ctx, { steps }) {
    const r = calculate(steps);
    ctx.computed.push(...r.steps.map((s) => s.value));
    if (!r.ok) {
      return {
        status: "refused",
        result: {
          ok: false,
          done: r.steps,
          error: r.error,
          message_for_agent: `Step ${r.error!.step} failed: ${r.error!.message}. Fix that expression and call calculate again; don't compute it yourself.`,
        },
        detail: { values: r.steps.map((s) => s.value) },
      };
    }
    return { status: "ok", result: { ok: true, steps: r.steps.map(({ name, expr, value }) => ({ name, expr, value })) }, detail: { values: r.steps.map((s) => s.value) } };
  },
});

const lpConstraint = z.object({
  name: z.string().max(60).optional(),
  coefficients: z.record(z.string(), z.number()),
  op: z.enum(["<=", ">=", "="]),
  rhs: z.number(),
});

export const optimizeTool = defineTool({
  name: "optimize",
  purpose: "Check an optimisation answer (LP, transportation)",
  description:
    "Finds the true optimum of a linear programme or a transportation problem, to CHECK an answer. " +
    "Teach the method the slides use (graphical, simplex tableau, North-West corner, least cost, VAM, MODI) step by step yourself, " +
    "with calculate for the arithmetic; then call optimize and say whether the method's result is optimal (e.g. 'VAM gives 3,350, which is optimal'). " +
    "problem 'lp': sense max|min, objective {var: coefficient}, constraints [{coefficients {var: a}, op <=|>=|=, rhs}], integers? [vars]. " +
    "problem 'transportation': sources [{name, supply}], destinations [{name, demand}], costs[source][destination] (unit costs); " +
    "unbalanced problems get a zero-cost dummy, as on the slides.",
  input: z.object({
    problem: z.enum(["lp", "transportation"]),
    lp: z
      .object({
        sense: z.enum(["max", "min"]),
        objective: z.record(z.string(), z.number()),
        constraints: z.array(lpConstraint).min(1).max(100),
        integers: z.array(z.string()).optional(),
      })
      .optional(),
    transportation: z
      .object({
        sources: z.array(z.object({ name: z.string().max(60), supply: z.number().nonnegative() })).min(1).max(20),
        destinations: z.array(z.object({ name: z.string().max(60), demand: z.number().nonnegative() })).min(1).max(20),
        costs: z.array(z.array(z.number())).min(1).max(20),
      })
      .optional(),
  }),
  async handler(ctx, input) {
    if (input.problem === "lp") {
      if (!input.lp) return refused("missing_input", "problem 'lp' needs the lp field.");
      const r = solveLp(input.lp);
      if (r.objective !== null) ctx.computed.push(String(r.objective), ...Object.values(r.values).map(String));
      return { status: r.ok ? "ok" : "refused", result: { ...r }, detail: { objective: r.objective } };
    }
    if (!input.transportation) return refused("missing_input", "problem 'transportation' needs the transportation field.");
    const r = solveTransport(input.transportation);
    if (r.total_cost !== null) ctx.computed.push(String(r.total_cost), ...r.shipments.map((s) => String(s.quantity)));
    return { status: r.ok ? "ok" : "refused", result: { ...r }, detail: { total_cost: r.total_cost } };
  },
});

export const TOOLS = [searchSlides, listTopics, getMaterialPages];
export const CALC_TOOLS = [calculateTool, optimizeTool];

export function buildTools(ctx: AgentContext): ToolSet {
  const tools = ctx.calculationHeavy ? [...TOOLS, ...CALC_TOOLS] : TOOLS;
  return Object.fromEntries(tools.map((t) => [t.name, t.forTurn(ctx)]));
}
