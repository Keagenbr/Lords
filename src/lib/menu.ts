import { supabase } from "../db/supabase";

// 1. Define your mapping here
const categoryImageMap: Record<string, string> = {
  "Alcoholic Drinks": "MenuAlcDrinks.jpg",
  "Cold Drinks": "MenuColdDrinks.jpg",
  Drinks: "MenuDrinks.jpg",
  "Liquor & Legends": "MenuL&L.jpg",
  Platters: "MenuPlatter.jpg",
  Shooters: "MenuShooters.jpg",
  Specials: "weeklySpecials.jpg", // Maps to the main specials folder
  // Add other mappings if you have specific categories
};

export type MenuOptionGroup = {
  key: string; // e.g. "side", "sauce", "rarity", "egg"
  label: string; // shown above the choices, e.g. "Side"
  options: string[]; // the pickable values, e.g. ["Chips","Side Salad"]
};

export type MenuItem = {
  id: string;
  name: string;
  price: string | null;
  description: string | null;
  serves: string | null;
  image_url: string | null;
  category_id: string;
  option_groups: MenuOptionGroup[]; // populated by supabase_menu_options_v2.sql
  takeaway: boolean; // populated by supabase_menu_options_v2.sql
};

export type MenuCategory = {
  id: string;
  type_id: string;
  label: string;
  image_url: string | null; // This will be populated below
  items: MenuItem[];
};

export type MenuType = {
  id: string;
  label: string;
  categories: MenuCategory[];
};

export async function getMenu(): Promise<MenuType[]> {
  const [{ data: types }, { data: categories }, { data: items }] =
    await Promise.all([
      supabase.from("menu_types").select("*").order("sort_order"),
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("menu_items").select("*").order("sort_order"),
    ]);

  return (types ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    categories: (categories ?? [])
      .filter((c) => c.type_id === t.id)
      .map((c) => {
        // 2. Check if this category has a specific image in our map
        const filename = categoryImageMap[c.label];

        return {
          id: c.id,
          type_id: c.type_id,
          label: c.label,
          // 3. Construct the URL using the bucket name
          image_url: filename ? `${filename}` : c.image_url, // Fallback to DB value if no map exists
          items: (items ?? []).filter((i) => i.category_id === c.id),
        };
      }),
  }));
}
