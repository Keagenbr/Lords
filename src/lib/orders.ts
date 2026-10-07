// Shared WhatsApp order helpers.
/** Human-friendly order reference, e.g. 1042 -> "LL-1042". */
export const orderRef = (orderNo: number | string) => `LL-${orderNo}`;
