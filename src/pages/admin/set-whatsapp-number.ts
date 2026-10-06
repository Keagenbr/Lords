// src/pages/admin/set-whatsapp-number.ts  ->  POST /admin/set-whatsapp-number  (owner only)
import type { APIRoute } from "astro";
import { guardOwnerPage } from "../../lib/adminAuth";
import { normaliseWhatsAppNumber } from "../../lib/phone";
import { setSetting } from "../../lib/siteSettings";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const { user, response } = await guardOwnerPage(cookies, redirect);
  if (response)
    return json({ error: "Forbidden: Owner access required." }, 403);

  let body: { number?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const normalised = normaliseWhatsAppNumber(body.number);
  if (!normalised) {
    return json(
      { error: "That doesn't look like a valid WhatsApp number." },
      400,
    );
  }

  try {
    await setSetting("whatsapp_number", normalised, user.id);
  } catch (err: any) {
    return json({ error: err.message || "Save failed" }, 500);
  }

  return json({ ok: true, number: normalised });
};
