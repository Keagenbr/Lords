// src/lib/googleCalendar.ts
//
// Builds a Google Calendar "Add event" template URL. This does NOT use the
// Google Calendar API, OAuth, SDKs, or any Google credentials. The returned
// URL simply opens Google Calendar with a pre-populated event for the signed-in
// user to review and save.

export const GOOGLE_CALENDAR_TIME_ZONE = "Africa/Johannesburg";
export const GROUP_BOOKING_DURATION_MINUTES = 120;

export interface GoogleCalendarTemplateInput {
  title: string;
  date: string;
  startTime: string;
  details?: string;
  location?: string;
  durationMinutes?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function formatGoogleUtcDate(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Creates a one-time Google Calendar event template URL.
 *
 * The booking time is interpreted as Africa/Johannesburg local time, then
 * converted to UTC for the Calendar template's ISO-8601 `dates` parameter.
 */
export function buildGoogleCalendarTemplateUrl({
  title,
  date,
  startTime,
  details = "",
  location = "",
  durationMinutes = GROUP_BOOKING_DURATION_MINUTES,
}: GoogleCalendarTemplateInput): string {
  if (!DATE_RE.test(date)) throw new Error("Invalid calendar date.");
  if (!TIME_RE.test(startTime)) throw new Error("Invalid calendar start time.");

  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration < 30 || duration > 24 * 60) {
    throw new Error("Invalid calendar duration.");
  }

  const start = new Date(`${date}T${startTime}:00+02:00`);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid calendar date/time.");

  const end = new Date(start.getTime() + duration * 60_000);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    dates: `${formatGoogleUtcDate(start)}/${formatGoogleUtcDate(end)}`,
    stz: GOOGLE_CALENDAR_TIME_ZONE,
    etz: GOOGLE_CALENDAR_TIME_ZONE,
    text: title.trim().slice(0, 200),
    details: details.trim().slice(0, 2000),
    location: location.trim().slice(0, 500),
  });

  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}
