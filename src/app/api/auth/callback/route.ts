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

  // Bootstrap via RPC (bypasses PostgREST table access issues)
  const admin = createAdminClient();
  const name =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split("@")[0] ??
    "User";

  const { data, error: rpcErr } = await admin.rpc("mait_bootstrap_user", {
    p_user_id: user.id,
    p_email: user.email ?? "",
    p_name: name,
    p_workspace_name: `${name}'s workspace`,
  });

  if (rpcErr) {
    console.error("OAuth bootstrap RPC failed:", rpcErr.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Bootstrap failed: " + rpcErr.message)}`
    );
  }

  console.log("OAuth bootstrap result:", data);
  return NextResponse.redirect(`${origin}/dashboard`);
}
