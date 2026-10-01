// src/pages/api/orders/whatsapp.ts
//
// POST from the menu cart. Validates the order (WhatsApp number + opt-in are
// REQUIRED), stores it, sends the staff alert and the customer confirmation.
import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { formatWhatsAppNumber, normaliseWhatsAppNumber } from "../../../lib/phone";
import { WA, canMessage, isWhatsAppConfigured, sendTemplate } from "../../../lib/whatsapp";
import { OPT_IN_TEXT, orderRef } from "../../../lib/orders";

export const prerender = false;

const MAX_LINES = 40;
const MAX_ORDERS_PER_IP_PER_10_MIN = 5;
const MAX_ORDERS_PER_PHONE_PER_10_MIN = 3;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const clean = (v: unknown, max = 120) =>
  String(v ?? "").replace(/[\u0000-\u001F]/g, " ").trim().slice(0, max);

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!isWhatsAppConfigured() || WA.staffRecipients.length === 0) {
    return json({ ok: false, error: "not_configured" }, 503);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  // ── Validate ────────────────────────────────────────────────
  const cart = Array.isArray(body?.cart) ? body.cart.slice(0, MAX_LINES) : [];
  if (cart.length === 0) return json({ ok: false, error: "empty_cart" }, 400);

  const customerName = clean(body?.name, 60);
  if (!customerName) return json({ ok: false, error: "name_required", field: "name" }, 400);

  const customerPhone = normaliseWhatsAppNumber(body?.phone);
  if (!customerPhone) {
    return json({ ok: false, error: "invalid_phone", field: "phone" }, 400);
  }
  if (body?.optIn !== true) {
    return json({ ok: false, error: "opt_in_required", field: "optIn" }, 400);
  }

  const items = cart.map((l: any) => ({
    name: clean(l?.name),
    qty: Math.min(Math.max(parseInt(l?.qty, 10) || 1, 1), 50),
    price: clean(l?.price, 20),
    note: clean(l?.note, 200),
    options: (Array.isArray(l?.options) ? l.options : []).slice(0, 10).map((o: any) => ({
      label: clean(o?.label, 40),
      value: clean(o?.value, 60),
    })),
  }));

  const hasPlatter = Boolean(body?.hasPlatter);
  const collectDate = /^\d{4}-\d{2}-\d{2}$/.test(body?.collectDate) ? body.collectDate : null;
  const collectTime = /^\d{2}:\d{2}$/.test(body?.collectTime) ? body.collectTime : "";
  const estTotal = Number.isFinite(+body?.total) ? Math.max(0, +body.total) : null;

  // ── Basic abuse protection (every message costs money) ──────
  const ipHash = createHash("sha256")
    .update(String(clientAddress ?? request.headers.get("x-forwarded-for") ?? "unknown"))
    .digest("hex");
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const [{ count: ipCount }, { count: phoneCount }] = await Promise.all([
    supabaseAdmin
      .from("whatsapp_orders")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since),
    supabaseAdmin
      .from("whatsapp_orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_phone", customerPhone)
      .gte("created_at", since),
  ]);
  if (
    (ipCount ?? 0) >= MAX_ORDERS_PER_IP_PER_10_MIN ||
    (phoneCount ?? 0) >= MAX_ORDERS_PER_PHONE_PER_10_MIN
  ) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }

  // ── Save order ──────────────────────────────────────────────
  const { data: order, error: insertError } = await supabaseAdmin
    .from("whatsapp_orders")
    .insert({
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_opt_in: true,
      opt_in_at: new Date().toISOString(),
      opt_in_text: OPT_IN_TEXT,
      collect_date: collectDate,
      collect_time: collectTime,
      has_platter: hasPlatter,
      items,
      est_total: estTotal,
      ip_hash: ipHash,
    })
    .select("id, order_no")
    .single();
  if (insertError || !order) {
    console.error("[orders/whatsapp] insert failed:", insertError?.message);
    return json({ ok: false, error: "db_error" }, 500);
  }

  const ref = orderRef(order.order_no);

  // ── Template params (each must be a single line) ────────────
  const collection = hasPlatter
    ? `${collectDate ?? "date TBC"} at ${collectTime || "time TBC"} (PLATTER)`
    : collectTime || "ASAP (20-30 mins)";

  const itemsText = items
    .map((i: (typeof items)[number]) => {
      const opts = i.options.map((o: { label: string; value: string }) => `${o.label}: ${o.value}`).join(", ");
      return `${i.qty}x ${i.name}${opts ? ` (${opts})` : ""}${i.note ? ` [${i.note}]` : ""}`;
    })
    .join("; ");
  const totalText = estTotal !== null ? `R${estTotal.toFixed(2)}` : "-";

  // ── 1) Staff alert: new_order_alert ─────────────────────────
  // {{1}} ref  {{2}} name  {{3}} phone  {{4}} collection  {{5}} items  {{6}} total
  // Buttons: [0] Accept order  [1] Ready for collection
  const staffResults = await Promise.allSettled(
    WA.staffRecipients.map((to) =>
      sendTemplate(to, WA.templates.staffAlert, {
        body: [ref, customerName, formatWhatsAppNumber(customerPhone), collection, itemsText, totalText],
        quickReplyPayloads: [`ACCEPT:${order.id}`, `READY:${order.id}`],
      }),
    ),
  );
  const staffIds = staffResults
    .filter((r): r is PromiseFulfilledResult<{ messageId: string }> => r.status === "fulfilled")
    .map((r) => r.value.messageId);
  staffResults
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .forEach((r) =>
      console.error("[orders/whatsapp] staff alert failed:", r.reason?.message, r.reason?.details),
    );

  // ── 2) Customer confirmation: order_received ────────────────
  // {{1}} name  {{2}} ref  {{3}} total  {{4}} collection
  let confirmation: "sent" | "skipped_test_mode" | "failed" = "failed";
  let customerMessageId: string | null = null;

  if (!canMessage(customerPhone)) {
    confirmation = "skipped_test_mode";
    console.warn(
      `[orders/whatsapp] TEST MODE: ${customerPhone} is not in WHATSAPP_TEST_ALLOWED_RECIPIENTS – confirmation skipped.`,
    );
  } else {
    try {
      const sent = await sendTemplate(customerPhone, WA.templates.orderReceived, {
        body: [customerName, ref, totalText, collection],
      });
      customerMessageId = sent.messageId;
      confirmation = "sent";
    } catch (err: any) {
      console.error("[orders/whatsapp] customer confirmation failed:", err?.message, err?.details);
    }
  }

  await supabaseAdmin
    .from("whatsapp_orders")
    .update({
      status: staffIds.length ? "sent" : "failed",
      staff_message_ids: staffIds,
      customer_message_id: customerMessageId,
      confirmation_status: confirmation,
    })
    .eq("id", order.id);

  if (!staffIds.length) {
    // Kitchen didn't get it – let the browser fall back to wa.me.
    return json({ ok: false, error: "send_failed", orderRef: ref }, 502);
  }
  return json({ ok: true, orderRef: ref, confirmation });
};
