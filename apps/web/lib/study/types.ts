export interface CourseItem {
  id: string;
  code: string;
  /** With institution, makes the course unique: the same code can exist in several programmes. */
  programme: string;
  department: string;
  title: string;
  sort_order: number;
}

export interface TopicItem {
  id: string;
  course_id: string;
  order: number;
  title: string;
}

/** A source document (deck, notes, reading…) as listed in the Sources panel. */
export interface MaterialItem {
  id: string;
  course_id: string;
  topic_id: string | null; // null: course-level (outline, other)
  kind: string;
  material_order: number;
  title: string;
  page_count: number;
}

export interface ChatItem {
  id: string;
  course_id: string;
  title: string;
  topic_id: string | null;
  updated_at: string;
}

import type { PartnerId } from "@/lib/partners";

export interface WorkspaceData {
  courses: CourseItem[];
  /** Every course's topics that have material (empty ones are hidden), loaded once so switching
   *  courses never waits on the server. */
  topics: TopicItem[];
  /** The student's chats across all courses, newest first. */
  chats: ChatItem[];
  /** This course's materials: what the partner reads (Sources panel). */
  materials: MaterialItem[];
  initialCourseId: string;
  initialTopicId: string | null;
  initialChatId: string | null;
  user: { email: string; displayName: string | null };
  partner: PartnerId;
  usage: { used: number; cap: number };
  /** For "Is this helping you study?": questions asked so far, and whether it has been answered. */
  pulse: { questions: number; answered: boolean };
  /** Past questions (PRD F10) of this course a student can practise: in total and per topic. */
  past: { total: number; byTopic: Record<string, number> };
  /** Opened with ?past=1: the Past questions view instead of a chat. */
  initialPast: boolean;
}
