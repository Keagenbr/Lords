// src/lib/siteSettings.ts
//
// A small key/value table for site settings an Owner can change without a
// code deploy. Currently just the WhatsApp ordering number
// (src/pages/admin/settings.astro), but any other "a non-developer should
// be able to change this" value can reuse getSetting()/setSetting().
//
// Reads use the public (anon-key) client — same as the rest of the public
// menu data (src/lib/menu.ts) — since these values are shown on public
// pages (Footer, the menu's "Send via WhatsApp" button). Writes use the
// service-role client and are only ever reached from Owner-gated routes
// (see guardOwnerPage in src/lib/adminAuth.ts).
import { supabase } from "./supabase";
import { supabaseAdmin } from "./supabaseAdmin";

/** Returns the stored value for `key`, or `fallback` if unset / on error. */
export async function getSetting(
  key: string,
  fallback: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`[siteSettings] getSetting("${key}") failed:`, error.message);
    return fallback;
  }
  return data?.value ?? fallback;
}

/** Upserts `key` = `value`. Throws on failure — callers should catch. */
export async function setSetting(
  key: string,
  value: string,
  updatedBy?: string,
): Promise<void> {
  const { error } = await supabaseAdmin.from("site_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });
  if (error) throw new Error(error.message);
}
