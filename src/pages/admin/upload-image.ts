import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getAdminUser } from "../../lib/adminAuth";
import { STORAGE_BUCKET } from "../../lib/supabaseStorage";
import { findManagedImage } from "../../lib/menuImages";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Two modes:
//
//  1. "new"     (default) - item / category pictures. Saved under a unique,
//                timestamped name; the public URL is returned and stored in
//                menu_items.image_url / menu_categories.image_url.
//  2. "replace" - the fixed images used by the Main Menu, Specials slider and
//                Platter components (see src/lib/menuImages.ts). The file
//                is written over the existing path, so the components keep
//                working without any code or database change.
const NEW_IMAGE_FOLDERS = ["Categories", "MenuItems"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getAdminUser(cookies);
  if (!user) return json({ error: "Forbidden" }, 403);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data" }, 400);
  }

  const file = formData.get("file");
  const folder = String(formData.get("folder") || "");
  const mode = String(formData.get("mode") || "new");

  if (!(file instanceof File)) return json({ error: "No file provided" }, 400);
  if (!file.type.startsWith("image/")) {
    return json({ error: "File must be an image" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: "Image must be under 5MB" }, 400);
  }

  let path: string;
  let cacheControl = "3600";

  if (mode === "replace") {
    const filename = String(formData.get("filename") || "");
    // Only files that the public components actually display can be replaced.
    if (!findManagedImage(folder, filename)) {
      return json({ error: "That image is not managed by the editor" }, 400);
    }
    path = `${folder}/${filename}`;
    // Same URL, new content: keep the browser-cache window short so visitors
    // pick up the new picture quickly.
    cacheControl = "300";
  } else {
    if (!NEW_IMAGE_FOLDERS.includes(folder)) {
      return json(
        { error: `folder must be one of: ${NEW_IMAGE_FOLDERS.join(", ")}` },
        400,
      );
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    path = `${folder}/${Date.now()}_${safeName}`;
  }

  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl,
    });

  if (uploadError) return json({ error: uploadError.message }, 500);

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return json({ url: publicUrlData.publicUrl, path });
};
