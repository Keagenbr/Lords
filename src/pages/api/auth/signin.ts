import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";
import {
  checkLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
  getClientIp,
  failureQuery,
} from "../../../lib/authFailure";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect, clientAddress }) => {
  let email = "";
  let password = "";

  const contentType = request.headers.get("content-type") || "";

  // 1. Handle multipart/form-data submissions directly
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    email = formData.get("email")?.toString() || "";
    password = formData.get("password")?.toString() || "";
  } else {
    // 2. Read the body text ONCE to prevent Node stream locking
    const rawText = await request.text();

    // Check for standard form encoding (URLSearchParams)
    const params = new URLSearchParams(rawText);
    email = params.get("email") || "";
    password = params.get("password") || "";

    // Fallback to JSON payload if form fields were empty
    if (!email && !password && rawText.trim().startsWith("{")) {
      try {
        const json = JSON.parse(rawText);
        email = json.email || "";
        password = json.password || "";
      } catch {}
    }
  }

  // Every failure sends the person back to the login page with a short
  // error code (see src/lib/authFailure.ts), instead of a bare text response.
  if (!email || !password) {
    return redirect(`/admin/login${failureQuery("missing")}`);
  }

  // 1. Brute-force protection: refuse BEFORE contacting Supabase when this
  //    IP or email is locked out. 429 + Retry-After is the standard signal.
  const ip = getClientIp(request, clientAddress);
  const gate = checkLoginAllowed(ip, email);
  if (!gate.allowed) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: `/admin/login${failureQuery("locked", { retryAfterSeconds: gate.retryAfterSeconds })}`,
        "Retry-After": String(gate.retryAfterSeconds),
      },
    });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // 2. Wrong email OR wrong password (Supabase reports both the same way):
  //    count it and show ONE generic message so accounts cannot be probed.
  if (error || !data?.session) {
    // A network/server fault is not the user's fault, so do not count it.
    if (error && (error.status ?? 0) >= 500) {
      return redirect(`/admin/login${failureQuery("error")}`);
    }
    const result = recordLoginFailure(ip, email);
    return redirect(
      `/admin/login${failureQuery(result.locked ? "locked" : "invalid", {
        attemptsLeft: result.attemptsLeft,
        retryAfterSeconds: result.retryAfterSeconds,
      })}`,
    );
  }

  // 3. Success: reset the counters for this IP and email.
  clearLoginFailures(ip, email);

  const { access_token, refresh_token } = data.session;

  cookies.set("sb-access-token", access_token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });

  cookies.set("sb-refresh-token", refresh_token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });

  return redirect("/admin");
};
