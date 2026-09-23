import { supabase } from "../db/supabase";

export type MenuItem = {
  id: string;
  name: string;
  price: string | null;
  description: string | null;
  serves: string | null;
  image_url: string | null;
  category_id: string;
};

export type MenuCategory = {
  id: string;
  type_id: string;
  label: string;
  image_url: string | null;
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
      .map((c) => ({
        id: c.id,
        type_id: c.type_id,
        label: c.label,
        image_url: c.image_url,
        items: (items ?? []).filter((i) => i.category_id === c.id),
      })),
  }));
}
