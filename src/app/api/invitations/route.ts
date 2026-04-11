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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/invite/${inv.token}`;

  return NextResponse.json({ id: inv.id, inviteUrl });
}
