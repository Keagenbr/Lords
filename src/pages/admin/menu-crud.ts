import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getAdminUser, isOwnerUser } from "../../lib/adminAuth";

export const prerender = false;

// ─────────────────────────────────────────────────────────────
// ALLOW-LIST: every table the editor can touch, and every column
// it's allowed to write. Add a table/column here before the editor
// UI can use it — this is what stops an arbitrary request body from
// writing to some other table in your database.
// ─────────────────────────────────────────────────────────────
const ALLOWED_TABLES: Record<string, { pk: string[]; columns: string[] }> = {
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
      "takeaway_days",
      "two_for_one",
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
  // composite primary key — item-specific modifier assignments
  menu_item_modifier_groups: {
    pk: ["item_id", "group_id"],
    columns: ["item_id", "group_id"],
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getAdminUser(cookies);
  if (!user) {
    return json({ error: "Forbidden" }, 403);
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

  const OWNER_ONLY_TABLES = new Set([
    "modifier_groups",
    "modifier_options",
    "category_modifier_groups",
  ]);

const TWO_FOR_ONE_GROUP_IDS = new Set(["side_choice", "sauce_selection"]);

async function assertTwoForOneHasChoice(itemId: string) {
  const { data: item, error: itemError } = await supabaseAdmin
    .from("menu_items")
    .select("id,category_id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) {
    const error = new Error("The menu item could not be found.");
    (error as any).code = "two_for_one_requires_choice";
    throw error;
  }

  const [itemLinksResult, categoryLinksResult] = await Promise.all([
    supabaseAdmin
      .from("menu_item_modifier_groups")
      .select("group_id")
      .eq("item_id", itemId),
    supabaseAdmin
      .from("category_modifier_groups")
      .select("group_id")
      .eq("category_id", item.category_id),
  ]);

  if (itemLinksResult.error || categoryLinksResult.error) {
    throw itemLinksResult.error || categoryLinksResult.error;
  }

  const groupIds = new Set([
    ...(itemLinksResult.data ?? []).map((row: any) => String(row.group_id)),
    ...(categoryLinksResult.data ?? []).map((row: any) => String(row.group_id)),
  ]);
  const eligible = [...groupIds].filter((id) => TWO_FOR_ONE_GROUP_IDS.has(id));

  if (eligible.length === 0) {
    const error = new Error("A 2 for 1 item must have a Side choice or Sauce selection assigned first.");
    (error as any).code = "two_for_one_requires_choice";
    throw error;
  }

  const { data: options, error: optionsError } = await supabaseAdmin
    .from("modifier_options")
    .select("group_id")
    .in("group_id", eligible);
  if (optionsError) throw optionsError;

  const groupsWithOptions = new Set((options ?? []).map((row: any) => String(row.group_id)));
  if (!eligible.some((id) => groupsWithOptions.has(id))) {
    const error = new Error("The assigned Side choice or Sauce selection has no options yet.");
    (error as any).code = "two_for_one_requires_choice";
    throw error;
  }
}

  if (OWNER_ONLY_TABLES.has(String(table)) && !isOwnerUser(user)) {
    return json({ error: "Forbidden: Owner access required for menu choices." }, 403);
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
      if (table === "menu_items" && cleanData.two_for_one === true) {
        return json({
          error: "two_for_one_requires_choice",
          message: "Create the menu item first, assign a Side choice or Sauce selection, save it, then enable 2 for 1.",
        }, 409);
      }
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
      if (table === "menu_items" && cleanData.two_for_one === true) {
        try {
          await assertTwoForOneHasChoice(String(data?.id || ""));
        } catch (error: any) {
          if (error?.code === "two_for_one_requires_choice") {
            return json({
              error: "two_for_one_requires_choice",
              message: error.message,
            }, 409);
          }
          throw error;
        }
      }

      // Never write the primary key back onto itself: identity/generated
      // id columns reject "SET id = ..." even when the value is unchanged.
      const updateData: Record<string, unknown> = { ...cleanData };
      for (const pkCol of meta.pk) delete updateData[pkCol];
      if (Object.keys(updateData).length === 0) {
        return json({ error: "Nothing to update" }, 400);
      }
      let query = supabaseAdmin.from(table).update(updateData);
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
