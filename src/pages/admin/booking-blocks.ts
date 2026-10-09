// -> /admin/booking-blocks  (Admin + Owner)
//
// Availability blocks created from the "Block availability" step that appears
// after an admin confirms a booking (src/pages/admin/booking-dates.astro).
//
//   POST   { bookingId, blocks: [{ type: "day" | "time", date, startTime, endTime }] }
//          -> { ok, dayBlocks: [...], timeBlocks: [...] }
//          "day"  rows become a full-day block in   public.blocked_dates
//          "time" rows become a time-slot block in  public.booking_time_blocks
//
//   DELETE { ids: [...], type: "time" | "day" }
//          -> { ok, deletedIds: [...] }
//          "time" removes rows from public.booking_time_blocks,
//          "day" (default) removes rows from public.blocked_dates.
//
// NOTE: this route used to contain a copy of the single "block a date range"
// handler (startDate / endDate), so saving blocks after confirming a booking
// failed with "Choose valid start and end dates." That handler still lives in
// src/pages/admin/blocked-dates.ts.
import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { guardAdminPage } from "../../lib/adminAuth";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const clean = (value: unknown, max = 200) =>
  String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// The booking_time_blocks table only accepts these ranges (see its CHECK
// constraints): start 10:30-19:30, end 11:00-20:00.
const START_MIN = "10:30";
const START_MAX = "19:30";
const END_MIN = "11:00";
const END_MAX = "20:00";

const isRealIsoDate = (value: string) => {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
};

const DAY_COLUMNS =
  "id,start_date,end_date,reason,created_at,created_by,source_booking_id";
const TIME_COLUMNS =
  "id,block_date,start_time,end_time,reason,created_at,created_by,source_booking_id";

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

  const rows = Array.isArray(body?.blocks) ? body.blocks.slice(0, 50) : [];
  if (!rows.length) {
    return json({ error: "Add at least one block." }, 400);
  }

  // Optional link back to the booking these blocks were created for.
  let bookingId: string | null = clean(body?.bookingId, 80) || null;
  let reason: string | null = null;
  if (bookingId) {
    const { data: booking } = await supabaseAdmin
      .from("booking_requests")
      .select("id,booking_no")
      .eq("id", bookingId)
      .maybeSingle();
    if (booking) reason = `Booking LL-B${booking.booking_no}`;
    else bookingId = null; // unknown id: still save the blocks, just unlinked
  }

  // ── Validate every row first so nothing is saved half-way ──
  const dayRows: Array<{ date: string }> = [];
  const timeRows: Array<{ date: string; start: string; end: string }> = [];

  for (const row of rows) {
    const type = clean(row?.type, 10);
    const date = clean(row?.date, 10);
    if (!isRealIsoDate(date)) {
      return json({ error: "Every block needs a valid date." }, 400);
    }

    if (type === "day") {
      dayRows.push({ date });
    } else if (type === "time") {
      const start = clean(row?.startTime, 5);
      const end = clean(row?.endTime, 5);
      if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
        return json(
          { error: "Every time block needs a start and end time." },
          400,
        );
      }
      if (end <= start) {
        return json({ error: "A time block must end after it starts." }, 400);
      }
      if (
        start < START_MIN ||
        start > START_MAX ||
        end < END_MIN ||
        end > END_MAX
      ) {
        return json(
          {
            error: `Time blocks must start between ${START_MIN} and ${START_MAX} and end between ${END_MIN} and ${END_MAX}.`,
          },
          400,
        );
      }
      timeRows.push({ date, start, end });
    } else {
      return json({ error: "Unknown block type." }, 400);
    }
  }

  // ── Full-day blocks (skip days that are already blocked) ──
  const dayBlocks: unknown[] = [];
  for (const { date } of dayRows) {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("blocked_dates")
      .select("id")
      .lte("start_date", date)
      .gte("end_date", date)
      .limit(1);
    if (lookupError) {
      console.error(
        "[admin/booking-blocks] day lookup failed:",
        lookupError.message,
      );
      return json({ error: "Could not check existing blocked dates." }, 500);
    }
    if ((existing ?? []).length > 0) continue; // already blocked

    const { data, error } = await supabaseAdmin
      .from("blocked_dates")
      .insert({
        start_date: date,
        end_date: date,
        reason,
        created_by: user.id,
        source_booking_id: bookingId,
      })
      .select(DAY_COLUMNS)
      .single();
    if (error || !data) {
      console.error(
        "[admin/booking-blocks] day insert failed:",
        error?.message,
      );
      return json({ error: "Could not block the selected day." }, 500);
    }
    dayBlocks.push(data);
  }

  // ── Time-slot blocks (skip exact duplicates) ──
  const timeBlocks: unknown[] = [];
  for (const { date, start, end } of timeRows) {
    const { data: duplicate } = await supabaseAdmin
      .from("booking_time_blocks")
      .select("id")
      .eq("block_date", date)
      .eq("start_time", start)
      .eq("end_time", end)
      .limit(1);
    if ((duplicate ?? []).length > 0) continue;

    const { data, error } = await supabaseAdmin
      .from("booking_time_blocks")
      .insert({
        block_date: date,
        start_time: start,
        end_time: end,
        reason,
        created_by: user.id,
        source_booking_id: bookingId,
      })
      .select(TIME_COLUMNS)
      .single();
    if (error || !data) {
      console.error(
        "[admin/booking-blocks] time insert failed:",
        error?.message,
      );
      return json({ error: "Could not block the selected time." }, 500);
    }
    timeBlocks.push(data);
  }

  return json({ ok: true, dayBlocks, timeBlocks });
};

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
  ].slice(0, 100) as string[];
  if (!ids.length) return json({ error: "No block ids supplied." }, 400);

  // "time" -> booking_time_blocks; anything else -> blocked_dates (full days).
  const table =
    clean(body?.type, 10) === "time" ? "booking_time_blocks" : "blocked_dates";

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from(table)
    .select("id")
    .in("id", ids);
  if (lookupError) {
    console.error(
      "[admin/booking-blocks] delete lookup failed:",
      lookupError.message,
    );
    return json({ error: "Could not verify the selected blocks." }, 500);
  }

  const existingIds = (existing ?? []).map((row) => row.id);
  if (existingIds.length !== ids.length) {
    return json(
      { error: "One or more selected blocks no longer exists." },
      409,
    );
  }

  const { error } = await supabaseAdmin.from(table).delete().in("id", ids);
  if (error) {
    console.error("[admin/booking-blocks] delete failed:", error.message);
    return json({ error: "Could not delete the selected blocks." }, 500);
  }

  return json({ ok: true, deletedIds: existingIds });
};
