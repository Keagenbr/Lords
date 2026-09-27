// src/pages/api/menu/update.ts
import type { APIRoute } from "astro";
import { supabase } from "../../../db/supabase"; // Adjust path to your Supabase client setup

// Set prerender to false so Astro treats this route as a dynamic server API endpoint
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { menu } = body;

    if (!menu || !Array.isArray(menu)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing menu payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Iterate through menu categories and items to persist changes to Supabase
    for (const type of menu) {
      for (const category of type.categories) {
        // 1. Update Category metadata (image_url, label, etc.)
        const { error: catError } = await supabase.from("categories").upsert({
          id: category.id,
          label: category.label,
          image_url: category.image_url,
          type_id: type.id,
        });

        if (catError) throw catError;

        // 2. Upsert Menu Items within category
        for (const item of category.items) {
          const itemPayload: Record<string, any> = {
            name: item.name,
            price: item.price,
            description: item.description,
            serves: item.serves,
            takeaway: item.takeaway,
            image_url: item.image_url,
            category_id: category.id,
          };

          // Only pass ID if it's an existing database record (not temporary 'new_' ID)
          if (item.id && !String(item.id).startsWith("new_")) {
            itemPayload.id = item.id;
          }

          const { error: itemError } = await supabase
            .from("menu_items")
            .upsert(itemPayload);

          if (itemError) throw itemError;
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Menu updated successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("API Error updating menu:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Failed to update menu" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
