import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(2).max(3),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const admin = createAdminClient();

  const results = await Promise.all(
    parsed.data.ids.map(async (id) => {
      const [{ data: comp }, { data: ads }] = await Promise.all([
        admin
          .from("mait_competitors")
          .select("id, page_name")
          .eq("id", id)
          .single(),
        admin
          .from("mait_ads_external")
          .select(
            "ad_archive_id, headline, ad_text, cta, image_url, video_url, platforms, status, start_date, end_date, created_at"
          )
          .eq("competitor_id", id)
          .limit(500),
      ]);

      type AdRow = {
        ad_archive_id: string;
        headline: string | null;
        ad_text: string | null;
        cta: string | null;
        image_url: string | null;
        video_url: string | null;
        platforms: string[] | null;
        status: string | null;
        start_date: string | null;
        end_date: string | null;
        created_at: string;
      };

      const adsList = (ads ?? []) as AdRow[];
      const active = adsList.filter((a) => a.status === "ACTIVE");
      const imageCount = adsList.filter(
        (a) => a.image_url && !a.video_url
      ).length;
      const videoCount = adsList.filter((a) => a.video_url).length;

      // CTA counts
      const ctaMap = new Map<string, number>();
      for (const a of adsList) {
        if (a.cta) ctaMap.set(a.cta, (ctaMap.get(a.cta) ?? 0) + 1);
      }
      const topCtas = [...ctaMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // Platforms
      const platMap = new Map<string, number>();
      for (const a of adsList) {
        for (const p of a.platforms ?? []) {
          platMap.set(p, (platMap.get(p) ?? 0) + 1);
        }
      }
      const platforms = [...platMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

      // Duration
      const durations: number[] = [];
      for (const a of adsList) {
        if (!a.start_date) continue;
        const start = new Date(a.start_date).getTime();
        const end = a.end_date
          ? new Date(a.end_date).getTime()
          : Date.now();
        durations.push(Math.max(1, Math.round((end - start) / 86_400_000)));
      }
      const avgDuration =
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0;

      // Copy length
      const lengths = adsList
        .map((a) => (a.ad_text ?? "").length)
        .filter((l) => l > 0);
      const avgCopyLength =
        lengths.length > 0
          ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
          : 0;

      // Refresh rate (90 days)
      const ninetyAgo = Date.now() - 90 * 86_400_000;
      const recent = adsList.filter(
        (a) => new Date(a.created_at).getTime() > ninetyAgo
      ).length;
      const adsPerWeek = Math.round((recent / (90 / 7)) * 10) / 10;

      // Latest ads
      const latestAds = adsList
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        .slice(0, 5)
        .map((a) => ({
          headline: a.headline,
          image_url: a.image_url,
          ad_archive_id: a.ad_archive_id,
        }));

      return {
        id,
        name: comp?.page_name ?? "—",
        totalAds: adsList.length,
        activeAds: active.length,
        imageCount,
        videoCount,
        topCtas,
        platforms,
        avgDuration,
        avgCopyLength,
        adsPerWeek,
        latestAds,
      };
    })
  );

  return NextResponse.json(results);
}
