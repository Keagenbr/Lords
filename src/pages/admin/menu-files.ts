// src/pages/admin/menu-files.ts  ->  POST /admin/menu-files   (admin only)
//
// Small JSON API used by the image editor and the PDF uploader:
//
//   { action: "rename", section, filename, name }  rename an ADDED picture
//   { action: "delete", section, filename }        delete an ADDED picture
//   { action: "pdf-upload-url" }                   signed URL for the menu PDF
//   { action: "pdf-delete" }                       remove the menu PDF
//
// The fixed pictures (src/lib/menuImages.ts) can't be renamed or deleted here:
// the public pages load them by name, so that would break the site.
//
// The PDF is uploaded by the browser STRAIGHT to Supabase Storage with a
// one-time signed URL, so it is not limited by Vercel's 4.5 MB request limit.
import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getAdminUser } from "../../lib/adminAuth";
import { STORAGE_BUCKET, getPublicImageUrl } from "../../lib/supabaseStorage";
import {
  IMAGE_SECTIONS,
  MENU_PDF,
  isImageSectionKey,
  labelFromFilename,
  safeImageName,
} from "../../lib/menuImages";
import { fileExists } from "../../lib/menuImageStore";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const bucket = () => supabaseAdmin.storage.from(STORAGE_BUCKET);

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getAdminUser(cookies);
  if (!user) return json({ error: "Forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }
  const action = String(body.action || "");

  // ── Full menu PDF ──────────────────────────────────────────────
  if (action === "pdf-upload-url") {
    const path = `${MENU_PDF.folder}/${MENU_PDF.filename}`;
    const { data, error } = await bucket().createSignedUploadUrl(path, {
      upsert: true,
    });
    if (error || !data) {
      return json({ error: error?.message || "Could not prepare the upload" }, 500);
    }
    return json({
      signedUrl: data.signedUrl,
      path,
      publicUrl: getPublicImageUrl(path),
      maxBytes: MENU_PDF.maxBytes,
    });
  }

  if (action === "pdf-delete") {
    const { error } = await bucket().remove([
      `${MENU_PDF.folder}/${MENU_PDF.filename}`,
    ]);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── Added pictures ─────────────────────────────────────────────
  const sectionKey = String(body.section || "");
  if (!isImageSectionKey(sectionKey)) {
    return json({ error: "Unknown image section" }, 400);
  }
  const section = IMAGE_SECTIONS[sectionKey];
  const filename = String(body.filename || "");

  // Only plain file names inside this section's "added" folder.
  if (!filename || filename.includes("/") || filename.includes("..")) {
    return json({ error: "Invalid file name" }, 400);
  }
  if (section.images.some((img) => img.filename === filename)) {
    return json(
      { error: "Built-in pictures can't be renamed or deleted (the website loads them by name)." },
      400,
    );
  }
  if (!(await fileExists(section.extraFolder, filename))) {
    return json({ error: "That picture no longer exists" }, 404);
  }
  const from = `${section.extraFolder}/${filename}`;

  if (action === "delete") {
    const { error } = await bucket().remove([from]);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "rename") {
    const name = safeImageName(String(body.name || ""));
    if (!name) return json({ error: "Please enter a name" }, 400);
    const ext = filename.match(/\.[a-z0-9]+$/i)?.[0] ?? ".jpg";
    const newFilename = `${name}${ext.toLowerCase()}`;
    if (newFilename === filename) {
      return json({ filename, label: labelFromFilename(filename), url: getPublicImageUrl(from) });
    }
    if (await fileExists(section.extraFolder, newFilename)) {
      return json(
        { error: `A picture called "${newFilename}" already exists.`, code: "name_taken" },
        409,
      );
    }
    const to = `${section.extraFolder}/${newFilename}`;
    const { error } = await bucket().move(from, to);
    if (error) return json({ error: error.message }, 500);
    return json({
      filename: newFilename,
      label: labelFromFilename(newFilename),
      url: getPublicImageUrl(to),
      downloadUrl: getPublicImageUrl(to, undefined, { download: newFilename }),
    });
  }

  return json({ error: "Unknown action" }, 400);
};
