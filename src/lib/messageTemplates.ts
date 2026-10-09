import { getSetting } from "./siteSettings";

export interface MessageSections {
  header: string;
  information: string;
  generalText: string;
}

export const DEFAULT_ORDER_MESSAGE_TEMPLATE: MessageSections = {
  header: "*NEW ORDER*",
  information: "{orderRefLine}\nName: {customerName}\n{collectionDetails}",
  generalText: "{platterNotice}\n{orderItems}\n\n{estimatedTotal}",
};

export const DEFAULT_BOOKING_CONFIRMATION_TEMPLATE: MessageSections = {
  header: "Hi {contactName}, your Lords & Legends booking is CONFIRMED.",
  information:
    "Booking Ref: {bookingRef}\nPeople: {peopleCount}\nDate: {bookingDate}\nTime: {bookingTime}\nWhere: {location}",
  generalText:
    "Please reply here if anything needs to change. We look forward to seeing you!",
};

export const MESSAGE_TEMPLATE_KEYS = {
  order: "order_message_template",
  bookingConfirmation: "booking_confirmation_message_template",
} as const;

function parseSections(raw: string, fallback: MessageSections): MessageSections {
  try {
    const parsed = JSON.parse(raw) as Partial<MessageSections> | null;
    if (!parsed || typeof parsed !== "object") return { ...fallback };
    return {
      header: typeof parsed.header === "string" ? parsed.header : fallback.header,
      information:
        typeof parsed.information === "string"
          ? parsed.information
          : fallback.information,
      generalText:
        typeof parsed.generalText === "string"
          ? parsed.generalText
          : fallback.generalText,
    };
  } catch {
    return { ...fallback };
  }
}

export async function getOrderMessageTemplate(): Promise<MessageSections> {
  const raw = await getSetting(
    MESSAGE_TEMPLATE_KEYS.order,
    JSON.stringify(DEFAULT_ORDER_MESSAGE_TEMPLATE),
  );
  return parseSections(raw, DEFAULT_ORDER_MESSAGE_TEMPLATE);
}

export async function getBookingConfirmationTemplate(): Promise<MessageSections> {
  const raw = await getSetting(
    MESSAGE_TEMPLATE_KEYS.bookingConfirmation,
    JSON.stringify(DEFAULT_BOOKING_CONFIRMATION_TEMPLATE),
  );
  return parseSections(raw, DEFAULT_BOOKING_CONFIRMATION_TEMPLATE);
}

/** Replaces supported {placeholder} tokens and joins the three sections neatly. */
export function renderMessageSections(
  template: MessageSections,
  values: Record<string, string | number | null | undefined>,
): string {
  const render = (input: string) =>
    String(input ?? "").replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_match, key: string) => {
      const value = values[key];
      return value === null || value === undefined ? "" : String(value);
    });

  return [template.header, template.information, template.generalText]
    .map((section) => render(section).trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n[ \t]*\n[ \t]*\n+/g, "\n\n")
    .trim();
}
