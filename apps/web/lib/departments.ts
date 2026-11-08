// Departments a student can pick at onboarding. Only those with slides ingested are available; the
// others show as "coming soon" so students see where the app is going. To open one up: ingest its
// courses (courses.department must match the name exactly), then set available: true.
export const DEPARTMENTS = [
  { name: "Computer Science", available: true },
  { name: "Engineering", available: false },
  { name: "Economics", available: false },
  { name: "Business Administration", available: false },
] as const;

export type Department = (typeof DEPARTMENTS)[number]["name"];

export const AVAILABLE_DEPARTMENTS = DEPARTMENTS.filter((d) => d.available).map((d) => d.name) as [Department, ...Department[]];
