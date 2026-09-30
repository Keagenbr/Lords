import { supabase } from "./supabase";

export interface MenuItem {
  id: string | number;
  name: string;
  price: string | null;
  description: string | null;
  serves: string | null;
  image_url: string | null;
  sort_order: number | null;
  takeaway: boolean | null;
  option_groups?: unknown;
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
  const { data, error } = await supabase
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
                    option_groups
                )
            )
        `,
    )
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Supabase Query Error:", error);
    throw error;
  }

  return (data || []) as unknown as MenuType[];
}
