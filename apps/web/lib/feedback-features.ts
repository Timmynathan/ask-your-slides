// The features a student can tag in the Feedback window (owner, 20 Nov 2026). Shared by the dialog,
// the API (validation) and the admin page (labels).
export const FEEDBACK_FEATURES = [
  { id: "bug", label: "Bugs" },
  { id: "request", label: "Feature request" },
  { id: "chat", label: "Chat" },
  { id: "past", label: "Past questions" },
  { id: "upload", label: "Uploading files" },
  { id: "slides", label: "Slides" },
  { id: "partners", label: "Study partners" },
  { id: "quiz", label: "Quiz" },
  { id: "summaries", label: "Summaries" },
  { id: "plans", label: "Plans & payment" },
  { id: "other", label: "Other" },
] as const;

export type FeedbackFeature = (typeof FEEDBACK_FEATURES)[number]["id"];
export const FEEDBACK_FEATURE_IDS = FEEDBACK_FEATURES.map((f) => f.id) as [FeedbackFeature, ...FeedbackFeature[]];
export const featureLabel = (id: string) => FEEDBACK_FEATURES.find((f) => f.id === id)?.label ?? id;
