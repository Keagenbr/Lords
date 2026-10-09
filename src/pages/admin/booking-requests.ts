import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { guardAdminPage } from "../../lib/adminAuth";
import { getBookingCalendarLocation } from "../../lib/siteInfo";
import { normaliseWhatsAppNumber } from "../../lib/phone";
import { buildGoogleCalendarTemplateUrl } from "../../lib/googleCalendar";
import { getBookingConfirmationTemplate, renderMessageSections } from "../../lib/messageTemplates";

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
    if (response) return json({ error: "Forbidden: Admin access required." }, 403);

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
            "id,booking_no,created_at,people_count,contact_name,booking_name,contact_phone,booking_date,booking_time,booking_start_time,booking_finish_time,booking_note,status,decided_at,decided_by,decision_note",
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
    const bookingStartTime = String(booking.booking_start_time || booking.booking_time || "").slice(0, 5);
    const bookingFinishTime = String(booking.booking_finish_time || "").slice(0, 5);
    if (action === "confirm" && booking.booking_date && bookingStartTime) {
        try {
            calendarUrl = buildGoogleCalendarTemplateUrl({
                title: `Lords & Legends - Group Booking - ${booking.booking_name || booking.contact_name || `LL-B${booking.booking_no}`}`,
                date: booking.booking_date,
                startTime: bookingStartTime,
                endTime: bookingFinishTime || undefined,
                details: [
                    "Lords & Legends group booking",
                    `Booking Ref: LL-B${booking.booking_no}`,
                    `People: ${booking.people_count}`,
                    `Contact: ${booking.contact_name}`,
                    `Time: ${bookingStartTime && bookingFinishTime ? `${bookingStartTime}–${bookingFinishTime}` : bookingStartTime}`,
                    ...(booking.booking_note ? [`Additional notes: ${booking.booking_note}`] : []),
                ].join("\n"),
                location: await getBookingCalendarLocation(),
            });
        } catch (calendarError) {
            console.error("[admin/booking-requests] calendar template generation failed:", calendarError);
        }
    }

    let confirmationMessage: string | null = null;
    let confirmationWhatsAppUrl: string | null = null;
    if (action === "confirm") {
        try {
            const [template, calendarLocation] = await Promise.all([
                getBookingConfirmationTemplate(),
                getBookingCalendarLocation(),
            ]);
            const dateLabel = booking.booking_date
                ? new Intl.DateTimeFormat("en-ZA", {
                    timeZone: "Africa/Johannesburg",
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                }).format(new Date(`${booking.booking_date}T12:00:00+02:00`))
                : "Date not specified";
            const startTime = String(booking.booking_start_time || booking.booking_time || "").slice(0, 5);
            const finishTime = String(booking.booking_finish_time || "").slice(0, 5);
            const timeLabel = startTime && finishTime
                ? `${startTime} - ${finishTime}`
                : startTime || "Not specified";
            const shortLocation = String(calendarLocation || "Amanzimtoti").split(",")[0].trim();
            const locationLabel = /^Lords & Legends Sports Cafe/i.test(shortLocation)
                ? shortLocation
                : `Lords & Legends Sports Cafe ${shortLocation}`;
            confirmationMessage = renderMessageSections(template, {
                contactName: booking.contact_name || booking.booking_name || "there",
                bookingName: booking.booking_name || booking.contact_name || "",
                bookingRef: `LL-B${booking.booking_no}`,
                peopleCount: booking.people_count,
                bookingDate: dateLabel,
                bookingTime: timeLabel,
                location: locationLabel,
                bookingNote: booking.booking_note || "",
            });
            const customerNumber = normaliseWhatsAppNumber(booking.contact_phone);
            if (customerNumber) {
                confirmationWhatsAppUrl = `https://wa.me/${customerNumber}?text=${encodeURIComponent(confirmationMessage)}`;
            }
        } catch (messageError) {
            console.error("[admin/booking-requests] confirmation message generation failed:", messageError);
        }
    }

    return json({ ok: true, booking, calendarUrl, confirmationMessage, confirmationWhatsAppUrl });
};


/**
 * Permanently removes confirmed booking records selected from the Admin
 * "Already booked" list. Pending requests are deliberately excluded so the
 * confirmation workflow remains auditable; denied requests are also left
 * intact for history.
 */
export const DELETE: APIRoute = async ({ request, cookies, redirect }) => {
    const { response } = await guardAdminPage(cookies, redirect);
    if (response) return json({ error: "Forbidden: Admin access required." }, 403);

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }

    const rawIds = Array.isArray(body?.ids) ? body.ids : [body?.id];
    const ids = [...new Set(rawIds.map((value: unknown) => clean(value, 80)).filter(Boolean))].slice(0, 100);
    if (!ids.length) return json({ error: "No booking ids supplied." }, 400);

    const { data: existing, error: lookupError } = await supabaseAdmin
        .from("booking_requests")
        .select("id,booking_no,status")
        .in("id", ids)
        .eq("status", "confirmed");

    if (lookupError) {
        console.error("[admin/booking-requests] delete lookup failed:", lookupError.message);
        return json({ error: "Could not verify the selected bookings." }, 500);
    }

    const existingIds = (existing ?? []).map((row) => row.id);
    if (existingIds.length !== ids.length) {
        return json({ error: "One or more selected bookings is no longer available for deletion." }, 409);
    }

    const { error: deleteError } = await supabaseAdmin
        .from("booking_requests")
        .delete()
        .in("id", ids)
        .eq("status", "confirmed");

    if (deleteError) {
        console.error("[admin/booking-requests] delete failed:", deleteError.message);
        return json({ error: "Could not delete the selected bookings." }, 500);
    }

    return json({ ok: true, deletedIds: existingIds });
};
