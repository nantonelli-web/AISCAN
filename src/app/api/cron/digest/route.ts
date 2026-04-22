import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWeeklyDigest } from "@/lib/email/resend";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Get all workspaces
  const { data: workspaces } = await admin
    .from("mait_workspaces")
    .select("id, name");

  const results: Array<{ workspace: string; sent: boolean; error?: string }> = [];

  for (const ws of workspaces ?? []) {
    try {
      // Get workspace members' emails
      const { data: members } = await admin
        .from("mait_users")
        .select("email")
        .eq("workspace_id", ws.id);
      const emails = (members ?? []).map((m) => m.email).filter(Boolean);
      if (emails.length === 0) {
        results.push({ workspace: ws.name, sent: false, error: "no_members" });
        continue;
      }

      // Get competitors for this workspace
      const { data: competitors } = await admin
        .from("mait_competitors")
        .select("id, page_name")
        .eq("workspace_id", ws.id);

      if (!competitors || competitors.length === 0) {
        results.push({ workspace: ws.name, sent: false, error: "no_competitors" });
        continue;
      }

      // Time range: last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Count new ads per competitor
      const compStats = await Promise.all(
        competitors.map(async (c) => {
          const [{ count: newAds }, { count: totalActive }] = await Promise.all([
            admin
              .from("mait_ads_external")
              .select("id", { count: "exact", head: true })
              .eq("competitor_id", c.id)
              .gte("created_at", weekAgo),
            admin
              .from("mait_ads_external")
              .select("id", { count: "exact", head: true })
              .eq("competitor_id", c.id)
              .eq("status", "ACTIVE"),
          ]);
          return {
            name: c.page_name,
            newAds: newAds ?? 0,
            totalActive: totalActive ?? 0,
          };
        })
      );

      const totalNewAds = compStats.reduce((s, c) => s + c.newAds, 0);

      if (totalNewAds === 0) {
        results.push({ workspace: ws.name, sent: false, error: "no_new_ads" });
        continue;
      }

      // Get top recent ads for highlights
      const { data: topAds } = await admin
        .from("mait_ads_external")
        .select("headline, image_url, ad_archive_id, competitor_id")
        .eq("workspace_id", ws.id)
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false })
        .limit(5);

      const compMap = new Map(competitors.map((c) => [c.id, c.page_name]));

      const now = new Date();
      const weekAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weekRange = `${weekAgoDate.toLocaleDateString("it", { day: "numeric", month: "short" })} — ${now.toLocaleDateString("it", { day: "numeric", month: "short", year: "numeric" })}`;

      await sendWeeklyDigest(emails, {
        workspaceName: ws.name,
        weekRange,
        competitors: compStats.sort((a, b) => b.newAds - a.newAds),
        totalNewAds,
        topAds: (topAds ?? []).map((a) => ({
          competitorName: compMap.get(a.competitor_id) ?? "—",
          headline: a.headline,
          imageUrl: a.image_url,
          adLibraryUrl: `https://www.facebook.com/ads/library/?id=${a.ad_archive_id}`,
        })),
        dashboardUrl: `${appUrl}/dashboard`,
      });

      results.push({ workspace: ws.name, sent: true });
    } catch (e) {
      results.push({
        workspace: ws.name,
        sent: false,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
