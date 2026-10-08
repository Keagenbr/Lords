// -> GET/POST /admin/menu-choices (owner only)
//
// Owns the modifier/choice library used by the public menu order modal.
// Admins may edit normal menu items, but only Owners may create/edit/delete
// choice groups, their options, and the categories/items to which they apply.
import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getSessionUser, isOwnerUser } from "../../lib/adminAuth";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const GROUP_ID_RE = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const OPTION_ID_RE = /^[a-z0-9][a-z0-9_-]{1,99}$/;

const cleanText = (value: unknown, max: number) =>
  String(value ?? "")
    .replace(/[\u0000-\u001F]/g, " ")
    .trim()
    .slice(0, max);

const asIds = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.map((v) => String(v ?? "").trim()).filter(Boolean))]
    : [];

async function requireOwner(cookies: Parameters<typeof getSessionUser>[0]) {
  const user = await getSessionUser(cookies);
  return user && isOwnerUser(user) ? user : null;
}

async function loadPayload() {
  const [groupsResult, optionsResult, categoryAssignmentsResult, itemAssignmentsResult, typesResult] =
    await Promise.all([
      supabaseAdmin.from("modifier_groups").select("id,name,selection_type,sort_order").order("sort_order"),
      supabaseAdmin.from("modifier_options").select("id,group_id,name,price,sort_order").order("sort_order"),
      supabaseAdmin.from("category_modifier_groups").select("category_id,group_id"),
      supabaseAdmin.from("menu_item_modifier_groups").select("item_id,group_id"),
      supabaseAdmin
        .from("menu_types")
        .select("id,label,sort_order,categories:menu_categories(id,label,sort_order,items:menu_items(id,name,sort_order))")
        .order("sort_order"),
    ]);

  for (const result of [groupsResult, optionsResult, categoryAssignmentsResult, itemAssignmentsResult, typesResult]) {
    if (result.error) throw result.error;
  }

  const categoryIdsByGroup: Record<string, string[]> = {};
  for (const row of categoryAssignmentsResult.data ?? []) {
    const groupId = String(row.group_id);
    const categoryId = String(row.category_id);
    (categoryIdsByGroup[groupId] ??= []).push(categoryId);
  }

  const itemIdsByGroup: Record<string, string[]> = {};
  for (const row of itemAssignmentsResult.data ?? []) {
    const groupId = String(row.group_id);
    const itemId = String(row.item_id);
    (itemIdsByGroup[groupId] ??= []).push(itemId);
  }

  const optionsByGroup: Record<string, any[]> = {};
  for (const option of optionsResult.data ?? []) {
    const groupId = String(option.group_id);
    (optionsByGroup[groupId] ??= []).push({
      id: String(option.id),
      name: String(option.name ?? ""),
      price: Number(option.price ?? 0),
      sort_order: option.sort_order == null ? null : Number(option.sort_order),
    });
  }

  const menuTypes = (typesResult.data ?? []).map((type: any) => ({
    id: String(type.id),
    label: String(type.label ?? type.id),
    categories: (type.categories ?? [])
      .sort((a: any, b: any) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
      .map((category: any) => ({
        id: String(category.id),
        label: String(category.label ?? category.id),
        items: (category.items ?? [])
          .sort((a: any, b: any) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
          .map((item: any) => ({ id: String(item.id), name: String(item.name ?? item.id) })),
      })),
  }));

  const groups = (groupsResult.data ?? []).map((group: any) => ({
    id: String(group.id),
    name: String(group.name ?? group.id),
    selection_type: group.selection_type === "multiple" ? "multiple" : "single",
    sort_order: group.sort_order == null ? null : Number(group.sort_order),
    options: optionsByGroup[String(group.id)] ?? [],
    categoryIds: [...new Set(categoryIdsByGroup[String(group.id)] ?? [])],
    itemIds: [...new Set(itemIdsByGroup[String(group.id)] ?? [])],
  }));

  return { groups, menuTypes };
}

export const GET: APIRoute = async ({ cookies }) => {
  const user = await requireOwner(cookies);
  if (!user) return json({ error: "Forbidden: Owner access required." }, 403);

  try {
    return json(await loadPayload());
  } catch (error: any) {
    console.error("[admin/menu-choices] load failed:", error?.message || error);
    return json({ error: error?.message || "Could not load menu choices." }, 500);
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await requireOwner(cookies);
  if (!user) return json({ error: "Forbidden: Owner access required." }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = String(body?.action || "");

  try {
    if (action === "delete") {
      const groupId = cleanText(body?.groupId, 80);
      if (!GROUP_ID_RE.test(groupId)) return json({ error: "Invalid choice group id." }, 400);

      // Explicitly clear both assignment tables first. This makes group deletion
      // safe even if an older database foreign key is not configured with CASCADE.
      const [{ error: catDeleteError }, { error: itemDeleteError }, { error: optionDeleteError }] =
        await Promise.all([
          supabaseAdmin.from("category_modifier_groups").delete().eq("group_id", groupId),
          supabaseAdmin.from("menu_item_modifier_groups").delete().eq("group_id", groupId),
          supabaseAdmin.from("modifier_options").delete().eq("group_id", groupId),
        ]);
      if (catDeleteError || itemDeleteError || optionDeleteError) {
        throw catDeleteError || itemDeleteError || optionDeleteError;
      }

      const { error } = await supabaseAdmin.from("modifier_groups").delete().eq("id", groupId);
      if (error) throw error;
      return json({ ok: true, groupId });
    }

    if (action !== "save") return json({ error: `Unknown action: ${action}` }, 400);

    const input = body?.group || {};
    const groupId = cleanText(input.id, 80);
    const name = cleanText(input.name, 80);
    const selectionType = input.selection_type === "multiple" ? "multiple" : "single";
    const sortOrder = Number.isFinite(Number(input.sort_order)) ? Math.max(0, Math.min(100000, Number(input.sort_order))) : 0;

    if (!GROUP_ID_RE.test(groupId)) return json({ error: "Choice group id must use lowercase letters, numbers, hyphens or underscores." }, 400);
    if (!name) return json({ error: "Choice group name is required." }, 400);

    const optionsInput = Array.isArray(input.options) ? input.options : [];
    const options = optionsInput.map((option: any, index: number) => ({
      id: cleanText(option?.id, 100),
      name: cleanText(option?.name, 100),
      price: Math.max(0, Math.min(100000, Number.isFinite(Number(option?.price)) ? Number(option.price) : 0)),
      sort_order: Number.isFinite(Number(option?.sort_order)) ? Number(option.sort_order) : index + 1,
    }));

    if (options.some((option) => !OPTION_ID_RE.test(option.id))) {
      return json({ error: "Every choice option needs a valid id." }, 400);
    }
    if (options.some((option) => !option.name)) {
      return json({ error: "Every choice option needs a name." }, 400);
    }
    const optionIds = options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) {
      return json({ error: "Choice option ids must be unique within a group." }, 400);
    }

    const categoryIds = asIds(input.categoryIds);
    const itemIds = asIds(input.itemIds);

    // Validate requested assignment targets against the live menu before writing.
    if (categoryIds.length) {
      const { data, error } = await supabaseAdmin.from("menu_categories").select("id").in("id", categoryIds);
      if (error) throw error;
      const valid = new Set((data ?? []).map((row: any) => String(row.id)));
      if (categoryIds.some((id) => !valid.has(id))) return json({ error: "One or more selected categories no longer exists." }, 400);
    }

    if (itemIds.length) {
      const { data, error } = await supabaseAdmin.from("menu_items").select("id").in("id", itemIds);
      if (error) throw error;
      const valid = new Set((data ?? []).map((row: any) => String(row.id)));
      if (itemIds.some((id) => !valid.has(id))) return json({ error: "One or more selected menu items no longer exists." }, 400);
    }

    const { error: groupError } = await supabaseAdmin.from("modifier_groups").upsert({
      id: groupId,
      name,
      selection_type: selectionType,
      sort_order: sortOrder,
    }, { onConflict: "id" });
    if (groupError) throw groupError;

    const { data: existingOptions, error: existingOptionsError } = await supabaseAdmin
      .from("modifier_options")
      .select("id")
      .eq("group_id", groupId);
    if (existingOptionsError) throw existingOptionsError;

    const keep = new Set(optionIds);
    const removeIds = (existingOptions ?? [])
      .map((row: any) => String(row.id))
      .filter((id) => !keep.has(id));
    if (removeIds.length) {
      const { error } = await supabaseAdmin.from("modifier_options").delete().in("id", removeIds);
      if (error) throw error;
    }

    if (options.length) {
      const { error } = await supabaseAdmin.from("modifier_options").upsert(
        options.map((option) => ({ ...option, group_id: groupId })),
        { onConflict: "id" },
      );
      if (error) throw error;
    }

    const [{ error: deleteCategoryAssignmentsError }, { error: deleteItemAssignmentsError }] =
      await Promise.all([
        supabaseAdmin.from("category_modifier_groups").delete().eq("group_id", groupId),
        supabaseAdmin.from("menu_item_modifier_groups").delete().eq("group_id", groupId),
      ]);
    if (deleteCategoryAssignmentsError || deleteItemAssignmentsError) {
      throw deleteCategoryAssignmentsError || deleteItemAssignmentsError;
    }

    if (categoryIds.length) {
      const { error } = await supabaseAdmin.from("category_modifier_groups").insert(
        categoryIds.map((categoryId) => ({ category_id: categoryId, group_id: groupId })),
      );
      if (error) throw error;
    }

    if (itemIds.length) {
      const { error } = await supabaseAdmin.from("menu_item_modifier_groups").insert(
        itemIds.map((itemId) => ({ item_id: itemId, group_id: groupId })),
      );
      if (error) throw error;
    }

    const payload = await loadPayload();
    const saved = payload.groups.find((group) => group.id === groupId);
    if (!saved) return json({ error: "Choice group was saved but could not be reloaded." }, 500);
    return json({ ok: true, group: saved });
  } catch (error: any) {
    console.error("[admin/menu-choices] save failed:", error?.message || error);
    return json({ error: error?.message || "Could not save menu choice." }, 500);
  }
};
