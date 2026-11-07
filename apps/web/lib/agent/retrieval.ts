import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { must } from "@/lib/supabase/admin";

export const DEFAULT_KINDS = ["slides", "notes", "practical", "reading"] as const;
export type OptionalKind = "outline" | "other";

/**
 * Topic chats fall back to the whole course when another topic is clearly the better match:
 * best similarity outside the topic beats the best inside it by more than this margin.
 * A fixed similarity cutoff doesn't work: across the 7 courses, right-topic scores ranged
 * 0.39–0.75 and wrong-topic scores 0.33–0.71 (ingestion/verify.py). Calibrate on the golden set.
 */
export const FALLBACK_MARGIN = 0.05;

export interface SlideHit {
  slide_id: string;
  slide_key: string;
  material_id: string;
  material_title: string;
  material_kind: string;
  material_order: number;
  topic_id: string | null;
  topic_title: string | null;
  slide_number: number;
  page_count: number;
  title: string | null;
  chunk_text: string;
  prev_title: string | null;
  next_title: string | null;
  similarity: number | null;
  score: number;
}

export async function matchSlides(
  db: SupabaseClient,
  args: { courseId: string; embedding: number[]; query: string; k: number; topicId?: string | null; kinds?: readonly string[] },
): Promise<SlideHit[]> {
  return must(
    await db.rpc("match_slides", {
      p_course_id: args.courseId,
      p_query_embedding: JSON.stringify(args.embedding),
      p_query_text: args.query,
      p_k: args.k,
      p_topic_id: args.topicId ?? null,
      p_kinds: args.kinds ?? [...DEFAULT_KINDS],
    }),
  ) as SlideHit[];
}

export function bestSimilarity(hits: SlideHit[], filter: (h: SlideHit) => boolean = () => true): number {
  return hits.filter(filter).reduce((best, h) => Math.max(best, h.similarity ?? 0), 0);
}

export interface FallbackDecision {
  fellBack: boolean;
  bestInTopic: number;
  bestOutsideTopic: number;
}

/** Pure, so it can be unit-tested: should a topic search widen to the whole course? */
export function decideFallback(inTopic: SlideHit[], courseWide: SlideHit[], topicId: string): FallbackDecision {
  const bestInTopic = bestSimilarity(inTopic);
  const bestOutsideTopic = bestSimilarity(courseWide, (h) => h.topic_id !== topicId);
  const fellBack = inTopic.length === 0 || bestOutsideTopic - bestInTopic > FALLBACK_MARGIN;
  return { fellBack, bestInTopic, bestOutsideTopic };
}

/** The chunk without its Course/Topic/Material header lines (the tool result has those as fields). */
export function chunkBody(chunk: string): string {
  return chunk
    .split("\n")
    .filter((l, i) => !(i < 3 && /^(Course|Topic|Material \()/.test(l)))
    .join("\n")
    .trim();
}
