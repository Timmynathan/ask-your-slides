// A student's full name from their PAU email (owner, 26 Nov 2026: "the format is firstname.lastname@pau.edu.ng,
// use that for reports that use full names"). On 26 Nov, 115 of 127 student emails had exactly that shape
// (first name first: 38 matched the typed first name against 2 the other way round); 10 more had a hyphenated
// surname. The name a student types on the welcome page is often a nickname, so it stays the chat name and
// this one is only for documents they hand in or send.

const PART = "[a-z]+(?:-[a-z]+)*";
const SHAPE = new RegExp(`^${PART}(?:\\.${PART}){1,2}$`);

/** "chiamaka.okonkwo-eze@pau.edu.ng" → "Chiamaka Okonkwo-Eze"; null for any other shape or domain. */
export function nameFromEmail(email: string | null | undefined): string | null {
  const [local, domain, ...rest] = (email ?? "").trim().toLowerCase().split("@");
  if (rest.length || domain !== "pau.edu.ng" || !local || !SHAPE.test(local)) return null;
  return local
    .split(".")
    .map((part) => part.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("-"))
    .join(" ");
}
