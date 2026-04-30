import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * DELETE /api/settings/provider-keys/[provider]
 *
 * Removes the workspace's BYO key for the given provider. After
 * removal the workspace falls back to the AISCAN-managed env key
 * IF its billing_mode is "credits" — workspaces in "subscription"
 * mode without a key configured will fail subsequent scans /AI
 * calls until they upload a new one (intentional, no silent
 * fallback per design).
 */

const PROVIDERS = new Set(["apify", "openrouter"]);

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (!PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("mait_users")
    .select("role, workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }
  if (!["admin", "super_admin"].includes(profile.role as string)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { error } = await admin
    .from("mait_provider_keys")
    .delete()
    .eq("workspace_id", profile.workspace_id)
    .eq("provider", provider);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
