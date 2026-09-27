import { supabase } from "./supabase";

export async function getMenu() {
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

  return data || [];
}
