const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const DEFAULT_BUCKET = import.meta.env.PUBLIC_SUPABASE_BUCKET || "LordsImg";

/** The bucket every public component and the admin editor read/write. */
export const STORAGE_BUCKET: string = DEFAULT_BUCKET;

/** Base URL for public objects in the bucket (no trailing slash). */
export const STORAGE_PUBLIC_BASE = `${SUPABASE_URL}/storage/v1/object/public/${DEFAULT_BUCKET}`;

if (!SUPABASE_URL) {
  // Shows up in your terminal during `astro dev` / `astro build`,
  // not in the browser console — this code never ships to the client.
  console.warn("[supabaseStorage] PUBLIC_SUPABASE_URL is not set. ");
}

/**
 * Build a public Supabase Storage URL for an object.
 *
 * @param path   Path inside the bucket, e.g. "Menu/MenuPage1.jpg".
 * @param bucket Optional bucket override. Defaults to PUBLIC_SUPABASE_BUCKET.
 */
export function getPublicImageUrl(
  path: string,
  bucket: string = DEFAULT_BUCKET,
): string {
  // Encode each path segment individually so folder separators survive
  // but characters like `&` (e.g. "MenuL&L.jpg") are escaped correctly.
  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodedPath}`;
}
