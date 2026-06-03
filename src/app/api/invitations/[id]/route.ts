import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** Delete an invitation */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  if (!profile?.workspace_id || !["super_admin", "admin"].includes(profile.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { error, count } = await admin
    .from("mait_invitations")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id);

  if (error) {
    logger.error(
      "Failed to delete invitation",
      {
        channel: "invitations",
        event: "delete.failed",
        workspaceId: profile.workspace_id,
        userId: user.id,
        invitationId: id,
      },
      error,
    );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
