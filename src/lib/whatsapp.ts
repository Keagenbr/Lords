// src/lib/whatsapp.ts
//
// Thin client for the WhatsApp Business Cloud API (Graph API).
// SERVER-ONLY: never import this from client-side code – it reads the access
// token and app secret.
//
// Everything that changes between Meta's TEST number and your LIVE business
// number lives in environment variables (see .env.example), so going live is
// a config change, not a code change.
import { createHmac, timingSafeEqual } from "node:crypto";

const env = import.meta.env;

const list = (v: unknown) =>
  String(v ?? "")
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);

export const WA = {
  /** "test" while using Meta's test number, "live" for the real business number. */
  mode: (env.WHATSAPP_MODE === "live" ? "live" : "test") as "test" | "live",
  graphVersion: env.WHATSAPP_GRAPH_VERSION || "v23.0",
  /** Only override for local testing against a mock server. */
  apiBase: (env.WHATSAPP_API_BASE || "https://graph.facebook.com").replace(/\/$/, ""),
  phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID as string | undefined,
  accessToken: env.WHATSAPP_ACCESS_TOKEN as string | undefined,
  appSecret: env.WHATSAPP_APP_SECRET as string | undefined,
  verifyToken: env.WHATSAPP_VERIFY_TOKEN as string | undefined,
  templateLang: env.WHATSAPP_TEMPLATE_LANG || "en",
  templates: {
    staffAlert: env.WHATSAPP_TEMPLATE_STAFF_ALERT || "new_order_alert",
    orderReceived: env.WHATSAPP_TEMPLATE_ORDER_RECEIVED || "order_received",
    orderReady: env.WHATSAPP_TEMPLATE_ORDER_READY || "order_ready",
  },
  /** Staff phones that receive new-order alerts (digits only, comma separated). */
  staffRecipients: list(env.WHATSAPP_ORDER_RECIPIENTS),
  /**
   * TEST MODE ONLY: Meta's test number can only message phones you have added
   * under API Setup -> "To" (max 5). List the same numbers here so the site
   * skips confirmations to anyone else instead of failing.
   */
  testAllowedRecipients: list(env.WHATSAPP_TEST_ALLOWED_RECIPIENTS),
};

export function isWhatsAppConfigured(): boolean {
  return Boolean(WA.phoneNumberId && WA.accessToken);
}

/** In test mode, only allow-listed numbers can receive messages. */
export function canMessage(to: string): boolean {
  if (WA.mode === "live") return true;
  // Empty list in test mode = don't filter (Meta will reject unknown numbers).
  return WA.testAllowedRecipients.length === 0 || WA.testAllowedRecipients.includes(to);
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export type SendResult = { messageId: string; waId?: string };

async function postMessage(payload: Record<string, unknown>): Promise<SendResult> {
  if (!isWhatsAppConfigured()) {
    throw new WhatsAppError("WhatsApp Cloud API is not configured", 500);
  }

  const res = await fetch(
    `${WA.apiBase}/${WA.graphVersion}/${WA.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WA.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    },
  );

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // data.error = { message, type, code, error_subcode, fbtrace_id, error_data }
    throw new WhatsAppError(
      data?.error?.message || `WhatsApp API error ${res.status}`,
      res.status,
      data?.error,
    );
  }
  return { messageId: data?.messages?.[0]?.id, waId: data?.contacts?.[0]?.wa_id };
}

/** Template variables may not contain newlines/tabs or more than 4 spaces in a row. */
export function toTemplateParam(value: unknown, max = 900): string {
  const s = String(value ?? "")
    .replace(/[\r\n\t]+/g, " | ")
    .replace(/ {4,}/g, "   ")
    .trim();
  const safe = s || "-";
  return safe.length > max ? safe.slice(0, max - 1) + "…" : safe;
}

type TemplateOptions = {
  /** Values for {{1}}, {{2}} ... in the template body, in order. */
  body?: string[];
  /**
   * Payloads for the template's quick-reply buttons, in button order.
   * They come back to the webhook as message.button.payload when tapped.
   */
  quickReplyPayloads?: string[];
  languageCode?: string;
};

/** Send an approved template (works any time – required for business-initiated chats). */
export function sendTemplate(to: string, name: string, opts: TemplateOptions = {}) {
  const components: Record<string, unknown>[] = [];

  if (opts.body?.length) {
    components.push({
      type: "body",
      parameters: opts.body.map((text) => ({ type: "text", text: toTemplateParam(text) })),
    });
  }
  (opts.quickReplyPayloads ?? []).forEach((payload, index) => {
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [{ type: "payload", payload }],
    });
  });

  return postMessage({
    to,
    type: "template",
    template: {
      name,
      language: { code: opts.languageCode || WA.templateLang },
      ...(components.length ? { components } : {}),
    },
  });
}

/** Free-form text – ONLY works within 24h of that person's last message to you. */
export function sendText(to: string, body: string) {
  return postMessage({
    to,
    type: "text",
    text: { preview_url: false, body: body.slice(0, 4096) },
  });
}

/** Mark an inbound message as read (blue ticks). */
export function markAsRead(messageId: string) {
  return postMessage({ status: "read", message_id: messageId });
}

/**
 * Verify Meta's X-Hub-Signature-256 header against the RAW request body.
 * Must be computed on the exact bytes received – never on re-serialised JSON.
 */
export function verifySignature(rawBody: string, header: string | null): boolean {
  if (!WA.appSecret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", WA.appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(header.slice("sha256=".length), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
