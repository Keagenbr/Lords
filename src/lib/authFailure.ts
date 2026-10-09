// Login failure handling + brute-force protection, shared by the admin
// sign-in route (src/pages/api/auth/signin.ts) and the staff login page.
//
// WHAT IT DOES
//   1. Counts failed sign-ins per client IP and per email address.
//   2. After MAX_FAILURES wrong attempts inside WINDOW_MS, locks that IP or
//      email out for LOCKOUT_MS (the caller answers with HTTP 429).
//   3. Turns ANY failure (wrong password, unknown email, bad format) into
//      ONE generic message, so an attacker cannot tell "this email exists"
//      from "this password is wrong" (user enumeration).
//
// LIMITATION (important): the counters live in this server instance's
// memory. On Vercel serverless functions each instance has its own memory
// and it resets on a cold start, so this slows down guessing but is NOT a
// hard guarantee. Supabase Auth also rate-limits sign-ins on its side. For a
// strict limit use a shared store (e.g. Upstash Redis or a Supabase table).

// ── Tunable limits ────────────────────────────────────────────
export const MAX_FAILURES = 5; // wrong attempts allowed...
export const WINDOW_MS = 15 * 60 * 1000; // ...within 15 minutes
export const LOCKOUT_MS = 15 * 60 * 1000; // lock duration once exceeded

// ── Failure codes (used in redirect URLs so no free text is reflected) ──
export type LoginFailureCode = "missing" | "invalid" | "locked" | "error";

interface Entry {
  failures: number; // failed attempts in the current window
  windowStart: number; // when the current window began (ms epoch)
  lockedUntil: number; // 0 when not locked (ms epoch)
}

// One map holds both kinds of key: "ip:1.2.3.4" and "email:a@b.com".
const attempts = new Map<string, Entry>();

// Keep memory bounded: drop expired entries whenever the map gets large.
function prune(now: number) {
  if (attempts.size < 500) return;
  for (const [key, e] of attempts) {
    const windowOver = now - e.windowStart > WINDOW_MS;
    const lockOver = e.lockedUntil <= now;
    if (windowOver && lockOver) attempts.delete(key);
  }
}

/** Best-effort client IP. Vercel sets x-forwarded-for; fall back to Astro's clientAddress. */
export function getClientIp(request: Request, clientAddress?: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  // The first entry is the original client; the rest are proxies.
  const first = forwarded?.split(",")[0]?.trim();
  return first || clientAddress || "unknown";
}

const keysFor = (ip: string, email: string) => [
  `ip:${ip}`,
  // Normalise so "A@b.com" and "a@b.com " share one counter.
  `email:${email.trim().toLowerCase()}`,
];

export interface LoginCheck {
  allowed: boolean;
  retryAfterSeconds: number; // 0 when allowed
}

/** Call BEFORE contacting Supabase. If not allowed, answer 429 without trying the password. */
export function checkLoginAllowed(ip: string, email: string): LoginCheck {
  const now = Date.now();
  let retryAfterMs = 0;

  for (const key of keysFor(ip, email)) {
    const e = attempts.get(key);
    if (e && e.lockedUntil > now) {
      retryAfterMs = Math.max(retryAfterMs, e.lockedUntil - now);
    }
  }

  return {
    allowed: retryAfterMs === 0,
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
  };
}

export interface FailureResult {
  locked: boolean;
  attemptsLeft: number; // 0 once locked
  retryAfterSeconds: number; // >0 once locked
}

/** Call AFTER a wrong password / unknown email. Records it and reports what the user should be told. */
export function recordLoginFailure(ip: string, email: string): FailureResult {
  const now = Date.now();
  prune(now);

  let worstLeft = MAX_FAILURES;
  let lockedFor = 0;

  for (const key of keysFor(ip, email)) {
    let e = attempts.get(key);

    // Start a fresh window if there is none or the old one has expired.
    if (!e || now - e.windowStart > WINDOW_MS) {
      e = { failures: 0, windowStart: now, lockedUntil: 0 };
    }

    e.failures += 1;
    if (e.failures >= MAX_FAILURES) e.lockedUntil = now + LOCKOUT_MS;
    attempts.set(key, e);

    worstLeft = Math.min(worstLeft, Math.max(0, MAX_FAILURES - e.failures));
    if (e.lockedUntil > now) lockedFor = Math.max(lockedFor, e.lockedUntil - now);
  }

  return {
    locked: lockedFor > 0,
    attemptsLeft: lockedFor > 0 ? 0 : worstLeft,
    retryAfterSeconds: Math.ceil(lockedFor / 1000),
  };
}

/** Call after a SUCCESSFUL sign-in so a legitimate user starts clean. */
export function clearLoginFailures(ip: string, email: string): void {
  for (const key of keysFor(ip, email)) attempts.delete(key);
}

/**
 * Turns a failure into the text shown to the person.
 * The wording is identical for "wrong password" and "unknown email".
 */
export function describeLoginFailure(
  code: LoginFailureCode,
  opts: { attemptsLeft?: number; retryAfterSeconds?: number } = {},
): string {
  switch (code) {
    case "missing":
      return "Please enter both your email and password.";
    case "locked": {
      const mins = Math.max(1, Math.ceil((opts.retryAfterSeconds ?? 0) / 60));
      return `Too many failed attempts. Please try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
    }
    case "error":
      return "Something went wrong signing you in. Please try again.";
    case "invalid":
    default: {
      const base = "Incorrect email or password.";
      const left = opts.attemptsLeft;
      // Only warn when the person is getting close to a lockout.
      if (typeof left === "number" && left > 0 && left <= 3) {
        return `${base} ${left} attempt${left === 1 ? "" : "s"} left before a temporary lockout.`;
      }
      return base;
    }
  }
}

/**
 * Builds the query string the login page reads, e.g. "?error=invalid&left=2".
 * Only a short code and two numbers are passed, never free text, so the
 * page cannot be used to display attacker-supplied messages.
 */
export function failureQuery(
  code: LoginFailureCode,
  opts: { attemptsLeft?: number; retryAfterSeconds?: number } = {},
): string {
  const p = new URLSearchParams({ error: code });
  if (opts.attemptsLeft !== undefined) p.set("left", String(opts.attemptsLeft));
  if (opts.retryAfterSeconds) p.set("retry", String(opts.retryAfterSeconds));
  return `?${p.toString()}`;
}

/** Reads the query string written by failureQuery() back into a message ("" if none). */
export function messageFromQuery(params: URLSearchParams): string {
  const code = params.get("error");
  if (!code) return "";
  const known: LoginFailureCode[] = ["missing", "invalid", "locked", "error"];
  if (!known.includes(code as LoginFailureCode)) return "";
  const left = Number(params.get("left"));
  const retry = Number(params.get("retry"));
  return describeLoginFailure(code as LoginFailureCode, {
    attemptsLeft: Number.isFinite(left) ? left : undefined,
    retryAfterSeconds: Number.isFinite(retry) ? retry : undefined,
  });
}
