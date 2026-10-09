import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { normaliseWhatsAppNumber, formatWhatsAppNumber } from "../../lib/phone";
import { getWhatsAppNumber, RESTAURANT_NAME } from "../../lib/siteInfo";
import { isDateBlocked } from "../../lib/blockedDates";

export const prerender = false;

const MIN_PEOPLE = 10;
const MAX_BOOKING_PER_IP_PER_10_MIN = 5;
const MAX_BOOKING_PER_PHONE_PER_10_MIN = 3;
const BOOKING_TIME_MIN = "10:30";
const BOOKING_TIME_MAX = "19:30";
// A finish time may run half an hour past the last start time.
const BOOKING_END_TIME_MAX = "20:00";
const TIME_RE = /^\d{2}:\d{2}$/;

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });

const clean = (value: unknown, max = 120) =>
    String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, max);

const getSouthAfricaDate = () =>
    new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Johannesburg",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());

const isRealIsoDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
};

const getIpHash = (clientAddress: string | undefined, request: Request) =>
    createHash("sha256")
        .update(
            String(
                clientAddress ??
                    request.headers.get("x-forwarded-for") ??
                    "unknown",
            ),
        )
        .digest("hex");

export const POST: APIRoute = async ({ request, clientAddress }) => {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: "bad_json" }, 400);
    }

    const peopleCount = Number(body?.peopleCount);
    if (!Number.isInteger(peopleCount) || peopleCount < MIN_PEOPLE) {
        return json({
            ok: false,
            error: "minimum_people",
            minimum: MIN_PEOPLE,
        }, 400);
    }

    const contactName = clean(body?.contactName, 80);
    if (!contactName) {
        return json({ ok: false, error: "contact_name_required" }, 400);
    }

    const bookingName = clean(body?.bookingName, 100) || null;

    const contactPhone = normaliseWhatsAppNumber(body?.contactPhone);
    if (!contactPhone) {
        return json({ ok: false, error: "invalid_phone" }, 400);
    }

    const bookingDate = clean(body?.bookingDate, 10);
    if (!isRealIsoDate(bookingDate)) {
        return json({ ok: false, error: "invalid_date" }, 400);
    }

    if (bookingDate < getSouthAfricaDate()) {
        return json({ ok: false, error: "past_date" }, 400);
    }

    // Start and finish times are both OPTIONAL. Empty string / missing = not given.
    let bookingTime: string | null = clean(body?.bookingTime, 20) || null;
    let bookingEndTime: string | null = clean(body?.bookingEndTime, 20) || null;

    if (bookingTime && !TIME_RE.test(bookingTime)) {
        return json({ ok: false, error: "invalid_time", earliest: BOOKING_TIME_MIN, latest: BOOKING_TIME_MAX }, 400);
    }
    if (bookingEndTime && !TIME_RE.test(bookingEndTime)) {
        return json({ ok: false, error: "invalid_end_time" }, 400);
    }

    // Only a finish time was given: it becomes the booking (start) time.
    if (!bookingTime && bookingEndTime) {
        bookingTime = bookingEndTime;
        bookingEndTime = null;
    }

    const bookingWeekday = new Date(`${bookingDate}T12:00:00+02:00`).getUTCDay();
    if (bookingWeekday === 0) {
        return json({ ok: false, error: "sunday_unavailable" }, 400);
    }

    if (bookingTime && (bookingTime < BOOKING_TIME_MIN || bookingTime > BOOKING_TIME_MAX)) {
        return json({
            ok: false,
            error: "invalid_time",
            earliest: BOOKING_TIME_MIN,
            latest: BOOKING_TIME_MAX,
        }, 400);
    }

    // A finish time must come after the start time and stay within opening hours.
    if (bookingTime && bookingEndTime) {
        if (bookingEndTime <= bookingTime || bookingEndTime > BOOKING_END_TIME_MAX) {
            return json({ ok: false, error: "invalid_end_time" }, 400);
        }
    }

    const { data: matchingBlocks, error: blockError } = await supabaseAdmin
        .from("blocked_dates")
        .select("start_date,end_date")
        .lte("start_date", bookingDate)
        .gte("end_date", bookingDate)
        .limit(1);

    if (blockError) {
        console.error("[api/booking] blocked-date check failed:", blockError.message);
        return json({ ok: false, error: "availability_check_failed" }, 500);
    }

    if (isDateBlocked(bookingDate, matchingBlocks ?? [])) {
        return json({ ok: false, error: "date_blocked" }, 409);
    }

    const { data: matchingTimeBlocks, error: timeBlockError } = await supabaseAdmin
        .from("booking_time_blocks")
        .select("start_time,end_time,reason")
        .eq("block_date", bookingDate)
        .order("start_time", { ascending: true });

    if (timeBlockError) {
        console.error("[api/booking] time-block check failed:", timeBlockError.message);
        return json({ ok: false, error: "availability_check_failed" }, 500);
    }

    // With a start time only, that moment must not be blocked. With a finish
    // time too, no blocked slot may overlap the whole period.
    const timeBlock = bookingTime
        ? (matchingTimeBlocks ?? []).find((block) => {
              const startTime = String(block.start_time || "").slice(0, 5);
              const endTime = String(block.end_time || "").slice(0, 5);
              return bookingEndTime
                  ? startTime < bookingEndTime && endTime > bookingTime!
                  : startTime <= bookingTime! && endTime > bookingTime!;
          })
        : undefined;

    if (timeBlock) {
        return json(
            {
                ok: false,
                error: "time_blocked",
                reason: timeBlock.reason || undefined,
            },
            409,
        );
    }

    const ipHash = getIpHash(clientAddress, request);
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const [{ count: ipCount }, { count: phoneCount }] = await Promise.all([
        supabaseAdmin
            .from("booking_requests")
            .select("id", { count: "exact", head: true })
            .eq("ip_hash", ipHash)
            .gte("created_at", since),
        supabaseAdmin
            .from("booking_requests")
            .select("id", { count: "exact", head: true })
            .eq("contact_phone", contactPhone)
            .gte("created_at", since),
    ]);

    if (
        (ipCount ?? 0) >= MAX_BOOKING_PER_IP_PER_10_MIN ||
        (phoneCount ?? 0) >= MAX_BOOKING_PER_PHONE_PER_10_MIN
    ) {
        return json({ ok: false, error: "rate_limited" }, 429);
    }

    const { data: booking, error: insertError } = await supabaseAdmin
        .from("booking_requests")
        .insert({
            people_count: peopleCount,
            contact_name: contactName,
            booking_name: bookingName,
            contact_phone: contactPhone,
            booking_date: bookingDate,
            booking_time: bookingTime,
            booking_end_time: bookingEndTime,
            ip_hash: ipHash,
        })
        .select("id, booking_no")
        .single();

    if (insertError || !booking) {
        console.error("[api/booking] insert failed:", insertError?.message);
        return json({ ok: false, error: "db_error" }, 500);
    }

    const bookingRef = `LL-B${booking.booking_no}`;
    const bookingLabel = bookingName || contactName;
    const dateLabel = new Intl.DateTimeFormat("en-ZA", {
        timeZone: "Africa/Johannesburg",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(new Date(`${bookingDate}T12:00:00+02:00`));

    const whatsappNumber = await getWhatsAppNumber();
    const whatsappMessage = [
        `*BOOKING REQUEST - ${RESTAURANT_NAME}*`,
        `Booking Ref: ${bookingRef}`,
        "",
        `People: ${peopleCount}`,
        `Contact name: ${contactName}`,
        `Booking name: ${bookingLabel}`,
        `Phone: ${formatWhatsAppNumber(contactPhone)}`,
        `Date: ${dateLabel}`,
        `Time: ${
            bookingTime
                ? bookingEndTime
                    ? `${bookingTime} - ${bookingEndTime}`
                    : bookingTime
                : "Not specified"
        }`,
        "",
        "Please confirm availability and booking details.",
    ].join("\n");

    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        whatsappMessage,
    )}`;

    return json({ ok: true, bookingRef, whatsappUrl });
};
