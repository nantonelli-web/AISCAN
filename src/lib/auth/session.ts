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

  // Disabled by an admin → log out immediately on this (and every) request.
  // The Supabase Auth ban also blocks login/refresh, but an already-issued
  // access token stays valid until expiry; this closes that window for the
  // dashboard. Field is absent (undefined) until migration 0061 is applied,
  // so this is a no-op until then.
  if ((profile as { disabled_at?: string | null }).disabled_at) {
    await supabase.auth.signOut();
    redirect("/login?error=disabled");
  }

  const wsName =
    (profile.workspace as { name: string } | null)?.name ?? "\u2014";

  return {
    authId: user.id,
    profile: profile as unknown as MaitUser,
    workspaceName: wsName,
  };
});
