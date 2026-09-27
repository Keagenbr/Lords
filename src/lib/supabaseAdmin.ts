import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────
// SERVICE ROLE CLIENT — server-only, never import this from a
// .astro component's frontmatter that could ship to the client,
// and never from any file under src/components used client-side.
// It bypasses Row Level Security entirely, so every admin API
// route that uses it MUST check the caller is an authenticated
// admin itself (see requireAdmin() in the API routes below).
// ─────────────────────────────────────────────────────────────

// Reuse whatever env var your existing lib/supabase.ts uses for the
// project URL — check that file and replace the two names below if
// they don't match (they're just the two common Astro conventions).
const supabaseUrl =
    import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;

// New — see the setup notes in the chat reply for how to get this
// and where to put it. NEVER prefix this with PUBLIC_ (that would
// ship it to the browser) and never commit it to git.
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
        "Missing SUPABASE_SERVICE_ROLE_KEY (or the Supabase URL) in your environment. " +
            "See the setup notes for lib/supabaseAdmin.ts.",
    );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
