// Shared helpers for the public booking availability calendar.
import { supabase } from "./supabase";

export interface BlockedDate {
    id: string;
    start_date: string;
    end_date: string;
    reason: string | null;
}

/**
 * Publicly readable because the public site needs to prevent customers from
 * selecting dates that an Admin/Owner has marked unavailable.
 */
export async function getBlockedDates(): Promise<BlockedDate[]> {
    const { data, error } = await supabase
        .from("blocked_dates")
        .select("id,start_date,end_date,reason")
        .order("start_date", { ascending: true });

    if (error) {
        console.error("[blockedDates] public read failed:", error.message);
        return [];
    }

    return (data ?? []) as BlockedDate[];
}

export function isDateBlocked(
    bookingDate: string,
    blocks: Array<Pick<BlockedDate, "start_date" | "end_date">>,
): boolean {
    return blocks.some(
        (block) =>
            block.start_date <= bookingDate && block.end_date >= bookingDate,
    );
}
