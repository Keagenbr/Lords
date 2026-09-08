// Type definitions matching the current shape of drinks.json, main-menu.json,
// and specials.json. Import these into your .astro files for typed props.

export interface PriceOption {
  label: string | null;   // e.g. "200g", "Full", "250ml" — null for a single flat price
  price: number;
}

export interface AddonOption {
  description: string;    // e.g. "Add jalapeño, bacon, or feta"
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  tags?: string[];         // e.g. ["new"]
  prices: PriceOption[];   // always an array, even when there's just one flat price
  addons?: AddonOption[];
  takeaway: boolean;
  categoryId: string;
  subcategoryId?: string;  // present only when the item sits under a subcategory
}

export interface MenuSubcategory {
  id: string;
  name: string;
  note?: string;
  items: MenuItem[];
}

export interface MenuCategory {
  id: string;
  name: string;
  note?: string;
  // A category has EITHER subcategories OR items directly — never both.
  subcategories?: MenuSubcategory[];
  items?: MenuItem[];
}

export interface MenuMeta {
  title: string;
  slug: string;
  currency: string;
  updated: string; // ISO date
}

export interface MenuFile {
  meta: MenuMeta;
  categories: MenuCategory[];
}

export interface Promotion {
  id: string;
  title: string;
  day?: string;
  description: string;
}

// drinks.json and main-menu.json both match MenuFile.
export interface SpecialsFile extends MenuFile {
  promotions: Promotion[];
}
