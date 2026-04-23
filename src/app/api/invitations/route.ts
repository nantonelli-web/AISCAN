import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "analyst", "viewer"]),
});

/** List invitations for current workspace */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id || !["super_admin", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mait_invitations")
    .select("id, email, role, accepted_at, expires_at, created_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/invitations]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** Create a new invitation */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email e ruolo sono obbligatori." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id || !["super_admin", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Solo admin possono invitare utenti." }, { status: 403 });
  }

  // Check if user already exists in workspace
  const admin = createAdminClient();
  const { data: existingUser } = await admin
    .from("mait_users")
    .select("id")
    .eq("workspace_id", profile.workspace_id)
    .eq("email", parsed.data.email)
    .single();

  if (existingUser) {
    return NextResponse.json(
      { error: "Questo utente è già membro del workspace." },
      { status: 409 }
    );
  }

  // Check plan member limit
  // Find workspace owner (the admin who created the workspace or has subscription)
  const { data: owner } = await admin
    .from("mait_users")
    .select("subscription_tier")
    .eq("workspace_id", profile.workspace_id)
    .not("subscription_tier", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const tier = (owner?.subscription_tier as string) ?? "scout";
  const maxMembers: Record<string, number> = { scout: 1, analyst: 1, strategist: 3, agency: 10 };
  const limit = maxMembers[tier] ?? 1;

  const { count: currentMembers } = await admin
    .from("mait_users")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", profile.workspace_id);

  if ((currentMembers ?? 0) >= limit) {
    return NextResponse.json(
      { error: `Il tuo piano ${tier} consente massimo ${limit} ${limit === 1 ? "membro" : "membri"}. Aggiorna il piano per invitare altri utenti.` },
      { status: 403 }
    );
  }

  // Check for existing pending invitation
  const { data: existingInv } = await admin
    .from("mait_invitations")
    .select("id, accepted_at")
    .eq("workspace_id", profile.workspace_id)
    .eq("email", parsed.data.email)
    .single();

  if (existingInv && !existingInv.accepted_at) {
    return NextResponse.json(
      { error: "Invito già inviato a questa email. In attesa di accettazione." },
      { status: 409 }
    );
  }

  const { data: inv, error } = await admin
    .from("mait_invitations")
    .upsert(
      {
        workspace_id: profile.workspace_id,
        email: parsed.data.email,
        role: parsed.data.role,
        invited_by: user.id,
        accepted_at: null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "workspace_id,email" }
    )
    .select("id, token")
    .single();

  if (error) {
    console.error("[api/invitations]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/invite/${inv.token}`;

  return NextResponse.json({ id: inv.id, inviteUrl });
}
