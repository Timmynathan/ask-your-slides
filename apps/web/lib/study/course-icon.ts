// A subject icon for each course card, picked from words in the title, so new courses and
// departments get a sensible icon without code changes. First match wins; "book" otherwise.
// The drawings live in components/dashboard/course-icon.tsx (minimal black line icons).
export type CourseIconId =
  | "scales" | "pen" | "database" | "signal" | "globe" | "checklist" | "code" | "spark" | "lock" | "ruler" | "palette" | "book";

const RULES: [RegExp, CourseIconId][] = [
  [/ethic|legal|law/i, "scales"],
  [/research|report|writing|methodolog/i, "pen"],
  [/data(base)?|management ii|sql|transaction/i, "database"],
  [/iot|edge|embedded|sensor|network/i, "signal"],
  [/web|mobile|blockchain|internet/i, "globe"],
  [/project management|management/i, "checklist"],
  [/programming|software|coding|compiler|language/i, "code"],
  [/intelligen|machine learning|\bai\b|neural/i, "spark"],
  [/security|crypto/i, "lock"],
  [/math|statistic|calculus|algebra/i, "ruler"],
  [/graphic|design|interface/i, "palette"],
];

export function courseIconId(title: string): CourseIconId {
  return RULES.find(([re]) => re.test(title))?.[1] ?? "book";
}
