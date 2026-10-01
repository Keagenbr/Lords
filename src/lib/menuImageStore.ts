// src/lib/menuImageStore.ts  (SERVER ONLY)
//
// Reads what is actually in Supabase Storage for the menu pictures:
//   - the pictures an admin ADDED to a section (beyond the fixed list in
//     src/lib/menuImages.ts), stored in that section's `extraFolder`
//   - the full menu PDF
//
// Used by the admin image editor and the public downloads section on /menu.
// Every function here is fail-safe: if Storage cannot be reached it returns
// an empty list / null, so the pages still render with the fixed pictures.
import {
  IMAGE_SECTIONS,
  MENU_PDF,
  labelFromFilename,
  type ImageSectionKey,
} from "./menuImages";
import { STORAGE_BUCKET, getPublicImageUrl } from "./supabaseStorage";

export interface StoredImage {
  filename: string;
  label: string;
  /** Full path inside the bucket. */
  path: string;
  url: string;
  downloadUrl: string;
  /** "fixed" = one of the pictures in menuImages.ts, "extra" = added. */
  kind: "fixed" | "extra";
  size?: number;
  updatedAt?: string;
}

export interface MenuPdfInfo {
  url: string;
  downloadUrl: string;
  size: number;
  updatedAt: string | null;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif)$/i;

// Imported lazily so a missing service key never crashes a public page.
async function admin() {
  const { supabaseAdmin } = await import("./supabaseAdmin");
  return supabaseAdmin;
}

const toStored = (
  path: string,
  filename: string,
  label: string,
  kind: StoredImage["kind"],
  extra: Partial<StoredImage> = {},
): StoredImage => ({
  filename,
  label,
  path,
  kind,
  url: getPublicImageUrl(path),
  downloadUrl: getPublicImageUrl(path, undefined, { download: filename }),
  ...extra,
});

/** Pictures added to a section in the editor (newest first). */
export async function listExtraImages(
  key: ImageSectionKey,
): Promise<StoredImage[]> {
  const section = IMAGE_SECTIONS[key];
  try {
    const client = await admin();
    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .list(section.extraFolder, {
        limit: 200,
        sortBy: { column: "created_at", order: "asc" },
      });
    if (error) throw error;
    return (data ?? [])
      .filter((obj) => obj.id && IMAGE_EXT.test(obj.name))
      .map((obj) =>
        toStored(
          `${section.extraFolder}/${obj.name}`,
          obj.name,
          labelFromFilename(obj.name),
          "extra",
          {
            size: (obj.metadata as { size?: number } | null)?.size,
            updatedAt: obj.updated_at ?? undefined,
          },
        ),
      );
  } catch (err) {
    console.warn(
      `[menuImageStore] Could not list added pictures for "${key}":`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/** Fixed pictures followed by the added ones, for one section. */
export async function getSectionImages(
  key: ImageSectionKey,
): Promise<StoredImage[]> {
  const section = IMAGE_SECTIONS[key];
  const fixed = section.images.map((img) =>
    toStored(`${section.folder}/${img.filename}`, img.filename, img.label, "fixed"),
  );
  return [...fixed, ...(await listExtraImages(key))];
}

/** True when a file already exists at `folder/filename`. */
export async function fileExists(
  folder: string,
  filename: string,
): Promise<boolean> {
  try {
    const client = await admin();
    const { data } = await client.storage
      .from(STORAGE_BUCKET)
      .list(folder, { limit: 100, search: filename });
    return (data ?? []).some((obj) => obj.name === filename);
  } catch {
    return false;
  }
}

/** The full menu PDF, or null when none has been uploaded. */
export async function getMenuPdf(): Promise<MenuPdfInfo | null> {
  try {
    const client = await admin();
    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .list(MENU_PDF.folder, { limit: 100, search: MENU_PDF.filename });
    if (error) throw error;
    const obj = (data ?? []).find((o) => o.name === MENU_PDF.filename);
    if (!obj) return null;
    const path = `${MENU_PDF.folder}/${MENU_PDF.filename}`;
    // ?v= busts the browser/CDN cache after the admin uploads a new PDF.
    const version = obj.updated_at ? `v=${Date.parse(obj.updated_at)}` : "";
    const url = getPublicImageUrl(path) + (version ? `?${version}` : "");
    const downloadUrl =
      getPublicImageUrl(path, undefined, { download: MENU_PDF.downloadName }) +
      (version ? `&${version}` : "");
    return {
      url,
      downloadUrl,
      size: (obj.metadata as { size?: number } | null)?.size ?? 0,
      updatedAt: obj.updated_at ?? null,
    };
  } catch (err) {
    console.warn(
      "[menuImageStore] Could not look up the menu PDF:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
