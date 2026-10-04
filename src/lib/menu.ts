import { supabase } from "./supabase";

export interface ModifierOption {
  id: string;
  name: string;
  price: number; // 0 for no-charge options
}

export interface ModifierGroup {
  id: string;
  name: string; // e.g. "Starch Option", "Extra Sauce"
  selection_type: "single" | "multiple"; // single = radio, multiple = checkboxes
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
  /** Inherited from the item's category via category_modifier_groups. */
  modifier_groups: ModifierGroup[];
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

export async function getMenu(): Promise<MenuType[]> {
  const [
    { data, error },
    { data: groups },
    { data: options },
    { data: categoryGroups },
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
                    takeaway
                )
            )
        `,
      )
      .order("sort_order", { ascending: true }),
    supabase.from("modifier_groups").select("*").order("sort_order"),
    supabase.from("modifier_options").select("*").order("sort_order"),
    supabase.from("category_modifier_groups").select("*"),
  ]);

  if (error) {
    console.error("Supabase Query Error:", error);
    throw error;
  }

  // id -> fully-built ModifierGroup (with its options attached)
  const groupsById: Record<string, ModifierGroup> = {};
  (groups ?? []).forEach((g) => {
    groupsById[g.id] = {
      id: g.id,
      name: g.name,
      selection_type: g.selection_type,
      sort_order: g.sort_order,
      options: (options ?? [])
        .filter((o) => o.group_id === g.id)
        .map((o) => ({ id: o.id, name: o.name, price: Number(o.price) })),
    };
  });

  // category_id -> the modifier groups linked to it
  const groupsByCategory: Record<string, ModifierGroup[]> = {};
  (categoryGroups ?? []).forEach((cg) => {
    if (!groupsByCategory[cg.category_id])
      groupsByCategory[cg.category_id] = [];
    const group = groupsById[cg.group_id];
    if (group) groupsByCategory[cg.category_id].push(group);
  });

  const types = (data || []) as unknown as (MenuType & {
    categories: (MenuCategory & {
      items: Omit<MenuItem, "modifier_groups">[];
    })[];
  })[];

  // Attach each category's modifier groups onto every item in it.
  return types.map((type) => ({
    ...type,
    categories: type.categories.map((category) => {
      const modifierGroups = groupsByCategory[category.id] || [];
      return {
        ...category,
        items: category.items.map((item) => ({
          ...item,
          modifier_groups: modifierGroups,
        })),
      };
    }),
  }));
}
