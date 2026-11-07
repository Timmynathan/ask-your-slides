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
  initialCourseId: string;
  initialTopicId: string | null;
  initialChatId: string | null;
  user: { email: string; displayName: string | null };
  partner: PartnerId;
  usage: { used: number; cap: number };
}
