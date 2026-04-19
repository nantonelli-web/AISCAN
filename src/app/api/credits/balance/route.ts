import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("mait_users")
    .select("credits_balance, subscription_tier, monthly_credits, current_period_end")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    balance: profile.credits_balance ?? 0,
    tier: profile.subscription_tier ?? "scout",
    monthlyCredits: profile.monthly_credits ?? 10,
    periodEnd: profile.current_period_end ?? null,
  });
}
