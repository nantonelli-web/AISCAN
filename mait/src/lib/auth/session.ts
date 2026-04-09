import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MaitUser } from "@/types";

export async function getSessionUser(): Promise<{
  authId: string;
  profile: MaitUser;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("mait_users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    // User exists in auth but not in mait_users → bootstrap missing
    redirect("/login?error=no_profile");
  }

  return { authId: user.id, profile: profile as MaitUser };
}
