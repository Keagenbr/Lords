import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { normaliseWhatsAppNumber, formatWhatsAppNumber } from "../../lib/phone";
import { getWhatsAppNumber, RESTAURANT_NAME } from "../../lib/siteInfo";

export const prerender = false;

const MAX_INQUIRY_PER_IP_PER_10_MIN = 5;
const MAX_INQUIRY_PER_PHONE_PER_10_MIN = 3;

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });

const clean = (value: unknown, max = 120) =>
    String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, max);

const getIpHash = (clientAddress: string | undefined, request: Request) =>
    createHash("sha256")
        .update(
            String(
                clientAddress ??
                    request.headers.get("x-forwarded-for") ??
                    "unknown",
            ),
        )
        .digest("hex");

export const POST: APIRoute = async ({ request, clientAddress }) => {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: "bad_json" }, 400);
    }

    const name = clean(body?.name, 80);
    if (!name) return json({ ok: false, error: "name_required" }, 400);

    const phone = normaliseWhatsAppNumber(body?.phone);
    if (!phone) return json({ ok: false, error: "invalid_phone" }, 400);

    const message = clean(body?.message, 2000);
    if (!message) return json({ ok: false, error: "message_required" }, 400);

    const ipHash = getIpHash(clientAddress, request);
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const [{ count: ipCount }, { count: phoneCount }] = await Promise.all([
        supabaseAdmin
            .from("contact_inquiries")
            .select("id", { count: "exact", head: true })
            .eq("ip_hash", ipHash)
            .gte("created_at", since),
        supabaseAdmin
            .from("contact_inquiries")
            .select("id", { count: "exact", head: true })
            .eq("contact_phone", phone)
            .gte("created_at", since),
    ]);

    if (
        (ipCount ?? 0) >= MAX_INQUIRY_PER_IP_PER_10_MIN ||
        (phoneCount ?? 0) >= MAX_INQUIRY_PER_PHONE_PER_10_MIN
    ) {
        return json({ ok: false, error: "rate_limited" }, 429);
    }

    const { data: inquiry, error: insertError } = await supabaseAdmin
        .from("contact_inquiries")
        .insert({
            contact_name: name,
            contact_phone: phone,
            message,
            ip_hash: ipHash,
        })
        .select("id, inquiry_no")
        .single();

    if (insertError || !inquiry) {
        console.error("[api/inquiry] insert failed:", insertError?.message);
        return json({ ok: false, error: "db_error" }, 500);
    }

    const inquiryRef = `LL-I${inquiry.inquiry_no}`;
    const whatsappNumber = await getWhatsAppNumber();
    const whatsappMessage = [
        `*GENERAL INQUIRY - ${RESTAURANT_NAME}*`,
        `Inquiry Ref: ${inquiryRef}`,
        "",
        `Name: ${name}`,
        `Phone: ${formatWhatsAppNumber(phone)}`,
        "",
        "Message:",
        message,
    ].join("\n");

    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        whatsappMessage,
    )}`;

    return json({ ok: true, inquiryRef, whatsappUrl });
};
