import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// SECURITY: identity (userId + email) is taken from the authenticated
// session, NEVER from the request body. The previous version trusted
// client-supplied userId/email, which let a caller attach their auth id
// to a workspace with a pending invite for any claimed email, and made
// free-credit farming trivial. Only profile labels come from the body.
// Both optional: the signup form supplies them, but the login flow calls
// this with an empty body to self-heal a confirmed user whose record was
// never created — in that case the labels are derived from the auth user's
// own metadata below. Identity (id/email) ALWAYS comes from the session.
const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  workspaceName: z.string().min(1).max(120).optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const userId = user.id;
  const email = user.email ?? "";
  if (!email) {
    return NextResponse.json({ error: "Account has no email" }, { status: 400 });
  }

  // Profile labels: prefer the explicit body (signup), else fall back to
  // the auth user's metadata (set at signUp via options.data), else the
  // email local-part. Mirrors the derivation in /api/auth/callback so a
  // self-healed user gets the same name/workspace they'd have gotten there.
  const md = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    parsed.data.name ??
    (md.full_name as string | undefined) ??
    (md.name as string | undefined) ??
    email.split("@")[0] ??
    "User";
  const workspaceName =
    parsed.data.workspaceName ??
    (md.workspace_name as string | undefined) ??
    `${name}'s workspace`;

  const admin = createAdminClient();

  // Idempotency: if this user already has a profile, don't re-bootstrap
  // (and don't let a second call move them into a different workspace).
  const { data: alreadyProvisioned } = await admin
    .from("mait_users")
    .select("workspace_id")
    .eq("id", userId)
    .maybeSingle();
  if (alreadyProvisioned) {
    return NextResponse.json({ workspaceId: alreadyProvisioned.workspace_id });
  }

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

  if (pendingInvite) {
    // Join the invited workspace directly — no personal workspace created
    const { error: userErr } = await admin.from("mait_users").insert({
      id: userId,
      email,
      name,
      role: pendingInvite.role,
      workspace_id: pendingInvite.workspace_id,
    });

    if (userErr) {
      return NextResponse.json({ error: userErr.message }, { status: 500 });
    }

    await admin
      .from("mait_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", pendingInvite.id);

    return NextResponse.json({ workspaceId: pendingInvite.workspace_id });
  }

  // No invite — create personal workspace
  const slug = `ws-${userId.slice(0, 8)}`;
  const { data: ws, error: wsErr } = await admin
    .from("mait_workspaces")
    .insert({ name: workspaceName, slug })
    .select("id")
    .single();

  if (wsErr || !ws) {
    return NextResponse.json(
      { error: wsErr?.message ?? "Workspace creation failed" },
      { status: 500 }
    );
  }

  const { error: userErr } = await admin.from("mait_users").insert({
    id: userId,
    email,
    name,
    role: "admin",
    workspace_id: ws.id,
  });

  if (userErr) {
    await admin.from("mait_workspaces").delete().eq("id", ws.id);
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  return NextResponse.json({ workspaceId: ws.id });
}
