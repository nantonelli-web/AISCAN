import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyAdminToken } from "@/lib/admin-jwt";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Ban length used to "disable" a user. Supabase wants a Go duration string;
// ~100 years is effectively permanent until an admin re-enables (ban "none").
const DISABLE_BAN_DURATION = "876000h";

async function requireAdmin() {
  const jar = await cookies();
  const token = jar.get("admin_session")?.value;
  if (!token) return null;
  return verifyAdminToken(token);
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  disabled: z.boolean(),
});

const deleteSchema = z.object({
  userId: z.string().uuid(),
});

/**
 * PATCH — disable / enable a user.
 *
 * "Disable" bans the account at the Supabase Auth layer: new logins are
 * refused immediately and existing sessions stop refreshing (so the user
 * is locked out within the access-token TTL). Fully reversible.
 */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { userId, disabled } = parsed.data;
  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: disabled ? DISABLE_BAN_DURATION : "none",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, disabled });
}

/**
 * DELETE — permanently remove a user.
 *
 * Deletes the Supabase Auth user; the FK mait_users.id -> auth.users(id) is
 * ON DELETE CASCADE, so the profile row and its cascade children
 * (credits_history, credit_purchases, user_company, oauth tokens) go with
 * it. Workspace-scoped data (competitors, ads, …) is left intact — the
 * workspace is owned by the workspace, not the single user.
 */
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(parsed.data.userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
