// Helpers shared by the admin booking pages for showing booking times and
// building the WhatsApp message that confirms a booking to the customer.
//
// Nothing is sent automatically: the link opens WhatsApp with the message
// ready, and the admin presses Send themselves.
import { RESTAURANT_NAME } from "./siteInfo";

export interface BookingLike {
  booking_no: number | string;
  contact_name?: string | null;
  booking_name?: string | null;
  contact_phone?: string | null; // digits only, e.g. 27825550142
  people_count: number | string;
  booking_date: string; // YYYY-MM-DD
  booking_time?: string | null; // HH:MM or HH:MM:SS
  booking_end_time?: string | null;
}

// "18:00:00" -> "18:00"
const hhmm = (value?: string | null) => (value ? String(value).slice(0, 5) : "");

/** "18:00 - 20:00", "18:00" or "Time not specified". */
export function formatBookingTimeRange(booking: Pick<BookingLike, "booking_time" | "booking_end_time">): string {
  const start = hhmm(booking.booking_time);
  const end = hhmm(booking.booking_end_time);
  if (!start) return "Time not specified";
  return end ? `${start} - ${end}` : start;
}

const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00+02:00`));

/**
 * wa.me link that opens a chat with the CUSTOMER with a confirmation message.
 * Returns null when the booking has no usable phone number.
 */
export function buildBookingConfirmationUrl(
  booking: BookingLike,
  options: { updated?: boolean; location?: string } = {},
): string | null {
  const phone = String(booking.contact_phone ?? "").replace(/\D/g, "");
  if (phone.length < 8) return null;

  const name = booking.contact_name || booking.booking_name || "there";
  const lines = [
    `Hi ${name}, ${
      options.updated
        ? `your ${RESTAURANT_NAME} booking has been UPDATED and is confirmed.`
        : `your ${RESTAURANT_NAME} booking is CONFIRMED.`
    }`,
    "",
    `Booking Ref: LL-B${booking.booking_no}`,
    `People: ${booking.people_count}`,
    `Date: ${longDate(booking.booking_date)}`,
    `Time: ${formatBookingTimeRange(booking)}`,
  ];
  if (options.location) lines.push(`Where: ${options.location}`);
  lines.push("", "Please reply here if anything needs to change. We look forward to seeing you!");

  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}
