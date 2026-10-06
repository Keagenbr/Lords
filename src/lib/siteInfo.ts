// src/lib/siteInfo.ts
//
// Small facts about the restaurant that are used in more than one place
// (menu ordering, footer ...). Edit them here once.
import { getSetting } from "./siteSettings";

export const RESTAURANT_NAME = "Lords & Legends";
export const TAGLINE = "Good times. Cold drinks. Great company.";

// Used only if the site_settings table has no "whatsapp_number" row yet
// (e.g. right after the migration, before anyone's saved one via
// /admin/settings) — not the live value, just a safety-net default.
const FALLBACK_WHATSAPP_NUMBER = "27626685787";

/**
 * WhatsApp number in international format, digits only (no + or spaces).
 * Owner-editable at /admin/settings — stored in Supabase (site_settings),
 * not hardcoded, so changing it needs no code deploy. Async because of
 * that: call it from a component's frontmatter with `await`.
 */
export async function getWhatsAppNumber(): Promise<string> {
  return getSetting("whatsapp_number", FALLBACK_WHATSAPP_NUMBER);
}

export async function getWhatsAppLink(): Promise<string> {
  return `https://wa.me/${await getWhatsAppNumber()}`;
}

/** Shown in the footer. Add an address / opening hours here if you want them. */
export const LOCATIONS = ["Amanzimtoti, South Coast"];
export const LOCATION_URL = "https://maps.app.goo.gl/unSnpKqqHxfRQySP8";

/** Orders containing a platter must be made this many days ahead. */
export const PLATTER_NOTICE_DAYS = 2;
export const PLATTER_NOTICE_TITLE = "2 Day notice required";
export const PLATTER_NOTICE_TEXT =
  "Platters must be ordered at least 2 days in advance.";
