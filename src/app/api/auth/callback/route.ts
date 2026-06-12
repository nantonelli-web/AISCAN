import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (sessionError) {
    logger.error(
      "OAuth code exchange failed",
      { channel: "auth/callback", event: "callback.exchange_failed" },
      sessionError,
    );
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(sessionError.message)}`
    );
  }

  const user = sessionData?.user;
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`);
  }

  const admin = createAdminClient();
  const email = user.email ?? "";
  const name =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    email.split("@")[0] ??
    "User";
  // Honour the workspace name the user typed at signup (stored in
  // user_metadata.workspace_name) instead of always defaulting to
  // "<name>'s workspace". With email confirmation ON every signup is
  // provisioned HERE, so without this the chosen workspace name was
  // silently lost. Falls back to the personal-workspace default.
  const workspaceName =
    (user.user_metadata?.workspace_name as string | undefined)?.trim() ||
    `${name}'s workspace`;

  // Check for pending invitation for this email
  const { data: pendingInvite } = await admin
    .from("mait_invitations")
    .select("id, workspace_id, role")
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Check if mait_user already exists
  const { data: existing } = await admin
    .from("mait_users")
    .select("id, workspace_id")
    .eq("id", user.id)
    .single();

  if (existing) {
    // User exists — check if there's a pending invite to a different workspace
    if (pendingInvite && existing.workspace_id !== pendingInvite.workspace_id) {
      const oldWorkspaceId = existing.workspace_id;

      // Move to invited workspace
      await admin
        .from("mait_users")
        .update({
          workspace_id: pendingInvite.workspace_id,
          role: pendingInvite.role,
        })
        .eq("id", user.id);

      // Mark invite as accepted
      await admin
        .from("mait_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", pendingInvite.id);

      // Clean up orphaned workspace if empty
      if (oldWorkspaceId) {
        const { count } = await admin
          .from("mait_users")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", oldWorkspaceId);
        if (count === 0) {
          await admin.from("mait_workspaces").delete().eq("id", oldWorkspaceId);
        }
      }
    }
  } else {
    // New user
    if (pendingInvite) {
      // Has a pending invite — join that workspace directly (no personal workspace)
      await admin.from("mait_users").insert({
        id: user.id,
        email,
        name,
        role: pendingInvite.role,
        workspace_id: pendingInvite.workspace_id,
      });

      await admin
        .from("mait_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", pendingInvite.id);
    } else {
      // No invite — create personal workspace
      const slug = `ws-${user.id.slice(0, 8)}`;
      const { data: ws, error: wsErr } = await admin
        .from("mait_workspaces")
        .insert({ name: workspaceName, slug })
        .select("id")
        .single();

      if (wsErr) {
        logger.error(
          "workspace creation failed",
          { channel: "auth/callback", event: "callback.workspace_create_failed", userId: user.id },
          wsErr,
        );
        return NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent("Workspace failed: " + wsErr.message)}`
        );
      }

      const { error: userErr } = await admin.from("mait_users").insert({
        id: user.id,
        email,
        name,
        role: "admin",
        workspace_id: ws.id,
      });

      if (userErr) {
        logger.error(
          "user creation failed",
          { channel: "auth/callback", event: "callback.user_create_failed", userId: user.id, workspaceId: ws.id },
          userErr,
        );
        await admin.from("mait_workspaces").delete().eq("id", ws.id);
        return NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent("User creation failed: " + userErr.message)}`
        );
      }
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
