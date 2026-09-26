import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn(
    "[supabaseServer] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is " +
      "missing. Add both to your .env file (server-only, no " +
      "PUBLIC_ prefix on the service role key).",
  );
}

export const supabaseServer = createClient(
  SUPABASE_URL ?? "",
  SERVICE_ROLE_KEY ?? "",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);
