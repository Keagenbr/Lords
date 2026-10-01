// src/lib/siteInfo.ts
//
// Small facts about the restaurant that are used in more than one place
// (menu ordering, footer ...). Edit them here once.

export const RESTAURANT_NAME = "Lords & Legends";
export const TAGLINE = "Good times. Cold drinks. Great company.";

/** WhatsApp number in international format, digits only (no + or spaces). */
export const WHATSAPP_NUMBER = "27626685787";
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

/** Shown in the footer. Add an address / opening hours here if you want them. */
export const LOCATIONS = ["Amanzimtoti, South Coast"];
export const LOCATION_URL = "https://maps.app.goo.gl/unSnpKqqHxfRQySP8";

/** Orders containing a platter must be made this many days ahead. */
export const PLATTER_NOTICE_DAYS = 2;
export const PLATTER_NOTICE_TITLE = "2 Day notice required";
export const PLATTER_NOTICE_TEXT =
  "Platters must be ordered at least 2 days in advance.";
