// Past questions (PRD F10) are built but not launched: exams are in December, so they open for every
// department at once, in a couple of weeks. Until then every course shows "Past questions · Soon"
// and a "Coming soon" page; the data routes are closed too. Launch: NEXT_PUBLIC_PAST_QUESTIONS=1.
export const PAST_QUESTIONS_LIVE = process.env.NEXT_PUBLIC_PAST_QUESTIONS === "1";
