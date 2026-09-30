// src/lib/adminAuth.ts
//
// Server-only helper that answers "who is calling, and are they an admin?"
// for admin pages and API routes. Replaces the copy-pasted requireAdmin()
// functions that used `supabase.auth.setSession()` on a shared, module-level
// client.
//
// Supabase docs: auth.getUser(jwt) validates the token with the Auth server
// (safe for authorization decisions) and, when given a JWT, does not touch any
// stored session. auth.refreshSession({ refresh_token }) returns a new session.
import type { AstroCookies } from "astro";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// A dedicated client used ONLY for auth calls. It is deliberately not the
// `supabaseAdmin` client: refreshSession() stores the session it obtains on
// the client, and a client holding a user session sends that user's JWT on
// later database calls instead of the service-role key.
// Created on first use, so requests without login cookies never need it.
let authClient: SupabaseClient | null = null;

function getAuthClient(): SupabaseClient {
  if (!authClient) {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Missing SUPABASE_SERVICE_ROLE_KEY (or the Supabase URL) in your environment.",
      );
    }
    authClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return authClient;
}

const ACCESS_COOKIE = "sb-access-token";
const REFRESH_COOKIE = "sb-refresh-token";

// Same options the sign-in route uses (src/pages/api/auth/signin.ts).
const COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
} as const;

export function isAdminUser(user: User | null | undefined): boolean {
  return (
    user?.app_metadata?.role === "admin" || user?.user_metadata?.role === "admin"
  );
}

/**
 * The name to show for a signed-in user: the display name stored in Supabase
 * Auth user_metadata.display_name, then user_metadata.name (which the staff
 * pages already use), then the part of the email before the "@".
 * user_metadata.name is never written by the display-name feature, so the
 * staff URL matching that depends on it is unaffected.
 */
export function getDisplayName(user: User | null | undefined): string {
  const meta = user?.user_metadata ?? {};
  const fromMeta = [meta.display_name, meta.name].find(
    (v) => typeof v === "string" && v.trim().length > 0,
  ) as string | undefined;
  return fromMeta?.trim() || user?.email?.split("@")[0] || "User";
}

/**
 * Returns the signed-in user for this request, or null. If the access token
 * has expired but the refresh token is still valid, the session is refreshed
 * and both cookies are rewritten so the next request keeps working.
 */
export async function getSessionUser(
  cookies: AstroCookies,
): Promise<User | null> {
  const accessToken = cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookies.get(REFRESH_COOKIE)?.value;
  if (!accessToken && !refreshToken) return null;

  if (accessToken) {
    const { data, error } = await getAuthClient().auth.getUser(accessToken);
    if (!error && data.user) return data.user;
  }

  if (refreshToken) {
    const { data, error } = await getAuthClient().auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (!error && data.session && data.user) {
      cookies.set(ACCESS_COOKIE, data.session.access_token, COOKIE_OPTIONS);
      cookies.set(REFRESH_COOKIE, data.session.refresh_token, COOKIE_OPTIONS);
      return data.user;
    }
  }

  return null;
}

/** The signed-in user if (and only if) they are an admin; otherwise null. */
export async function getAdminUser(
  cookies: AstroCookies,
): Promise<User | null> {
  const user = await getSessionUser(cookies);
  return isAdminUser(user) ? user : null;
}

/**
 * For admin PAGES. Returns either the admin user or a Response the page
 * should `return` straight away (redirect to login / 403).
 *
 * When the login cookies are present but no longer valid they are removed
 * before redirecting; otherwise /admin/login (which redirects away whenever
 * it sees a cookie) and /admin would bounce between each other forever.
 */
export async function guardAdminPage(
  cookies: AstroCookies,
  redirect: (path: string) => Response,
): Promise<{ user: User; response: null } | { user: null; response: Response }> {
  const user = await getSessionUser(cookies);
  if (!user) {
    cookies.delete(ACCESS_COOKIE, { path: "/" });
    cookies.delete(REFRESH_COOKIE, { path: "/" });
    return { user: null, response: redirect("/admin/login") };
  }
  if (!isAdminUser(user)) {
    return {
      user: null,
      response: new Response("Forbidden: Admin access required.", {
        status: 403,
      }),
    };
  }
  return { user, response: null };
}
