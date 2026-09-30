// Gracefully handle missing environment variables
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase environment variables not set. Client will not function.",
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseKey || "");
