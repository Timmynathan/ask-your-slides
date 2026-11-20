// "How did you hear about us?" at sign-up (owner, 20 Nov 2026). Same ids as the check on
// profiles.heard_from (supabase/migrations/20261120000001_heard_from.sql).
export const HEARD_FROM = [
  { id: "friend", label: "A friend" },
  { id: "course_rep", label: "My course rep" },
  { id: "tiktok", label: "TikTok" },
  { id: "snapchat", label: "Snapchat" },
  { id: "other", label: "Other" },
] as const;

export type HeardFrom = (typeof HEARD_FROM)[number]["id"];
export const HEARD_FROM_IDS = HEARD_FROM.map((h) => h.id) as [HeardFrom, ...HeardFrom[]];
