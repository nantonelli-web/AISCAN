import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MaitUser } from "@/types";

/**
 * Cached per-request: layout + page share the same result
 * without hitting the database twice.
 */
export const getSessionUser = cache(async (): Promise<{
  authId: string;
  profile: MaitUser;
  workspaceName: string;
}> => {
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
    (profile.workspace as { name: string } | null)?.name ?? "\u2014";

  return {
    authId: user.id,
    profile: profile as unknown as MaitUser,
    workspaceName: wsName,
  };
});
