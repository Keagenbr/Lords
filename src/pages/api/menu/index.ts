import type { APIRoute } from "astro";
import type { AstroCookies } from "astro";
import { getAdminUser } from "../../../lib/adminAuth";
import { supabase } from "../../../lib/supabase";

export const prerender = false;

// SERVER-SIDE admin check. Previously this accepted ANY signed-in account
// (e.g. a staff member) and called setSession() on the shared client.
// getAdminUser() validates the token with Supabase Auth and requires the
// admin role stored in app_metadata, which users cannot edit themselves.
async function isAuthenticated(cookies: AstroCookies) {
  return (await getAdminUser(cookies)) !== null;
}

async function parseRequestBody(
  request: Request,
): Promise<Record<string, any>> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const data: Record<string, any> = {};
      formData.forEach((value, key) => {
        data[key] = value.toString();
      });
      return data;
    } catch {}
  }

  const rawText = await request.text();
  const data: Record<string, any> = {};

  // Try parsing as URLSearchParams first
  if (rawText) {
    const params = new URLSearchParams(rawText);
    params.forEach((value, key) => {
      data[key] = value;
    });
    if (data.id || data.category || data.name || data.email) {
      return data;
    }
  }

  // Try parsing as JSON
  if (rawText.trim().startsWith("{") || rawText.trim().startsWith("[")) {
    try {
      return JSON.parse(rawText);
    } catch {}
  }

  return data;
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!(await isAuthenticated(cookies))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await parseRequestBody(request);

  const id = body.id || "";
  const category = (body.category || "").trim();
  const subcategory = (body.subcategory || "").trim();
  const name = (body.name || "").trim();
  const description = (body.description || "").trim();
  const price = parseFloat(body.price || "0");
  const serving = (body.serving || "").trim();
  let minNoticeDays = parseInt(body.minNoticeDays || "0", 10);

  const isPlatter =
    category.toLowerCase().includes("platter") ||
    subcategory.toLowerCase().includes("platter");

  if (isPlatter && minNoticeDays < 2) {
    minNoticeDays = 2;
  }

  const itemPayload = {
    category,
    subcategory,
    name,
    description,
    price,
    serving,
    min_notice_days: minNoticeDays,
  };

  if (id) {
    const { error } = await supabase
      .from("menu_items")
      .update(itemPayload)
      .eq("id", id);
    if (error) return new Response(error.message, { status: 500 });
  } else {
    const { error } = await supabase.from("menu_items").insert(itemPayload);
    if (error) return new Response(error.message, { status: 500 });
  }

  return redirect("/admin");
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthenticated(cookies))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await parseRequestBody(request);
  const id = body.id;

  if (!id) return new Response("Missing item ID", { status: 400 });

  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) return new Response(error.message, { status: 500 });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
