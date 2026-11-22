// Plans and payments (PRD F12). EVERY number, price and date of the plans lives here: the server
// enforces them, and the pricing page and landing page read them. Change a value here only.
//
// Dates are instants with the Lagos offset (+01:00, no daylight saving in Nigeria).

export const TIME_ZONE = "Africa/Lagos";

// ── Free (forever) ─────────────────────────────────────────────
/** Messages on the account's first Lagos day. */
export const FREE_FIRST_DAY = 20;
/** Messages a day after that. */
export const FREE_DAILY = 5;
/** Questions per premium course on the first day (inside the daily cap). */
export const PREMIUM_FREE_FIRST_DAY = 8;
/** Questions per premium course a day after that (inside the daily cap). */
export const PREMIUM_FREE_DAILY = 2;
/** Summaries in total, ever, in any course. */
export const FREE_SUMMARIES = 1;
/** Past questions are Finals only (owner, 14 Nov 2026): Free gets none, not even the questions or the
 *  original papers. Kept as a number so a free allowance can come back by changing it here. */
export const FREE_PRACTICE_PER_COURSE = 0;
/** Programmes whose past questions are open to everyone, Free included (owner, 15 Nov 2026): so few
 *  papers that they aren't worth selling. Questions, model answers, marking and the original papers.
 *  Remove a programme here once it has enough papers. */
export const FREE_PAST_PROGRAMMES: readonly string[] = ["mass-communication", "mechanical-engineering"];

// ── Finals (one-time payment) ───────────────────────────────────
/** Messages a day. No premium-course limit, unlimited summaries, quiz mode. */
export const FINALS_DAILY = 40;
/** Naira, before PRICE_CHANGE_DATE. */
export const FINALS_PRICE_EARLY = 3_000;
/** Naira, from PRICE_CHANGE_DATE. */
export const FINALS_PRICE = 5_000;
/** The early price ends here: 27 Nov 2026, 23:59 Lagos (₦5,000 from 23:59:00). Moved from 22 Nov by the owner (22 Nov 2026). */
export const PRICE_CHANGE_DATE = new Date("2026-11-27T23:59:00+01:00");
/** Finals ends here: the last first-semester paper. OWNER: set the real date before launch
 *  (go-live checklist). Plans already sold keep the end date they were granted with. */
export const PLAN_END_DATE = new Date("2026-12-23T23:59:00+01:00");

// ── Paying (manual bank transfer, PRD F12) ──────────────────────
// Where students transfer and send the receipt (shown on /pay). Not secret. An env var with the
// same name overrides each one; set one to "" to show "Payments open soon" instead.
export const BANK_NAME = "Opay";
export const BANK_ACCOUNT_NUMBER = "8132265016";
export const BANK_ACCOUNT_NAME = "Ilesanmi Oluwatimilehin";
/** International format, digits only (wa.me). */
export const WHATSAPP_NUMBER = "2348132265016";
/** Pending payment requests a student can make in one Lagos day. */
export const MAX_PENDING_REQUESTS_A_DAY = 3;

// ── Promo codes (course reps) ───────────────────────────────────
/** Days of Finals a promo code gives, unless the admin picks another length when generating. */
export const PROMO_DAYS = 7;
/** Most codes generated at once in /admin/promo. */
export const PROMO_MAX_BATCH = 50;

export type PlanId = "free" | "finals";

export const PLAN_NAMES: Record<PlanId, string> = { free: "Free", finals: "Finals" };

// ── Own uploads (owner, 20 Nov 2026): photos of tests/notes or a PDF, read into the student's chats ──
/** How many uploads a student can have at once, per plan. */
export const UPLOADS_ALLOWED: Record<PlanId, number> = { free: 2, finals: 30 };
/** Photos per upload (a whole test). */
export const MAX_UPLOAD_PHOTOS = 10;
/** Pages read from one PDF (longer PDFs are refused). */
export const MAX_UPLOAD_PDF_PAGES = 20;
/** One file, in MB (photos are shrunk on the phone first, so this mostly limits PDFs). */
export const MAX_UPLOAD_MB = 15;
