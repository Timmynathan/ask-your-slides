// Where students go when they're stuck (forgotten password): forwarded to the owner's inbox.
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@askyourslides.com";

/** mailto: link with the "please reset my password" email already written. */
export function passwordHelpMailto(pauEmail: string): string {
  const subject = "Password reset request: Ask Your Slides";
  const body = `Hi,\n\nI forgot my password for Ask Your Slides. Please help me reset it.\n\nMy PAU email: ${pauEmail}\n\nThank you.`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
