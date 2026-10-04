// src/lib/orders.ts
//
// Small shared helpers for WhatsApp orders (used by the order endpoint and
// the webhook).
import { RESTAURANT_NAME } from "./siteInfo";

/**
 * The exact consent wording stored with every order.
 * Keep it identical to the checkbox label in src/components/Menu/index.astro.
 */
export const OPT_IN_TEXT = `I agree to receive order updates from ${RESTAURANT_NAME} on WhatsApp.`;

/** Human-friendly order reference, e.g. 1042 -> "LL-1042". */
export const orderRef = (orderNo: number | string) => `LL-${orderNo}`;
