// Owner-only endpoint for saving the editable Order / Booking confirmation message templates.
import type { APIRoute } from "astro";
import { guardOwnerPage } from "../../lib/adminAuth";
import { setSetting } from "../../lib/siteSettings";
import { MESSAGE_TEMPLATE_KEYS, type MessageSections } from "../../lib/messageTemplates";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ORDER_TOKENS = new Set([
  "restaurantName", "customerName", "orderRef", "orderRefLine", "collectionDetails",
  "collectionDate", "collectionTime", "platterNotice", "orderItems", "estimatedTotal",
]);
const BOOKING_TOKENS = new Set([
  "contactName", "bookingName", "bookingRef", "peopleCount", "bookingDate",
  "bookingTime", "location", "bookingNote",
]);

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, maxLength);
}

function validateTemplate(value: unknown, allowedTokens: Set<string>): MessageSections | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Please provide a valid three-part message template.";
  }
  const data = value as Record<string, unknown>;
  const header = cleanText(data.header, 2000);
  const information = cleanText(data.information, 4000);
  const generalText = cleanText(data.generalText, 4000);

  if (header === null || information === null || generalText === null) {
    return "Header message, Information, and General Text must all be text fields.";
  }
  if (!header.trim()) return "Header message cannot be empty.";
  if (!information.trim()) return "Information cannot be empty.";
  if (header.length + information.length + generalText.length > 8000) {
    return "The combined message template is too long. Keep it under 8,000 characters.";
  }

  const combined = `${header}\n${information}\n${generalText}`;
  const tokens = [...combined.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
  const invalidTokens = [...new Set(tokens.filter((token) => !allowedTokens.has(token)))];
  if (invalidTokens.length) {
    return `Unknown placeholder${invalidTokens.length === 1 ? "" : "s"}: ${invalidTokens.map((token) => `{${token}}`).join(", ")}. Use only the placeholders listed below the editor.`;
  }

  const present = new Set(tokens);
  if (allowedTokens === ORDER_TOKENS) {
    const missing = ["customerName", "orderItems"].filter((token) => !present.has(token));
    if (missing.length) {
      return `The order message must keep ${missing.map((token) => `{${token}}`).join(" and ")} so the customer's name and ordered items are included.`;
    }
    if (!present.has("collectionDetails") && !present.has("collectionTime")) {
      return "Keep {collectionDetails} or {collectionTime} so collection timing is included in the order message.";
    }
  } else {
    const required = ["contactName", "bookingRef", "peopleCount", "bookingDate", "bookingTime", "location"];
    const missing = required.filter((token) => !present.has(token));
    if (missing.length) {
      return `The confirmation needs these booking details: ${missing.map((token) => `{${token}}`).join(", ")}. Add them to the Information section or another section before saving.`;
    }
  }

  return { header, information, generalText };
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const { user, response } = await guardOwnerPage(cookies, redirect);
  if (response) return json({ error: "Forbidden: Owner access required." }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const kind = body?.kind;
  if (kind !== "order" && kind !== "bookingConfirmation") {
    return json({ error: "Unknown message template type." }, 400);
  }

  const template = validateTemplate(body?.template, kind === "order" ? ORDER_TOKENS : BOOKING_TOKENS);
  if (typeof template === "string") return json({ error: template }, 400);

  const key = kind === "order"
    ? MESSAGE_TEMPLATE_KEYS.order
    : MESSAGE_TEMPLATE_KEYS.bookingConfirmation;

  try {
    await setSetting(key, JSON.stringify(template), user.id);
  } catch (error) {
    console.error("[admin/set-message-templates] save failed:", error);
    return json({ error: "The message template could not be saved. Please try again." }, 500);
  }

  return json({ ok: true, kind, template });
};
