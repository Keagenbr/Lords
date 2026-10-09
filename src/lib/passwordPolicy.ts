// Password strength rules, in one place so any "set / change password" form
// and its server route use the same checks.
//
// NOTE: this is a convenience check. The authoritative rules are the ones
// set in the Supabase dashboard (Authentication > Sign In / Providers >
// Email: minimum length and required characters, plus leaked-password
// protection on paid plans). Keep the two in step.

export const MIN_PASSWORD_LENGTH = 10;

// A few of the most common passwords; extend as needed.
const COMMON = new Set([
  "password", "password1", "password123", "123456789", "1234567890",
  "qwertyuiop", "letmein123", "welcome123", "admin12345", "iloveyou12",
]);

export interface PasswordCheck {
  ok: boolean; // true when every rule passes
  problems: string[]; // human-readable list of what is missing
  score: 0 | 1 | 2 | 3 | 4; // for a strength meter: 0 weak ... 4 strong
}

/** Validates a password. `email` (optional) stops people using their own email as a password. */
export function checkPasswordStrength(
  password: string,
  email = "",
): PasswordCheck {
  const problems: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!/[a-z]/.test(password)) problems.push("Add a lowercase letter.");
  if (!/[A-Z]/.test(password)) problems.push("Add an uppercase letter.");
  if (!/[0-9]/.test(password)) problems.push("Add a number.");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("Add a symbol (e.g. ! ? #).");

  if (COMMON.has(password.toLowerCase())) {
    problems.push("That password is too common.");
  }
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) {
    problems.push("Don't include your email name in your password.");
  }

  // Simple score: one point per character class plus one for length >= 14.
  let score = 0;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 14) score++;
  if (problems.length > 0) score = Math.min(score, 2) as 0 | 1 | 2;

  return {
    ok: problems.length === 0,
    problems,
    score: score as PasswordCheck["score"],
  };
}
