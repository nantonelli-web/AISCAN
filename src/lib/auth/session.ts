import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MaitUser } from "@/types";

export async function getSessionUser(): Promise<{
  authId: string;
  profile: MaitUser;
  workspaceName: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Use RPC to get profile (bypasses PostgREST table cache issue)
  const admin = createAdminClient();
  const { data: profileJson, error } = await admin.rpc("mait_get_profile", {
    p_user_id: user.id,
  });

  if (error || !profileJson) {
    redirect("/login?error=no_profile");
  }

  const profile: MaitUser = {
    id: profileJson.id,
    email: profileJson.email,
    name: profileJson.name,
    role: profileJson.role,
    workspace_id: profileJson.workspace_id,
    created_at: profileJson.created_at ?? new Date().toISOString(),
  };

  return {
    authId: user.id,
    profile,
    workspaceName: profileJson.workspace_name ?? "—",
  };
}
