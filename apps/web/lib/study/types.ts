export interface CourseItem {
  id: string;
  code: string;
  title: string;
  sort_order: number;
}

export interface TopicItem {
  id: string;
  order: number;
  title: string;
}

export interface ChatItem {
  id: string;
  title: string;
  topic_id: string | null;
  updated_at: string;
}

export interface WorkspaceData {
  courses: CourseItem[];
  course: CourseItem;
  topics: TopicItem[]; // only topics that have material (empty ones are hidden)
  chats: ChatItem[];
  initialTopicId: string | null;
  initialChatId: string | null;
  user: { email: string; displayName: string | null };
  usage: { used: number; cap: number };
}
