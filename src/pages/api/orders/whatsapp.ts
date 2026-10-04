// src/pages/api/orders/whatsapp.ts
//
// POST from the menu cart. Validates the order (WhatsApp number + opt-in
// are REQUIRED) and stores it in Supabase. That's all this endpoint does —
// no WhatsApp Cloud API send happens here. The browser is responsible for
// opening a wa.me link with the order pre-filled, and the customer sends
// it to us themselves from their own WhatsApp (same as a normal customer
// message — no Meta template approval needed for that).
//
// Storing first means we still have a record of the order even if the
// customer closes WhatsApp without hitting send.
import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { normaliseWhatsAppNumber } from "../../../lib/phone";
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
      // Optional — only present for modifier options with a price > 0
      // (e.g. Extra Sauce, Schnitzel Add-ons). Clamped to a sane range.
      price: Number.isFinite(+o?.price) ? Math.min(Math.max(+o.price, 0), 10000) : 0,
    })),
  }));

  const hasPlatter = Boolean(body?.hasPlatter);
  const collectDate = /^\d{4}-\d{2}-\d{2}$/.test(body?.collectDate) ? body.collectDate : null;
  const collectTime = /^\d{2}:\d{2}$/.test(body?.collectTime) ? body.collectTime : "";
  const estTotal = Number.isFinite(+body?.total) ? Math.max(0, +body.total) : null;

  // ── Basic abuse protection (keeps the orders table honest — no longer
  // about WhatsApp send costs, since nothing here sends anything) ──────
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
  // `status` is deliberately left unset here so the column's existing
  // default applies — we genuinely don't know yet whether the customer
  // went on to send the WhatsApp message, only that they got this far.
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

  return json({ ok: true, orderRef: orderRef(order.order_no) });
};