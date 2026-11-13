// Past questions (PRD F10): launched 13 Nov 2026 for every final-year programme. On unless the
// kill switch NEXT_PUBLIC_PAST_QUESTIONS=0 is set (then every course shows "Past questions · Soon"
// and the data routes close again).
export const PAST_QUESTIONS_LIVE = process.env.NEXT_PUBLIC_PAST_QUESTIONS !== "0";
