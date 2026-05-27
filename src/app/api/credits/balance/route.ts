import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Saldo crediti sempre fresco: niente caching lato route/edge/browser.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Resolve workspace owner (oldest member = creator)
  const admin = createAdminClient();
  const { data: owner } = await admin
    .from("mait_users")
    .select("credits_balance, subscription_tier, monthly_credits, current_period_end")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!owner) {
    return NextResponse.json({ error: "Owner not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      balance: owner.credits_balance ?? 0,
      tier: owner.subscription_tier ?? "scout",
      monthlyCredits: owner.monthly_credits ?? 10,
      periodEnd: owner.current_period_end ?? null,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
