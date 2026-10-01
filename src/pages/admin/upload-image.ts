import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getAdminUser } from "../../lib/adminAuth";
import { STORAGE_BUCKET } from "../../lib/supabaseStorage";
import {
  IMAGE_SECTIONS,
  findManagedImage,
  isImageSectionKey,
  safeImageName,
} from "../../lib/menuImages";
import { fileExists } from "../../lib/menuImageStore";
import {
  formatFromFilename,
  optimizeImage,
  type OptimizeOptions,
} from "../../lib/optimizeImage";

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
//  3. "extra"   - a picture ADDED to a section in the image editor (one that
//                is not in the fixed list). Stored in the section's
//                `extraFolder` under a name the admin chooses:
//                  section=<key>, name=<new name>          -> add (409 if taken)
//                  section=<key>, filename=<existing file> -> replace it
const NEW_IMAGE_FOLDERS = ["Categories", "MenuItems"];

// Vercel Functions reject request bodies over 4.5 MB (413) before this code
// ever runs, so the limit here is a little under that. Bigger photos must be
// shrunk before uploading (the editor tells the admin when this happens).
const MAX_BYTES = 4 * 1024 * 1024; // 4MB

// How each kind of picture is optimised (longest side in px, JPEG/WebP quality).
// - Menu pages / specials / platter: full-page pictures people read and zoom
//   into, so they keep a high resolution.
// - Item pictures: small thumbnails + the order pop-up.
// - Category pictures: tiny logos.
const SETTINGS = {
  managed: { maxDimension: 2400, quality: 82 },
  MenuItems: { maxDimension: 1200, quality: 80 },
  Categories: { maxDimension: 600, quality: 80 },
} as const;

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
    return json({ error: "Image must be under 4MB" }, 400);
  }

  let path: string;
  let cacheControl = "3600";
  let optimizeOptions: OptimizeOptions;

  if (mode === "extra") {
    const sectionKey = String(formData.get("section") || "");
    if (!isImageSectionKey(sectionKey)) {
      return json({ error: "Unknown image section" }, 400);
    }
    const section = IMAGE_SECTIONS[sectionKey];
    const existing = String(formData.get("filename") || "");

    if (existing) {
      // Replacing a picture that was added earlier: keep its name + format.
      if (existing.includes("/") || !(await fileExists(section.extraFolder, existing))) {
        return json({ error: "That added picture no longer exists" }, 404);
      }
      path = `${section.extraFolder}/${existing}`;
      cacheControl = "300";
      optimizeOptions = {
        ...SETTINGS.managed,
        format: formatFromFilename(existing) ?? "same",
      };
    } else {
      const name = safeImageName(String(formData.get("name") || file.name));
      if (!name) return json({ error: "Please give the picture a name" }, 400);
      const filename = `${name}.jpg`;
      if (await fileExists(section.extraFolder, filename)) {
        return json(
          { error: `A picture called "${filename}" already exists. Choose another name.`, code: "name_taken" },
          409,
        );
      }
      path = `${section.extraFolder}/${filename}`;
      // Menu boards are saved as JPEG: every phone can open / save them.
      optimizeOptions = { ...SETTINGS.managed, format: "jpeg" };
    }
  } else if (mode === "replace") {
    const filename = String(formData.get("filename") || "");
    // Only files that the public components actually display can be replaced.
    if (!findManagedImage(folder, filename)) {
      return json({ error: "That image is not managed by the editor" }, 400);
    }
    path = `${folder}/${filename}`;
    // Same URL, new content: keep the browser-cache window short so visitors
    // pick up the new picture quickly.
    cacheControl = "300";
    // The file name (and therefore the URL) must not change, so the image is
    // converted to the format that matches the existing file extension.
    optimizeOptions = {
      ...SETTINGS.managed,
      format: formatFromFilename(filename) ?? "same",
    };
  } else {
    if (!NEW_IMAGE_FOLDERS.includes(folder)) {
      return json(
        { error: `folder must be one of: ${NEW_IMAGE_FOLDERS.join(", ")}` },
        400,
      );
    }
    const baseName = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    // New pictures get a fresh URL, so they can be stored as WebP.
    optimizeOptions = {
      ...SETTINGS[folder as "MenuItems" | "Categories"],
      format: "webp",
    };
    path = `${folder}/${Date.now()}_${baseName}.webp`;
  }

  // ── Optimise (never throws; see src/lib/optimizeImage.ts) ──────────
  const original = new Uint8Array(await file.arrayBuffer());
  let result = await optimizeImage(original, file.type, optimizeOptions);

  // A new picture that could not be optimised is stored as it was uploaded,
  // so give it back its real extension instead of ".webp".
  if (result.status !== "optimized" && mode === "new") {
    const ext = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "img";
    path = path.replace(/\.webp$/, `.${ext}`);
  }

  if (
    result.status !== "optimized" &&
    mode === "extra" &&
    !formData.get("filename") &&
    result.contentType !== "image/jpeg"
  ) {
    const ext = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "img";
    path = path.replace(/\.jpg$/, `.${ext}`);
  }

  // ── Upload (the optimised file, or the original if that failed) ────
  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, result.data, {
      upsert: true,
      contentType: result.contentType,
      cacheControl,
    });

  if (uploadError) return json({ error: uploadError.message }, 500);

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return json({
    url: publicUrlData.publicUrl,
    path,
    filename: path.split("/").pop(),
    // The editors show this to the admin. status "failed" means the original
    // was uploaded untouched.
    optimization: {
      status: result.status,
      originalBytes: result.originalBytes,
      finalBytes: result.finalBytes,
      message: result.message,
    },
  });
};
