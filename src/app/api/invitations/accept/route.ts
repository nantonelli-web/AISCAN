import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  token: z.string().min(1),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Devi essere loggato." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Token mancante." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Find invitation
  const { data: invite, error: invErr } = await admin
    .from("mait_invitations")
    .select("id, workspace_id, email, role, accepted_at, expires_at")
    .eq("token", parsed.data.token)
    .single();

  if (invErr || !invite) {
    return NextResponse.json({ error: "Invito non trovato." }, { status: 404 });
  }

  if (invite.accepted_at) {
    return NextResponse.json({ error: "Invito già accettato." }, { status: 409 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invito scaduto." }, { status: 410 });
  }

  // Check if user already has a profile
  const { data: existingProfile } = await admin
    .from("mait_users")
    .select("id, workspace_id")
    .eq("id", user.id)
    .single();

  if (existingProfile) {
    // User exists — update their workspace and role
    await admin
      .from("mait_users")
      .update({
        workspace_id: invite.workspace_id,
        role: invite.role,
      })
      .eq("id", user.id);
  } else {
    // New user — create profile
    await admin.from("mait_users").insert({
      id: user.id,
      email: user.email ?? invite.email,
      name:
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email?.split("@")[0] ??
        "User",
      role: invite.role,
      workspace_id: invite.workspace_id,
    });
  }

  // Mark invitation as accepted
  await admin
    .from("mait_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return NextResponse.json({ ok: true, workspace_id: invite.workspace_id });
}
