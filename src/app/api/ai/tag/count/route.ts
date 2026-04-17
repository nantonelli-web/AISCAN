import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const url = new URL(req.url);
  const competitorId = url.searchParams.get("competitor_id");

  let query = supabase
    .from("mait_ads_external")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", profile.workspace_id)
    .is("raw_data->ai_tags", null);

  if (competitorId) {
    query = query.eq("competitor_id", competitorId);
  }

  const { count: adCount, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also count untagged organic posts
  let postQuery = supabase
    .from("mait_organic_posts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", profile.workspace_id)
    .is("raw_data->ai_tags", null);

  if (competitorId) {
    postQuery = postQuery.eq("competitor_id", competitorId);
  }

  const { count: postCount } = await postQuery;

  return NextResponse.json({ untagged: (adCount ?? 0) + (postCount ?? 0) });
}
