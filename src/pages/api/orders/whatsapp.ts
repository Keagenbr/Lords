// src/pages/api/orders/whatsapp.ts
//
// POST from the menu cart. Validates the order and stores it in Supabase.
// That's all this endpoint does —
// no WhatsApp Cloud API send happens here. The browser is responsible for
// opening a wa.me link with the order pre-filled, and the customer sends
// it to us themselves from their own WhatsApp (same as a normal customer
// message — no Meta template approval needed for that).
//
// Storing first means we still have a record of the order even if the
// customer closes WhatsApp without hitting send.
import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { PLATTER_NOTICE_DAYS } from "../../../lib/siteInfo";
import { orderRef } from "../../../lib/orders";

export const prerender = false;

const MAX_LINES = 40;
const MAX_ORDERS_PER_IP_PER_10_MIN = 5;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const clean = (v: unknown, max = 120) =>
  String(v ?? "")
    .replace(/[\u0000-\u001F]/g, " ")
    .trim()
    .slice(0, max);

const getMinPlatterDate = (days: number) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const now = new Date();
  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  // ── Validate ────────────────────────────────────────────────
  const cart = Array.isArray(body?.cart) ? body.cart.slice(0, MAX_LINES) : [];
  if (cart.length === 0) return json({ ok: false, error: "empty_cart" }, 400);

  const customerName = clean(body?.name, 60);
  if (!customerName)
    return json({ ok: false, error: "name_required", field: "name" }, 400);

  const items = cart.map((l: any) => ({
    id: clean(l?.id, 80),
    name: clean(l?.name),
    qty: Math.min(Math.max(parseInt(l?.qty, 10) || 1, 1), 50),
    price: clean(l?.price, 20),
    note: clean(l?.note, 200),
    two_for_one: Boolean(l?.two_for_one),
    options: (Array.isArray(l?.options) ? l.options : [])
      .slice(0, 12)
      .map((o: any) => ({
        groupId: clean(o?.groupId, 80),
        optionId: clean(o?.optionId, 80),
        label: clean(o?.label, 40),
        value: clean(o?.value, 60),
        // Price is replaced with the database value after modifier validation.
        price: Number.isFinite(+o?.price)
          ? Math.min(Math.max(+o.price, 0), 10000)
          : 0,
      })),
  }));

  const hasPlatter = Boolean(body?.hasPlatter);

  const collectDate = /^\d{4}-\d{2}-\d{2}$/.test(body?.collectDate)
    ? body.collectDate
    : "";
  const requiresCollectionDetails = hasPlatter;

  if (requiresCollectionDetails && !collectDate) {
    return json({ ok: false, error: "date_required", field: "collectDate" }, 400);
  }

  const [year, month, day] = collectDate
    ? collectDate.split("-").map(Number)
    : [NaN, NaN, NaN];
  const parsedDate = collectDate
    ? new Date(Date.UTC(year, month - 1, day))
    : null;
  if (collectDate && (
    parsedDate!.getUTCFullYear() !== year ||
    parsedDate!.getUTCMonth() !== month - 1 ||
    parsedDate!.getUTCDate() !== day
  )) {
    return json({ ok: false, error: "invalid_date", field: "collectDate" }, 400);
  }

  const saDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (collectDate && collectDate < saDate) {
    return json({ ok: false, error: "invalid_date", field: "collectDate" }, 400);
  }

  // Orders without a platter date are same-day takeaway orders, so use
  // today's Johannesburg weekday for the pickup-hour and takeaway-day rules.
  const orderDate = parsedDate ?? new Date(`${saDate}T00:00:00Z`);
  const orderDayOfWeek = orderDate.getUTCDay();

  const collectTime = /^\d{2}:\d{2}$/.test(body?.collectTime)
    ? body.collectTime
    : "";
  if (!collectTime) {
    return json({ ok: false, error: "time_required", field: "collectTime" }, 400);
  }
  if (collectTime) {
    const [hour, minute] = collectTime.split(":").map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      return json({ ok: false, error: "invalid_time" }, 400);
    }
    const isSunday = orderDayOfWeek === 0;
    const latestPickup = isSunday ? "16:00" : "20:00";
    if (collectTime < "11:00" || collectTime > latestPickup) {
      return json({ ok: false, error: "invalid_time", latest: latestPickup }, 400);
    }
  }

  if (hasPlatter && collectDate < getMinPlatterDate(PLATTER_NOTICE_DAYS)) {
    return json({ ok: false, error: "invalid_date", reason: "platter_notice" }, 400);
  }

  const estTotal = Number.isFinite(+body?.total)
    ? Math.max(0, +body.total)
    : null;

  // ── Re-check takeaway availability on the server. The browser is only a UX layer.
  const itemIds = items.map((item: any) => String(item.id || "")).filter(Boolean);
  if (itemIds.length !== items.length) {
    return json({ ok: false, error: "invalid_item" }, 400);
  }

  const { data: menuItems, error: menuError } = await supabaseAdmin
    .from("menu_items")
    .select("id,category_id,takeaway,takeaway_days,two_for_one")
    .in("id", itemIds);
  if (menuError) {
    console.error("[orders/whatsapp] menu availability check failed:", menuError.message);
    return json({ ok: false, error: "availability_check_failed" }, 500);
  }

  const byId = new Map((menuItems ?? []).map((item: any) => [String(item.id), item]));
  for (const itemId of itemIds) {
    const menuItem = byId.get(itemId);
    if (!menuItem || menuItem.takeaway === false) {
      return json({ ok: false, error: "item_unavailable" }, 409);
    }
    const days = Array.isArray(menuItem.takeaway_days)
      ? menuItem.takeaway_days.map(Number)
      : [0, 1, 2, 3, 4, 5, 6];
    if (!days.includes(orderDayOfWeek)) {
      return json({ ok: false, error: "item_unavailable" }, 409);
    }
  }

  // ── Validate modifier selections against the groups actually assigned to
  // each menu item. This prevents a forged request from adding a topping or
  // sauce choice to an item that does not offer it.
  const [
    { data: categoryLinks, error: categoryLinksError },
    { data: itemLinks, error: itemLinksError },
    { data: modifierOptions, error: modifierOptionsError },
    { data: modifierGroups, error: modifierGroupsError },
  ] = await Promise.all([
    supabaseAdmin.from("category_modifier_groups").select("category_id,group_id"),
    supabaseAdmin
      .from("menu_item_modifier_groups")
      .select("item_id,group_id")
      .in("item_id", itemIds),
    supabaseAdmin.from("modifier_options").select("id,group_id,name,price"),
    supabaseAdmin.from("modifier_groups").select("id,name"),
  ]);

  if (categoryLinksError || itemLinksError || modifierOptionsError || modifierGroupsError) {
    console.error(
      "[orders/whatsapp] modifier validation query failed:",
      categoryLinksError?.message ||
        itemLinksError?.message ||
        modifierOptionsError?.message ||
        modifierGroupsError?.message,
    );
    return json({ ok: false, error: "modifier_check_failed" }, 500);
  }

  const groupsByCategory = new Map<string, string[]>();
  for (const link of categoryLinks ?? []) {
    const categoryId = String(link.category_id);
    const groups = groupsByCategory.get(categoryId) ?? [];
    groups.push(String(link.group_id));
    groupsByCategory.set(categoryId, groups);
  }

  const allowedGroupsByItem = new Map<string, Set<string>>();
  for (const menuItem of menuItems ?? []) {
    const allowed = new Set<string>(
      groupsByCategory.get(String(menuItem.category_id)) ?? [],
    );
    allowedGroupsByItem.set(String(menuItem.id), allowed);
  }
  for (const link of itemLinks ?? []) {
    allowedGroupsByItem.get(String(link.item_id))?.add(String(link.group_id));
  }

  const groupNameById = new Map(
    (modifierGroups ?? []).map((group: any) => [
      String(group.id),
      String(group.name ?? group.id),
    ]),
  );
  const groupSelectionTypeById = new Map(
    (modifierGroups ?? []).map((group: any) => [
      String(group.id),
      group.selection_type === "multiple" ? "multiple" : "single",
    ]),
  );
  const optionById = new Map(
    (modifierOptions ?? []).map((option: any) => [
      String(option.id),
      {
        groupId: String(option.group_id),
        name: String(option.name ?? ""),
        price: Number(option.price ?? 0),
      },
    ]),
  );

  for (const item of items) {
    const allowedGroups = allowedGroupsByItem.get(String(item.id));
    if (!allowedGroups) return json({ ok: false, error: "invalid_item" }, 400);

    const singleGroupCounts = new Map();
    const twoForOneSelectionsByGroup = new Map<string, string[]>();
    const menuItem = byId.get(String(item.id));
    const twoForOneEnabled = Boolean(menuItem?.two_for_one);

    for (const option of item.options) {
      if (!option.groupId || !option.optionId) {
        return json({ ok: false, error: "invalid_modifier" }, 400);
      }
      const dbOption = optionById.get(option.optionId);
      if (
        !dbOption ||
        dbOption.groupId !== option.groupId ||
        !allowedGroups.has(option.groupId)
      ) {
        return json({ ok: false, error: "invalid_modifier" }, 400);
      }

      const selectionType = groupSelectionTypeById.get(dbOption.groupId);
      if (!selectionType) {
        return json({ ok: false, error: "invalid_modifier" }, 400);
      }
      if (selectionType === "single") {
        const isTwoForOneGroup = dbOption.groupId === "side_choice" || dbOption.groupId === "sauce_selection";
        if (twoForOneEnabled && isTwoForOneGroup) {
          const selections = twoForOneSelectionsByGroup.get(dbOption.groupId) ?? [];
          selections.push(String(option.optionId));
          twoForOneSelectionsByGroup.set(dbOption.groupId, selections);
        } else {
          const count = (singleGroupCounts.get(dbOption.groupId) ?? 0) + 1;
          if (count > 1) {
            return json({ ok: false, error: "invalid_modifier" }, 400);
          }
          singleGroupCounts.set(dbOption.groupId, count);
        }
      }

      option.label = groupNameById.get(dbOption.groupId) || option.label;
      option.value = dbOption.name;
      option.price = dbOption.price;
    }

    if (twoForOneEnabled) {
      const eligibleGroups = ["side_choice", "sauce_selection"].filter((groupId) =>
        allowedGroups.has(groupId),
      );
      if (eligibleGroups.length === 0) {
        return json({ ok: false, error: "invalid_two_for_one" }, 400);
      }

      // A 2-for-1 item has two portions. For every eligible choice group the
      // customer sends two entries, either two DIFFERENT options, or the same
      // option twice (one choice used for both items). Anything else is rejected.
      for (const groupId of eligibleGroups) {
        const selections = twoForOneSelectionsByGroup.get(groupId) ?? [];
        const uniqueSelections = new Set(selections);
        if (selections.length !== 2 || uniqueSelections.size < 1 || uniqueSelections.size > 2) {
          return json({ ok: false, error: "invalid_two_for_one" }, 400);
        }
      }
    }
  }

  // ── Basic abuse protection (keeps the orders table honest — no longer
  // about WhatsApp send costs, since nothing here sends anything) ──────
  const ipHash = createHash("sha256")
    .update(
      String(
        clientAddress ?? request.headers.get("x-forwarded-for") ?? "unknown",
      ),
    )
    .digest("hex");
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { count: ipCount } = await supabaseAdmin
    .from("whatsapp_orders")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  if ((ipCount ?? 0) >= MAX_ORDERS_PER_IP_PER_10_MIN) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }

  // ── Save order ──────────────────────────────────────────────
  // `status` is deliberately left unset here so the column's existing
  // default applies — we genuinely don't know yet whether the customer
  // went on to send the WhatsApp message, only that they got this far.
  const { data: order, error: insertError } = await supabaseAdmin
    .from("whatsapp_orders")
    .insert({
      customer_name: customerName,
      collect_date: collectDate || null,
      collect_time: collectTime || null,
      has_platter: hasPlatter,
      items,
      est_total: estTotal,
      ip_hash: ipHash,
    })
    .select("id, order_no")
    .single();
  if (insertError || !order) {
    console.error("[orders/whatsapp] insert failed:", insertError?.message);
    return json({ ok: false, error: "db_error" }, 500);
  }

  return json({ ok: true, orderRef: orderRef(order.order_no) });
};
