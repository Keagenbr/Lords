// Owner-only endpoint for setting the location shown in Google Calendar and booking confirmations.
import type { APIRoute } from "astro";
import { guardOwnerPage } from "../../lib/adminAuth";
import { setSetting } from "../../lib/siteSettings";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const { user, response } = await guardOwnerPage(cookies, redirect);
  if (response) return json({ error: "Forbidden: Owner access required." }, 403);

  let body: { location?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const location = String(body?.location ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  if (!location) return json({ error: "Please enter a booking location." }, 400);

  try {
    await setSetting("booking_calendar_location", location, user.id);
  } catch (error) {
    console.error("[admin/set-booking-calendar-location] save failed:", error);
    return json({ error: "Could not save booking location. Please try again." }, 500);
  }

  return json({ ok: true, location });
};
