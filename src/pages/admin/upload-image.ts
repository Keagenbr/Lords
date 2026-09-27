import type { APIRoute, AstroCookies } from "astro";
import { supabase } from "../../lib/supabase";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export const prerender = false;

async function requireAdmin(cookies: AstroCookies) {
  const accessToken = cookies.get("sb-access-token")?.value;
  const refreshToken = cookies.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error || !data.user) return null;

  const isAdmin =
    data.user.app_metadata?.role === "admin" ||
    data.user.user_metadata?.role === "admin";

  return isAdmin ? data.user : null;
}

// Only these folders are allowed — matches the buckets/folders your
// site already reads from (see getCategoryImage / getItemImage in
// MenuIndex.astro). Add more here if you introduce new ones.
const ALLOWED_FOLDERS = ["Categories", "MenuItems"];
const BUCKET = "LordsImg";

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await requireAdmin(cookies);
  if (!user) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
    });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const folder = String(formData.get("folder") || "");

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "No file provided" }), {
      status: 400,
    });
  }
  if (!ALLOWED_FOLDERS.includes(folder)) {
    return new Response(
      JSON.stringify({
        error: `folder must be one of: ${ALLOWED_FOLDERS.join(", ")}`,
      }),
      { status: 400 },
    );
  }
  if (!file.type.startsWith("image/")) {
    return new Response(JSON.stringify({ error: "File must be an image" }), {
      status: 400,
    });
  }
  const MAX_BYTES = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: "Image must be under 5MB" }), {
      status: 400,
    });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return new Response(JSON.stringify({ error: uploadError.message }), {
      status: 500,
    });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return new Response(JSON.stringify({ url: publicUrlData.publicUrl }), {
    status: 200,
  });
};
