// src/pages/api/nav.ts  ->  GET /api/nav
//
// Feeds the site navigation (src/components/Nav.astro): the menu types with
// their categories (for the Menu dropdown) and whether the visitor is a
// signed-in admin (for the "Menu Editor" button). The nav calls this from the
// browser so every page, including prerendered ones, gets the live menu and
// the right button without being rendered per request.
import type { APIRoute } from "astro";
import { supabase } from "../../lib/supabase";
import { getAdminUser } from "../../lib/adminAuth";

export const prerender = false;

interface NavCategory {
  id: string;
  label: string;
  sort_order: number | null;
}

interface NavType {
  id: string;
  label: string;
  sort_order: number | null;
  categories: NavCategory[] | null;
}

const bySortOrder = (a: { sort_order: number | null }, b: { sort_order: number | null }) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0);

async function loadStructure() {
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
          sort_order
        )
      `,
    )
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[api/nav] Could not load menu structure:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as NavType[]).map((type) => ({
    id: type.id,
    label: type.label,
    categories: [...(type.categories ?? [])]
      .sort(bySortOrder)
      .map((category) => ({ id: category.id, label: category.label })),
  }));
}

export const GET: APIRoute = async ({ cookies }) => {
  // Anonymous visitors have no cookies, so getAdminUser() returns without
  // calling Supabase Auth.
  const [types, admin] = await Promise.all([
    loadStructure(),
    getAdminUser(cookies),
  ]);

  return new Response(JSON.stringify({ types, isAdmin: !!admin }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Depends on the login cookie, so it must never be shared or reused.
      "Cache-Control": "no-store",
    },
  });
};
