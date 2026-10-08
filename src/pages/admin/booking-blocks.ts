import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { guardAdminPage } from "../../lib/adminAuth";

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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  if (!ISO_DATE_RE.test(startDate) || !ISO_DATE_RE.test(endDate)) {
    return json({ error: "Choose valid start and end dates." }, 400);
  }
  if (endDate < startDate) {
    return json({ error: "End date cannot be before start date." }, 400);
  }

  const { data: block, error } = await supabaseAdmin
    .from("blocked_dates")
    .insert({
      start_date: startDate,
      end_date: endDate,
      reason,
      created_by: user.id,
    })
    .select(
      "id,start_date,end_date,reason,created_at,created_by,source_booking_id",
    )
    .single();

  if (error) {
    console.error("[admin/blocked-dates] insert failed:", error.message);
    return json({ error: "Could not block dates." }, 500);
  }

  return json({ ok: true, block });
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
  ].slice(0, 100);
  if (!ids.length) return json({ error: "No blocked-date ids supplied." }, 400);

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
    return json({ error: "Could not delete the selected blocked dates." }, 500);
  }

  return json({ ok: true, deletedIds: existingIds });
};
