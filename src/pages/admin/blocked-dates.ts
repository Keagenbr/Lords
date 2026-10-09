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

const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

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

  const startDate = clean(body?.startDate, 10);
  const endDate = clean(body?.endDate, 10);
  const reason = clean(body?.reason, 200) || null;

  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return json({ error: "Please supply valid start and end dates." }, 400);
  }

  if (endDate < startDate) {
    return json({ error: "End date cannot be before start date." }, 400);
  }

  const { data: overlap, error: overlapError } = await supabaseAdmin
    .from("blocked_dates")
    .select("id,start_date,end_date")
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .limit(1);

  if (overlapError) {
    console.error(
      "[admin/blocked-dates] overlap check failed:",
      overlapError.message,
    );
    return json({ error: "Could not check existing blocked dates." }, 500);
  }

  if ((overlap ?? []).length > 0) {
    return json(
      { error: "That date or date range overlaps an existing blocked period." },
      409,
    );
  }

  const { data, error } = await supabaseAdmin
    .from("blocked_dates")
    .insert({
      start_date: startDate,
      end_date: endDate,
      reason,
      created_by: user.id,
    })
    .select("id,start_date,end_date,reason,created_at,created_by")
    .single();

  if (error || !data) {
    console.error("[admin/blocked-dates] insert failed:", error?.message);
    return json({ error: error?.message || "Could not block dates." }, 500);
  }

  return json({ ok: true, block: data });
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

  // The page deletes several blocks at once and sends { ids: [...] };
  // a single { id } is still accepted.
  const rawIds = Array.isArray(body?.ids) ? body.ids : [body?.id];
  const ids = [
    ...new Set(
      rawIds.map((value: unknown) => clean(value, 60)).filter(Boolean),
    ),
  ].slice(0, 100) as string[];
  if (!ids.length) return json({ error: "Missing blocked-date id." }, 400);

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("blocked_dates")
    .select("id")
    .in("id", ids);

  if (lookupError) {
    console.error(
      "[admin/blocked-dates] delete lookup failed:",
      lookupError.message,
    );
    return json({ error: "Could not verify the selected blocked dates." }, 500);
  }

  const existingIds = (existing ?? []).map((row) => row.id);
  if (existingIds.length !== ids.length) {
    return json(
      { error: "One or more selected date blocks no longer exists." },
      409,
    );
  }

  const { error } = await supabaseAdmin
    .from("blocked_dates")
    .delete()
    .in("id", ids);

  if (error) {
    console.error("[admin/blocked-dates] delete failed:", error.message);
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, deletedIds: existingIds });
};
