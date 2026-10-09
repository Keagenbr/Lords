import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { guardAdminPage } from "../../lib/adminAuth";
import { getBookingCalendarLocation } from "../../lib/siteInfo";
import { buildGoogleCalendarTemplateUrl } from "../../lib/googleCalendar";
import { buildBookingConfirmationUrl } from "../../lib/bookingMessages";

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

const BOOKING_COLUMNS =
  "id,booking_no,created_at,people_count,contact_name,booking_name,contact_phone,booking_date,booking_time,booking_end_time,status,decided_at,decided_by,decision_note";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const isRealIsoDate = (value: string) => {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

// Google Calendar "add event" link for a booking (null when it has no start time).
async function calendarUrlFor(booking: any): Promise<string | null> {
  if (!booking?.booking_date || !booking?.booking_time) return null;
  try {
    return buildGoogleCalendarTemplateUrl({
      title: `Lords & Legends - Group Booking - ${booking.booking_name || booking.contact_name || `LL-B${booking.booking_no}`}`,
      date: booking.booking_date,
      startTime: String(booking.booking_time).slice(0, 5),
      endTime: booking.booking_end_time ? String(booking.booking_end_time).slice(0, 5) : null,
      details: [
        "Lords & Legends group booking",
        `Booking Ref: LL-B${booking.booking_no}`,
        `People: ${booking.people_count}`,
        `Contact: ${booking.contact_name}`,
      ].join("\n"),
      location: await getBookingCalendarLocation(),
    });
  } catch (calendarError) {
    console.error("[admin/booking-requests] calendar template generation failed:", calendarError);
    return null;
  }
}

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

  if (!id || !["confirm", "deny", "reschedule"].includes(action)) {
    return json({ error: "Missing or invalid booking action." }, 400);
  }

  // ── Change a booking's date and/or time (pending or confirmed) ──
  if (action === "reschedule") {
    const bookingDate = clean(body?.bookingDate, 10);
    let bookingTime: string | null = clean(body?.bookingTime, 5) || null;
    let bookingEndTime: string | null = clean(body?.bookingEndTime, 5) || null;

    if (!isRealIsoDate(bookingDate)) {
      return json({ error: "Please choose a valid date." }, 400);
    }
    if ((bookingTime && !TIME_RE.test(bookingTime)) || (bookingEndTime && !TIME_RE.test(bookingEndTime))) {
      return json({ error: "Times must look like 18:30." }, 400);
    }
    // Only a finish time given: it becomes the booking (start) time.
    if (!bookingTime && bookingEndTime) {
      bookingTime = bookingEndTime;
      bookingEndTime = null;
    }
    if (bookingTime && bookingEndTime && bookingEndTime <= bookingTime) {
      return json({ error: "The finish time must be after the start time." }, 400);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("booking_requests")
      .update({
        booking_date: bookingDate,
        booking_time: bookingTime,
        booking_end_time: bookingEndTime,
      })
      .eq("id", id)
      .in("status", ["requested", "confirmed"])
      .select(BOOKING_COLUMNS)
      .maybeSingle();

    if (updateError) {
      console.error("[admin/booking-requests] reschedule failed:", updateError.message);
      return json({ error: "Could not change the booking." }, 500);
    }
    if (!updated) {
      return json({ error: "That booking can no longer be changed." }, 409);
    }

    // Admins may override blocks, but we tell them when they did.
    const warnings: string[] = [];
    const { data: dayBlocks } = await supabaseAdmin
      .from("blocked_dates").select("id").lte("start_date", bookingDate).gte("end_date", bookingDate).limit(1);
    if (dayBlocks?.length) warnings.push("That date is marked as blocked.");
    if (bookingTime) {
      const { data: slotBlocks } = await supabaseAdmin
        .from("booking_time_blocks").select("start_time,end_time").eq("block_date", bookingDate);
      const end = bookingEndTime ?? bookingTime;
      const clash = (slotBlocks ?? []).some((b) => {
        const bs = String(b.start_time).slice(0, 5);
        const be = String(b.end_time).slice(0, 5);
        return bookingEndTime ? bs < end && be > bookingTime! : bs <= bookingTime! && be > bookingTime!;
      });
      if (clash) warnings.push("That time overlaps a blocked time slot.");
    }

    const isConfirmed = updated.status === "confirmed";
    return json({
      ok: true,
      booking: updated,
      warnings,
      calendarUrl: isConfirmed ? await calendarUrlFor(updated) : null,
      // "Updated" wording for the WhatsApp message to the customer.
      whatsappUrl: isConfirmed
        ? buildBookingConfirmationUrl(updated, { updated: true, location: await getBookingCalendarLocation() })
        : null,
    });
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
      "id,booking_no,created_at,people_count,contact_name,booking_name,contact_phone,booking_date,booking_time,booking_end_time,status,decided_at,decided_by,decision_note",
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

  const calendarUrl = action === "confirm" ? await calendarUrlFor(booking) : null;
  // WhatsApp link that tells the CUSTOMER their booking is confirmed.
  const whatsappUrl =
    action === "confirm"
      ? buildBookingConfirmationUrl(booking, { location: await getBookingCalendarLocation() })
      : null;

  return json({ ok: true, booking, calendarUrl, whatsappUrl });
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
