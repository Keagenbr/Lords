import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
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

  if (!email || !password) {
    return new Response("Email and password are required.", { status: 400 });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return new Response(error.message, { status: 400 });
  }

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
