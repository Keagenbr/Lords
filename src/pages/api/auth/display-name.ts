// src/pages/api/auth/display-name.ts  ->  POST /api/auth/display-name
//
// Lets the signed-in user (admin or staff) set the name shown in the session
// bar. It is stored in Supabase Auth as user_metadata.display_name.
//
// Supabase docs: auth.admin.updateUserById(uid, { user_metadata }) updates a
// user from the server with the service-role key. The caller is identified
// from their own login cookies, and only THEIR user id is ever updated, so
// nobody can change someone else's name.
import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getSessionUser } from "../../../lib/adminAuth";

export const prerender = false;

const MAX_LENGTH = 40;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ error: "Please sign in again." }, 401);

  let body: { displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  // Collapse whitespace, drop control characters.
  const displayName = String(body.displayName ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!displayName) return json({ error: "Please enter a name." }, 400);
  if (displayName.length > MAX_LENGTH) {
    return json({ error: `Name must be ${MAX_LENGTH} characters or fewer.` }, 400);
  }

  // Keep every other metadata key (role, staff_slug, name ...) exactly as is.
  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...(user.user_metadata ?? {}), display_name: displayName },
  });
  if (error) return json({ error: error.message }, 500);

  return json({ displayName });
};
