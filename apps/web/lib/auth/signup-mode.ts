import "server-only";

/** TEMPORARY pilot switch: AUTH_DIRECT_SIGNUP=1 → Create account is email + password, no code. */
export function directSignupEnabled() {
  return process.env.AUTH_DIRECT_SIGNUP === "1";
}
