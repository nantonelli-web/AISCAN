import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (sessionError) {
    console.error("OAuth code exchange failed:", sessionError.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(sessionError.message)}`
    );
  }

  const user = sessionData?.user;
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`);
  }

  const admin = createAdminClient();

  // Check if mait_user already exists
  const { data: existing } = await admin
    .from("mait_users")
    .select("id")
    .eq("id", user.id)
    .single();

  if (!existing) {
    const name =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split("@")[0] ??
      "User";
    const email = user.email ?? "";
    const slug = `ws-${user.id.slice(0, 8)}`;

    const { data: ws, error: wsErr } = await admin
      .from("mait_workspaces")
      .insert({ name: `${name}'s workspace`, slug })
      .select("id")
      .single();

    if (wsErr) {
      console.error("OAuth: workspace creation failed:", wsErr.message);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("Workspace failed: " + wsErr.message)}`
      );
    }

    const { error: userErr } = await admin.from("mait_users").insert({
      id: user.id,
      email,
      name,
      role: "admin",
      workspace_id: ws.id,
    });

    if (userErr) {
      console.error("OAuth: user creation failed:", userErr.message);
      await admin.from("mait_workspaces").delete().eq("id", ws.id);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("User creation failed: " + userErr.message)}`
      );
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
