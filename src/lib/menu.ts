import { supabase } from "./supabase";

export interface ModifierOption {
  id: string;
  name: string;
  price: number; // 0 for no-charge options
}

export interface ModifierGroup {
  id: string;
  name: string;
  selection_type: "single" | "multiple";
  sort_order: number | null;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string | number;
  name: string;
  price: string | null;
  description: string | null;
  serves: string | null;
  image_url: string | null;
  sort_order: number | null;
  takeaway: boolean | null;
  takeaway_days: number[] | null;
  two_for_one: boolean;
  /** Modifier groups inherited from the item's category plus item-specific groups. */
  modifier_groups: ModifierGroup[];
  /** Only the groups explicitly assigned to this individual item. */
  item_modifier_group_ids: string[];
}

export interface MenuCategory {
  id: string;
  label: string;
  sort_order: number | null;
  image_url: string | null;
  items: MenuItem[];
}

export interface MenuType {
  id: string;
  label: string;
  sort_order: number | null;
  categories: MenuCategory[];
}

/**
 * Fetch all modifier groups/options for the Admin editor.
 * This is deliberately separate from getMenu() because the editor also needs
 * to offer groups which are not currently attached to an item.
 */
export async function getModifierGroups(): Promise<ModifierGroup[]> {
  const [{ data: groups, error: groupError }, { data: options, error: optionError }] =
    await Promise.all([
      supabase.from("modifier_groups").select("*").order("sort_order"),
      supabase.from("modifier_options").select("*").order("sort_order"),
    ]);

  if (groupError) throw groupError;
  if (optionError) throw optionError;

  return (groups ?? []).map((g: any) => ({
    id: String(g.id),
    name: String(g.name ?? g.id),
    selection_type: g.selection_type === "multiple" ? "multiple" : "single",
    sort_order: g.sort_order == null ? null : Number(g.sort_order),
    options: (options ?? [])
      .filter((o: any) => String(o.group_id) === String(g.id))
      .map((o: any) => ({
        id: String(o.id),
        name: String(o.name ?? o.id),
        price: Number(o.price ?? 0),
      })),
  }));
}

export async function getMenu(): Promise<MenuType[]> {
  const [
    { data, error },
    { data: groups, error: groupError },
    { data: options, error: optionError },
    { data: categoryGroups, error: categoryGroupError },
    { data: itemGroups, error: itemGroupError },
  ] = await Promise.all([
    supabase
      .from("menu_types")
      .select(
        `
            id,
            label,
            sort_order,
            categories:menu_categories (
                id,
                label,
                sort_order,
                image_url,
                items:menu_items (
                    id,
                    name,
                    price,
                    description,
                    serves,
                    image_url,
                    sort_order,
                    takeaway,
                    takeaway_days,
                    two_for_one
                )
            )
        `,
      )
      .order("sort_order", { ascending: true }),
    supabase.from("modifier_groups").select("*").order("sort_order"),
    supabase.from("modifier_options").select("*").order("sort_order"),
    supabase.from("category_modifier_groups").select("*"),
    supabase.from("menu_item_modifier_groups").select("item_id,group_id"),
  ]);

  if (error) {
    console.error("Supabase Query Error:", error);
    throw error;
  }
  if (groupError || optionError || categoryGroupError || itemGroupError) {
    const modifierError = groupError || optionError || categoryGroupError || itemGroupError;
    console.error("Supabase modifier query error:", modifierError);
    throw modifierError;
  }

  const groupsById: Record<string, ModifierGroup> = {};
  (groups ?? []).forEach((g: any) => {
    groupsById[String(g.id)] = {
      id: String(g.id),
      name: String(g.name ?? g.id),
      selection_type: g.selection_type === "multiple" ? "multiple" : "single",
      sort_order: g.sort_order == null ? null : Number(g.sort_order),
      options: (options ?? [])
        .filter((o: any) => String(o.group_id) === String(g.id))
        .map((o: any) => ({
          id: String(o.id),
          name: String(o.name ?? o.id),
          price: Number(o.price ?? 0),
        })),
    };
  });

  const groupsByCategory: Record<string, string[]> = {};
  (categoryGroups ?? []).forEach((cg: any) => {
    const categoryId = String(cg.category_id);
    const groupId = String(cg.group_id);
    if (!groupsByCategory[categoryId]) groupsByCategory[categoryId] = [];
    groupsByCategory[categoryId].push(groupId);
  });

  const groupsByItem: Record<string, string[]> = {};
  (itemGroups ?? []).forEach((ig: any) => {
    const itemId = String(ig.item_id);
    const groupId = String(ig.group_id);
    if (!groupsByItem[itemId]) groupsByItem[itemId] = [];
    groupsByItem[itemId].push(groupId);
  });

  const types = (data || []) as unknown as (MenuType & {
    categories: (MenuCategory & {
      items: Omit<MenuItem, "modifier_groups" | "item_modifier_group_ids">[];
    })[];
  })[];

  return types.map((type) => ({
    ...type,
    categories: type.categories.map((category) => {
      const categoryGroupIds = groupsByCategory[String(category.id)] || [];
      return {
        ...category,
        items: category.items.map((item) => {
          const itemSpecificIds = groupsByItem[String(item.id)] || [];
          const combinedIds = [...new Set([...categoryGroupIds, ...itemSpecificIds])];
          return {
            ...item,
            two_for_one: item.two_for_one === true,
            item_modifier_group_ids: [...new Set(itemSpecificIds)],
            modifier_groups: combinedIds
              .map((id) => groupsById[id])
              .filter(Boolean),
          };
        }),
      };
    }),
  }));
}
