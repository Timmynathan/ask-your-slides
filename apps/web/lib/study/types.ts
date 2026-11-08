export interface CourseItem {
  id: string;
  code: string;
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
}
