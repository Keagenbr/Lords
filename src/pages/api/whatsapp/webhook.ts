// src/pages/api/whatsapp/webhook.ts
//
// GET  – one-time verification handshake when you register the webhook in Meta.
// POST – incoming messages, button taps and delivery statuses.
//
// Staff flow: the new_order_alert template has two quick-reply buttons whose
// payloads are "ACCEPT:<order id>" and "READY:<order id>". Tapping
// "Ready for collection" sends the order_ready template to the customer.
import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { orderRef } from "../../../lib/orders";
import { WA, canMessage, markAsRead, sendTemplate, sendText, verifySignature } from "../../../lib/whatsapp";

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STOP_WORDS = /^\s*(stop|unsubscribe|opt ?out)\s*$/i;

export const GET: APIRoute = ({ url }) => {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && WA.verifyToken && token === WA.verifyToken && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
};

// ── Staff button handlers ─────────────────────────────────────
async function handleStaffAction(action: string, orderId: string, staffPhone: string) {
  if (!UUID.test(orderId)) return;

  if (action === "ACCEPT") {
    // Conditional update = idempotent (Meta may deliver the same webhook twice).
    const { data } = await supabaseAdmin
      .from("whatsapp_orders")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", orderId)
      .in("status", ["received", "sent"])
      .select("order_no")
      .maybeSingle();
    if (data) {
      await sendText(
        staffPhone,
        `Order ${orderRef(data.order_no)} accepted. Tap "Ready for collection" when it's done.`,
      ).catch((e) => console.error("[webhook] staff reply failed:", e?.message));
    }
    return;
  }

  if (action === "READY") {
    const { data: order } = await supabaseAdmin
      .from("whatsapp_orders")
      .update({ status: "ready", ready_at: new Date().toISOString() })
      .eq("id", orderId)
      .neq("status", "ready")
      .select("order_no, customer_name, customer_phone, customer_opt_in")
      .maybeSingle();
    if (!order) return; // already marked ready, or unknown order

    const ref = orderRef(order.order_no);
    let note = "Customer notified on WhatsApp.";

    if (!order.customer_opt_in) {
      note = "Customer opted out of WhatsApp updates – please call them.";
    } else if (!canMessage(order.customer_phone)) {
      note = "TEST MODE: customer number not allow-listed, so no message was sent.";
    } else {
      try {
        // order_ready: {{1}} name  {{2}} ref
        await sendTemplate(order.customer_phone, WA.templates.orderReady, {
          body: [order.customer_name || "there", ref],
        });
      } catch (e: any) {
        console.error("[webhook] order_ready failed:", e?.message, e?.details);
        note = `Could not message the customer (${e?.message ?? "error"}).`;
      }
    }
    await sendText(staffPhone, `Order ${ref} marked ready. ${note}`).catch((e) =>
      console.error("[webhook] staff reply failed:", e?.message),
    );
  }
}

// ── Customer replies "STOP" ───────────────────────────────────
async function handleOptOut(customerPhone: string) {
  await supabaseAdmin
    .from("whatsapp_orders")
    .update({ customer_opt_in: false })
    .eq("customer_phone", customerPhone);
  // The customer just messaged us, so the 24h window is open for a free-form reply.
  await sendText(
    customerPhone,
    "You won't receive any more order updates from Lords & Legends on WhatsApp. You can opt in again with your next order.",
  ).catch(() => {});
}

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text(); // raw body – needed for the signature
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const rows: Record<string, unknown>[] = [];
  const tasks: Promise<unknown>[] = [];

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "messages") continue;
      const value = change.value ?? {};

      // Inbound messages (text, button taps, ...)
      for (const msg of value.messages ?? []) {
        const text: string | null =
          msg.text?.body ??
          msg.button?.text ??
          msg.interactive?.button_reply?.title ??
          msg.interactive?.list_reply?.title ??
          null;

        rows.push({
          direction: "in",
          wa_id: msg.from,
          wa_message_id: msg.id,
          type: msg.type,
          body: text,
          raw: msg,
        });
        tasks.push(markAsRead(msg.id).catch(() => {}));

        // Template quick-reply button tapped
        if (msg.type === "button" && typeof msg.button?.payload === "string") {
          const [action, orderId] = msg.button.payload.split(":");
          if (WA.staffRecipients.includes(msg.from)) {
            tasks.push(handleStaffAction(action, orderId, msg.from));
          }
          continue;
        }

        if (msg.type === "text" && text && STOP_WORDS.test(text)) {
          tasks.push(handleOptOut(msg.from));
        }
      }

      // Delivery statuses for messages WE sent: sent | delivered | read | failed
      for (const st of value.statuses ?? []) {
        rows.push({
          direction: "status",
          wa_id: st.recipient_id,
          wa_message_id: st.id,
          type: st.status,
          body: st.errors?.[0] ? `${st.errors[0].code}: ${st.errors[0].title}` : null,
          raw: st,
        });
      }
    }
  }

  if (rows.length) {
    const { error } = await supabaseAdmin.from("whatsapp_messages").insert(rows);
    if (error) console.error("[webhook] insert failed:", error.message);
  }
  // Serverless: finish the work before responding, or Vercel may freeze it.
  await Promise.allSettled(tasks);

  // Always 200 for valid, signed requests – otherwise Meta keeps retrying.
  return new Response("OK", { status: 200 });
};
