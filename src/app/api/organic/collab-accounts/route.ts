import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ACCOUNT_COLUMNS =
  "handle, platform, full_name, biography, category, verified, followers_count, tier, profile_pic_url, external_url, enriched_at, enrich_status, classification, classification_confidence, classification_reason, classified_at";

/**
 * GET /api/organic/collab-accounts?platform=instagram|tiktok
 *
 * Ritorna lo stato cache (L3 enrichment + L2 classification) di TUTTI
 * gli account collaboratori del workspace su quella piattaforma. Il
 * pannello Top Collaboratori lo fetcha al mount e fa il merge con gli
 * handle aggregati lato client (la cache e' workspace-scoped, non
 * brand-scoped: lo stesso influencer e' condiviso tra brand).
 */
export async function GET(req: Request) {
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
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const platform = new URL(req.url).searchParams.get("platform");
  if (platform !== "instagram" && platform !== "tiktok") {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mait_collab_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("workspace_id", profile.workspace_id)
    .eq("platform", platform);

  if (error) {
    console.error("[api/organic/collab-accounts]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ accounts: data ?? [] });
}
