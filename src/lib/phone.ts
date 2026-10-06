// src/lib/phone.ts
//
// Turns whatever the customer typed into the digits-only international
// format WhatsApp wa.me links expect (e.g. "082 555 0142" -> "27825550142").
//
// The same rules are copied into the inline script in
// src/components/Menu/index.astro so the form can validate as the user types.
// THIS server-side version is the one that is trusted.

export const DEFAULT_COUNTRY_CODE = "27"; // South Africa

/**
 * Returns the normalised number (digits only, with country code) or null if it
 * does not look like a valid WhatsApp mobile number.
 *
 * Accepted:
 *   0825550142, 082 555 0142, 082-555-0142      (local SA mobile)
 *   +27 82 555 0142, 27825550142, 0027825550142 (international SA)
 *   +44 7700 900123 etc.                        (other countries, 8-15 digits)
 */
export function normaliseWhatsAppNumber(
  input: unknown,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  // Only digits, spaces, dashes, dots, brackets and a leading + are allowed.
  if (!/^\+?[\d\s\-().]+$/.test(raw)) return null;

  let digits = raw.replace(/\D/g, "");
  const international = raw.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (!international) {
    // Local format: 0XX XXX XXXX
    if (digits.startsWith("0")) {
      digits = defaultCountryCode + digits.slice(1);
    } else if (!digits.startsWith(defaultCountryCode)) {
      return null;
    }
  }

  // South African numbers: 27 + 9 digits, mobile ranges start with 6, 7 or 8.
  if (digits.startsWith("27")) {
    return /^27[678]\d{8}$/.test(digits) ? digits : null;
  }

  // Any other country: E.164 allows up to 15 digits.
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** "27825550142" -> "+27 82 555 0142" (for display in staff messages). */
export function formatWhatsAppNumber(digits: string): string {
  const m = /^27(\d{2})(\d{3})(\d{4})$/.exec(digits);
  return m ? `+27 ${m[1]} ${m[2]} ${m[3]}` : `+${digits}`;
}
