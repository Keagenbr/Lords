// src/pages/admin/set-booking-location.ts -> POST /admin/set-booking-location (owner only)
import type { APIRoute } from "astro";
import { guardOwnerPage } from "../../lib/adminAuth";
import { setSetting } from "../../lib/siteSettings";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const clean = (value: unknown, max = 500) =>
  String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const { user, response } = await guardOwnerPage(cookies, redirect);
  if (response) return json({ error: "Forbidden: Owner access required." }, 403);

  let body: { location?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const location = clean(body.location, 500);
  if (!location) {
    return json({ error: "Calendar location cannot be blank." }, 400);
  }

  try {
    await setSetting("booking_calendar_location", location, user.id);
  } catch (err: any) {
    return json({ error: err.message || "Save failed" }, 500);
  }

  return json({ ok: true, location });
};
