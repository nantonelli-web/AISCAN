import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inferObjective } from "@/lib/analytics/objective-inference";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(2).max(3),
  /** Optional ISO dates. When supplied, the refresh-rate window
   *  matches dateFrom→dateTo instead of the legacy fixed 90d. */
  date_from: z.string().optional(),
  date_to: z.string().optional(),
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

  // Window for the refresh-rate metric. When the caller passes
  // date_from/date_to we honour it; otherwise default to a rolling 90d
  // ending today so the legacy contract is preserved.
  const windowToMs = parsed.data.date_to
    ? new Date(parsed.data.date_to + "T23:59:59Z").getTime()
    : Date.now();
  const windowFromMs = parsed.data.date_from
    ? new Date(parsed.data.date_from).getTime()
    : windowToMs - 90 * 86_400_000;
  const windowDays = Math.max(
    1,
    Math.round((windowToMs - windowFromMs) / 86_400_000),
  );
  const windowWeeks = windowDays / 7;

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
            "ad_archive_id, headline, ad_text, cta, image_url, video_url, platforms, status, start_date, end_date, created_at, raw_data"
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
        raw_data: Record<string, unknown> | null;
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

      // Refresh rate over the caller-supplied window (or default 90d).
      // Uses start_date — created_at would inflate the rate after a
      // bulk back-fill scan because every row lands at insert time.
      const recent = adsList.filter((a) => {
        if (!a.start_date) return false;
        const t = new Date(a.start_date).getTime();
        return Number.isFinite(t) && t >= windowFromMs && t <= windowToMs;
      }).length;
      const adsPerWeek = Math.round((recent / windowWeeks) * 10) / 10;

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

      // Infer campaign objective
      const objectiveInference = inferObjective(
        adsList.map((a) => a.raw_data)
      );

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
        objectiveInference,
      };
    })
  );

  return NextResponse.json({ results, refreshRateWindowDays: windowDays });
}
