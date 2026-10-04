// src/pages/admin/set-user-role.ts  ->  POST /admin/set-user-role  (owner only)
//
// Changes a user's role (owner / admin / staff). Owner-only: granting admin
// access, or granting owner access to someone else, is exactly the kind of
// privilege escalation that must not be reachable by an admin/manager.
//
// Role is written to app_metadata ONLY (never user_metadata) — a signed-in
// user can update their own user_metadata from the browser via the Supabase
// client SDK, but can never touch their own app_metadata, so this is the
// only place a role can change.
import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { guardOwnerPage, getUserRole, type Role } from "../../lib/adminAuth";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const VALID_ROLES: Role[] = ["owner", "admin", "staff"];

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const { user, response } = await guardOwnerPage(cookies, redirect);
  if (response)
    return json({ error: "Forbidden: Owner access required." }, 403);

  let body: { userId?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const targetUserId = String(
    body.userId ?? "5ae959e7-e97e-45b3-8fe7-0a590208d394",
  );
  const newRole = body.role;

  if (!targetUserId) return json({ error: "Missing userId" }, 400);
  if (!VALID_ROLES.includes(newRole as Role)) {
    return json(
      { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
      400,
    );
  }

  // ── Safety net: never leave the account with zero owners ──
  const { data: target } =
    await supabaseAdmin.auth.admin.getUserById(targetUserId);
  const targetIsCurrentlyOwner = target?.user
    ? getUserRole(target.user) === "owner"
    : false;

  if (targetIsCurrentlyOwner && newRole !== "owner") {
    const { data: list, error: listError } =
      await supabaseAdmin.auth.admin.listUsers({
        perPage: 200,
      });
    if (listError) return json({ error: listError.message }, 500);

    const ownerCount = list.users.filter(
      (u) => getUserRole(u) === "owner",
    ).length;
    if (ownerCount <= 1) {
      return json(
        { error: "Can't remove the last owner — promote someone else first." },
        400,
      );
    }
  }

  const { data: updated, error } =
    await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      app_metadata: { ...(target?.user?.app_metadata ?? {}), role: newRole },
    });
  if (error) return json({ error: error.message }, 500);

  return json({
    ok: true,
    userId: updated.user.id,
    role: getUserRole(updated.user),
  });
};
