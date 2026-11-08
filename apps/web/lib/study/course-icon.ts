// A subject emoji for each course card, picked from words in the title, so new courses and
// departments get a sensible icon without code changes. First match wins; 📘 otherwise.
const RULES: [RegExp, string][] = [
  [/ethic|legal|law/i, "⚖️"],
  [/research|report|writing|methodolog/i, "📝"],
  [/data(base)?|management ii|sql|transaction/i, "🗄️"],
  [/iot|edge|embedded|sensor|network/i, "📡"],
  [/web|mobile|blockchain|internet/i, "🌐"],
  [/project management|management/i, "📋"],
  [/programming|software|coding|compiler|language/i, "💻"],
  [/intelligen|machine learning|\bai\b|neural/i, "🤖"],
  [/security|crypto/i, "🔐"],
  [/math|statistic|calculus|algebra/i, "📐"],
  [/graphic|design|interface/i, "🎨"],
];

export function courseIcon(title: string): string {
  return RULES.find(([re]) => re.test(title))?.[1] ?? "📘";
}
