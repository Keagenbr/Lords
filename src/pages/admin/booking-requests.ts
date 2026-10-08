import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { guardAdminPage } from "../../lib/adminAuth";
import { getBookingCalendarLocation } from "../../lib/siteInfo";
import { buildGoogleCalendarTemplateUrl } from "../../lib/googleCalendar";

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
  const { user, response } = await guardAdminPage(cookies, redirect);
  if (response)
    return json({ error: "Forbidden: Admin access required." }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const id = clean(body?.id, 80);
  const action = clean(body?.action, 20);
  const note = clean(body?.note, 500) || null;

  if (!id || !["confirm", "deny"].includes(action)) {
    return json({ error: "Missing or invalid booking action." }, 400);
  }

  const nextStatus = action === "confirm" ? "confirmed" : "denied";

  const { data: booking, error } = await supabaseAdmin
    .from("booking_requests")
    .update({
      status: nextStatus,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      decision_note: note,
    })
    .eq("id", id)
    .eq("status", "requested")
    .select(
      "id,booking_no,created_at,people_count,contact_name,booking_name,contact_phone,booking_date,booking_time,status,decided_at,decided_by,decision_note",
    )
    .maybeSingle();

  if (error) {
    console.error("[admin/booking-requests] update failed:", error.message);
    return json({ error: "Could not update the booking request." }, 500);
  }

  if (!booking) {
    return json(
      { error: "That booking has already been confirmed or denied." },
      409,
    );
  }

  let calendarUrl: string | null = null;
  if (action === "confirm" && booking.booking_date && booking.booking_time) {
    try {
      calendarUrl = buildGoogleCalendarTemplateUrl({
        title: `Lords & Legends - Group Booking - ${booking.booking_name || booking.contact_name || `LL-B${booking.booking_no}`}`,
        date: booking.booking_date,
        startTime: booking.booking_time,
        details: [
          "Lords & Legends group booking",
          `Booking Ref: LL-B${booking.booking_no}`,
          `People: ${booking.people_count}`,
          `Contact: ${booking.contact_name}`,
        ].join("\n"),
        location: await getBookingCalendarLocation(),
      });
    } catch (calendarError) {
      console.error(
        "[admin/booking-requests] calendar template generation failed:",
        calendarError,
      );
    }
  }

  return json({ ok: true, booking, calendarUrl });
};

/**
 * Permanently removes confirmed booking records selected from the Admin
 * "Already booked" list. Pending requests are deliberately excluded so the
 * confirmation workflow remains auditable; denied requests are also left
 * intact for history.
 */
export const DELETE: APIRoute = async ({ request, cookies, redirect }) => {
  const { response } = await guardAdminPage(cookies, redirect);
  if (response)
    return json({ error: "Forbidden: Admin access required." }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const rawIds = Array.isArray(body?.ids) ? body.ids : [body?.id];
  const ids = [
    ...new Set(
      rawIds.map((value: unknown) => clean(value, 80)).filter(Boolean),
    ),
  ].slice(0, 100);
  if (!ids.length) return json({ error: "No booking ids supplied." }, 400);

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("booking_requests")
    .select("id,booking_no,status")
    .in("id", ids)
    .eq("status", "confirmed");

  if (lookupError) {
    console.error(
      "[admin/booking-requests] delete lookup failed:",
      lookupError.message,
    );
    return json({ error: "Could not verify the selected bookings." }, 500);
  }

  const existingIds = (existing ?? []).map((row) => row.id);
  if (existingIds.length !== ids.length) {
    return json(
      {
        error:
          "One or more selected bookings is no longer available for deletion.",
      },
      409,
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("booking_requests")
    .delete()
    .in("id", ids)
    .eq("status", "confirmed");

  if (deleteError) {
    console.error(
      "[admin/booking-requests] delete failed:",
      deleteError.message,
    );
    return json({ error: "Could not delete the selected bookings." }, 500);
  }

  return json({ ok: true, deletedIds: existingIds });
};
