import "server-only";

/** Pilot switch, now OFF in code (owner, 17 Nov 2026): it let anyone create an account for any PAU
 *  email without proving it was theirs. PAU IT approved "Continue with Microsoft", which proves it, so
 *  new accounts come from Microsoft (or the emailed code). AUTH_DIRECT_SIGNUP is ignored; to bring the
 *  old pilot mode back, restore `process.env.AUTH_DIRECT_SIGNUP === "1"` here. */
export function directSignupEnabled() {
  return false;
}
