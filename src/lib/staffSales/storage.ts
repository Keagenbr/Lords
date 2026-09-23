// Staff sales storage, backed by the Supabase table `cash_up_rows` (see supabase/schema.sql).
// Server-side only: it uses the secret key, which must never reach the browser or a *_PUBLIC_* var.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildByStaff,
  dbToRaw,
  rowToDb,
  type DbRow,
  type RawRow,
} from "./cashUp";

const TABLE = "cash_up_rows";
const COLUMNS =
  "date,staff_name,manager,source_file,sales,tabbs,c_c_tips,net_cash,tips,deductions,paid";
const PAGE_SIZE = 1000; // Supabase/PostgREST returns at most 1,000 rows per request by default

/** An error whose message is safe to show to the person uploading (it never contains a key). */
export class StorageError extends Error {}

export const isDev = Boolean(import.meta.env.DEV);

// Astro docs: server-only variables are read directly off import.meta.env (never PUBLIC_-prefixed).
// process.env is kept as a fallback for hosts that inject variables at runtime rather than build time.
export const uploadKey = (): string | undefined =>
  import.meta.env.STAFF_UPLOAD_TOKEN ?? process.env.STAFF_UPLOAD_TOKEN;

let client: SupabaseClient | undefined;
function db(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    import.meta.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new StorageError(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }
  // Server-side client settings per Supabase's docs: no session storage, no token refresh.
  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Supabase errors are plain objects, so wrap them in something that has a message. */
const fail = (what: string, e: { message: string; hint?: string | null }) =>
  new StorageError(`${what}: ${e.message}${e.hint ? ` (${e.hint})` : ""}`);

/** Every saved row, oldest first. Pages through the table so nothing is cut off at 1,000 rows. */
async function loadRows(): Promise<RawRow[]> {
  const rows: DbRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db()
      .from(TABLE)
      .select(COLUMNS)
      .order("date")
      .order("staff_name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw fail("Could not read the sales data", error);
    rows.push(...((data ?? []) as unknown as DbRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows.map(dbToRaw);
}

/** The per-staff figures the staff pages show. */
export async function getByStaff(): Promise<Record<string, any>> {
  return buildByStaff(await loadRows());
}

/**
 * Saves the rows. Any date that already exists is replaced (deleted and re-inserted)
 * inside one database transaction (see the replace_cash_up_days function in schema.sql),
 * so a failure never leaves a day half-saved. Returns the dates that were replaced.
 */
export async function saveRows(
  rows: RawRow[],
): Promise<{ replaced: string[] }> {
  const dates = [...new Set(rows.map((r) => r.date))];
  const found = await db().from(TABLE).select("date").in("date", dates);
  if (found.error) throw fail("Could not check existing data", found.error);
  const replaced = [...new Set((found.data ?? []).map((r) => r.date))].sort();

  const { error } = await db().rpc("replace_cash_up_days", {
    p_rows: rows.map(rowToDb),
  });
  if (error) throw fail("Could not save the sales data", error);
  return { replaced };
}
