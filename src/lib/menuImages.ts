// src/lib/menuImages.ts
//
// Single source of truth for the fixed images shown by the Main Menu slider
// (MenuMain.astro), the Specials slider (MenuSlider.astro) and the Platter
// image (MenuPlatter.astro). The public components use these as their
// defaults, and the admin image editor uses the same lists, so what an admin
// edits is exactly what visitors see.
//
// To add, remove, relabel or re-order a page, edit the arrays below.

export interface ManagedImage {
  /** File name inside the storage folder, e.g. "MenuPage1.jpg". */
  filename: string;
  /** Human-friendly label shown on the slider and in the editor. */
  label: string;
}

// ── Main menu (bucket folder "Menu") ────────────────────────────
export const MAIN_MENU_FOLDER = "Menu";
export const MAIN_MENU_PARTS: ManagedImage[] = [
  { filename: "MenuPage1.jpg", label: "Page 1" },
  { filename: "MenuPage2.jpg", label: "Page 2" },
  { filename: "MenuL&L.jpg", label: "Lords & Legends" },
  { filename: "MenuDrinks.jpg", label: "Drinks" },
  { filename: "MenuColdDrinks.jpg", label: "Cold Drinks" },
  { filename: "MenuAlcDrinks.jpg", label: "Alcoholic Drinks" },
  { filename: "MenuShooters.jpg", label: "Shooters" },
];

// ── Weekly specials (bucket folder "MenuSpecials") ──────────────
export const SPECIALS_FOLDER = "MenuSpecials";
export const SPECIALS: ManagedImage[] = [
  { filename: "mondaySpecial.jpg", label: "Monday Special" },
  { filename: "tuesdaySpecial.jpg", label: "Tuesday Special" },
  { filename: "wednesdaySpecial.jpg", label: "Wednesday Special" },
  { filename: "thursdaySpecial-1.jpg", label: "Thursday Special 1" },
  { filename: "thursdaySpecial-2.jpg", label: "Thursday Special 2" },
  { filename: "R150deal.jpg", label: "R150 Deal" },
];

// ── Platter menu (bucket folder "MenuSpecials") ─────────────────
export const PLATTER_FOLDER = "MenuSpecials";
export const PLATTER: ManagedImage = {
  filename: "MenuPlatter.jpg",
  label: "Platter Menu",
};

// ── Editor sections (one per admin sub-page) ────────────────────
export type ImageSectionKey = "main-menu" | "specials" | "platter";

export interface ImageSection {
  key: ImageSectionKey;
  title: string;
  blurb: string;
  folder: string;
  images: ManagedImage[];
}

export const IMAGE_SECTIONS: Record<ImageSectionKey, ImageSection> = {
  "main-menu": {
    key: "main-menu",
    title: "Main Menu Pages",
    blurb:
      "The multi-page menu slider. Replace a page with a new picture; the slider order stays the same.",
    folder: MAIN_MENU_FOLDER,
    images: MAIN_MENU_PARTS,
  },
  specials: {
    key: "specials",
    title: "Specials Slider",
    blurb: "The weekly specials slider. Replace any special with a new picture.",
    folder: SPECIALS_FOLDER,
    images: SPECIALS,
  },
  platter: {
    key: "platter",
    title: "Platter Menu",
    blurb: "The platter menu picture.",
    folder: PLATTER_FOLDER,
    images: [PLATTER],
  },
};

/** True only for images the public components actually display. */
export function findManagedImage(
  folder: string,
  filename: string,
): ManagedImage | undefined {
  return Object.values(IMAGE_SECTIONS)
    .filter((section) => section.folder === folder)
    .flatMap((section) => section.images)
    .find((image) => image.filename === filename);
}
