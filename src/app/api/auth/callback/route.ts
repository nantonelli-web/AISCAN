import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Supabase OAuth callback. After Google auth, Supabase redirects here
 * (or to the Site URL) with a `code` param. We exchange it for a session,
 * then bootstrap workspace + mait_user if the user is new.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // Check if this user already has a mait_users row
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: existing } = await supabase
      .from("mait_users")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!existing) {
      // First-time Google login → auto-bootstrap workspace + user
      const admin = createAdminClient();
      const name =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email?.split("@")[0] ??
        "User";
      const email = user.email ?? "";

      const slug = `ws-${user.id.slice(0, 8)}`;
      const { data: ws } = await admin
        .from("mait_workspaces")
        .insert({ name: `${name}'s workspace`, slug })
        .select("id")
        .single();

      if (ws) {
        await admin.from("mait_users").insert({
          id: user.id,
          email,
          name,
          role: "admin",
          workspace_id: ws.id,
        });
      }
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
