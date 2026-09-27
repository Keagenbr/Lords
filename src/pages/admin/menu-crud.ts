import type { APIRoute, AstroCookies } from "astro";
import { supabase } from "../../lib/supabase";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export const prerender = false;

// ─────────────────────────────────────────────────────────────
// ALLOW-LIST: every table the editor can touch, and every column
// it's allowed to write. Add a table/column here before the editor
// UI can use it — this is what stops an arbitrary request body from
// writing to some other table in your database.
// ─────────────────────────────────────────────────────────────
const ALLOWED_TABLES: Record<string, { pk: string[]; columns: string[] }> = {
  // ... existing tables (menu_types, menu_categories, menu_items, etc.)[cite: 33]
  site_settings: {
    pk: ["key"],
    columns: ["key", "value"],
  },
  menu_types: {
    pk: ["id"],
    columns: ["id", "label", "sort_order"],
  },
  menu_categories: {
    pk: ["id"],
    columns: ["id", "type_id", "label", "sort_order", "image_url"],
  },
  menu_items: {
    pk: ["id"],
    columns: [
      "id",
      "category_id",
      "name",
      "price",
      "description",
      "serves",
      "image_url",
      "sort_order",
      "takeaway",
    ],
  },
  modifier_groups: {
    pk: ["id"],
    columns: ["id", "name", "selection_type", "sort_order"],
  },
  modifier_options: {
    pk: ["id"],
    columns: ["id", "group_id", "name", "price", "sort_order"],
  },
  // composite primary key — no single "id" column
  category_modifier_groups: {
    pk: ["category_id", "group_id"],
    columns: ["category_id", "group_id"],
  },
};

async function requireAdmin(cookies: AstroCookies) {
  const accessToken = cookies.get("sb-access-token")?.value;
  const refreshToken = cookies.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error || !data.user) return null;

  const isAdmin =
    data.user.app_metadata?.role === "admin" ||
    data.user.user_metadata?.role === "admin";

  return isAdmin ? data.user : null;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await requireAdmin(cookies);
  if (!user) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
    });
  }

  const { action, table, data } = body || {};
  const meta = ALLOWED_TABLES[table];

  if (!meta) {
    return new Response(
      JSON.stringify({ error: `Unknown or disallowed table: ${table}` }),
      { status: 400 },
    );
  }

  // Strip anything not on the allow-list for this table
  const cleanData: Record<string, unknown> = {};
  for (const col of meta.columns) {
    if (data && Object.prototype.hasOwnProperty.call(data, col)) {
      cleanData[col] = data[col];
    }
  }

  try {
    if (action === "create") {
      const { data: inserted, error } = await supabaseAdmin
        .from(table)
        .insert(cleanData)
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ row: inserted }), {
        status: 200,
      });
    }

    if (action === "update") {
      let query = supabaseAdmin.from(table).update(cleanData);
      for (const pkCol of meta.pk) {
        if (data?.[pkCol] === undefined) {
          return new Response(
            JSON.stringify({
              error: `Missing primary key column "${pkCol}" for update`,
            }),
            { status: 400 },
          );
        }
        query = query.eq(pkCol, data[pkCol]);
      }
      const { data: updated, error } = await query.select();
      if (error) throw error;
      return new Response(JSON.stringify({ rows: updated }), {
        status: 200,
      });
    }

    if (action === "delete") {
      let query = supabaseAdmin.from(table).delete();
      for (const pkCol of meta.pk) {
        if (data?.[pkCol] === undefined) {
          return new Response(
            JSON.stringify({
              error: `Missing primary key column "${pkCol}" for delete`,
            }),
            { status: 400 },
          );
        }
        query = query.eq(pkCol, data[pkCol]);
      }
      const { error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      {
        status: 400,
      },
    );
  } catch (err: any) {
    // Postgres unique-violation etc. surfaces here — pass the
    // message straight through so the editor can show it.
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
    });
  }
};
