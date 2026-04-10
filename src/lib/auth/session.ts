import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const { data: profile, error } = await supabase
    .from("mait_users")
    .select("*, workspace:mait_workspaces(name)")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/login?error=no_profile");
  }

  const wsName =
    (profile.workspace as { name: string } | null)?.name ?? "—";

  return {
    authId: user.id,
    profile: profile as unknown as MaitUser,
    workspaceName: wsName,
  };
}
