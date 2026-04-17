import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScanDropdown } from "./scan-dropdown";
import { FrequencySelector } from "./frequency-selector";
import { CollapsibleJobHistory } from "./collapsible-job-history";
import { ChannelTabs } from "./channel-tabs";
import { formatDate } from "@/lib/utils";
import { getLocale, serverT } from "@/lib/i18n/server";
import type { MaitAdExternal, MaitCompetitor, MaitOrganicPost, MaitScrapeJob } from "@/types";

export const dynamic = "force-dynamic";

export default async function CompetitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const { data: competitor } = await supabase
    .from("mait_competitors")
    .select("*")
    .eq("id", id)
    .single();

  if (!competitor) notFound();
  const c = competitor as MaitCompetitor;

  const [{ data: ads }, { data: jobs }, { data: organicPosts }] = await Promise.all([
    supabase
      .from("mait_ads_external")
      .select("*")
      .eq("competitor_id", id)
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(120),
    supabase
      .from("mait_scrape_jobs")
      .select("*")
      .eq("competitor_id", id)
      .order("started_at", { ascending: false })
      .limit(10),
    supabase
      .from("mait_organic_posts")
      .select("*")
      .eq("competitor_id", id)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(120),
  ]);

  const adsList = (ads ?? []) as MaitAdExternal[];
  const jobsList = (jobs ?? []) as MaitScrapeJob[];
  const organicList = (organicPosts ?? []) as MaitOrganicPost[];

  // Organic engagement stats
  const organicCount = organicList.length;
  const avgLikes = organicCount > 0
    ? Math.round(organicList.reduce((s, p) => s + (p.likes_count ?? 0), 0) / organicCount)
    : 0;
  const avgComments = organicCount > 0
    ? Math.round(organicList.reduce((s, p) => s + (p.comments_count ?? 0), 0) / organicCount)
    : 0;
  const totalViews = organicList.reduce((s, p) => s + (p.video_views ?? 0), 0);
  const frequency = ((c.monitor_config as { frequency?: string })?.frequency ??
    "manual") as "manual" | "daily" | "weekly";

  // Extract page-level info from the most recent ad's raw_data
  const latestRaw = adsList[0]?.raw_data as Record<string, unknown> | null;
  const latestSnapshot = latestRaw?.snapshot as Record<string, unknown> | null;
  const pageProfilePicture = (latestSnapshot?.pageProfilePictureUrl as string) ?? null;
  const pageLikeCount = (latestSnapshot?.pageLikeCount as number) ?? null;
  const pageCategories = (latestSnapshot?.pageCategories as string[]) ?? [];

  function formatCompactNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return String(n);
  }

  return (
    <div className="space-y-6">
      <Link
        href="/competitors"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("competitors", "allCompetitors")}
      </Link>

      {/* ─── Header ────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Row 1: Brand identity */}
        <div className="flex items-center gap-4">
          {pageProfilePicture && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pageProfilePicture}
              alt=""
              className="size-12 rounded-full object-cover border border-border shrink-0"
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-serif tracking-tight">{c.page_name}</h1>
              <Link
                href={`/competitors/${c.id}/edit`}
                className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Edit"
              >
                <Pencil className="size-3.5" />
              </Link>
            </div>
            {/* Quick info: industry + reach + markets */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {c.category && <Badge variant="muted">{c.category}</Badge>}
              {pageLikeCount != null && pageLikeCount > 0 && (
                <Badge variant="gold">
                  {formatCompactNumber(pageLikeCount)} {t("competitors", "likes")}
                </Badge>
              )}
              {c.country && (
                <span className="text-xs text-muted-foreground">{c.country}</span>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Meta info — subtle, secondary */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <a
            href={c.page_url}
            target="_blank"
            rel="noreferrer"
            className="text-gold/70 hover:text-gold hover:underline truncate max-w-xs"
          >
            {c.page_url.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
          <span className="text-border">·</span>
          <span>{t("competitors", "lastScan")} {formatDate(c.last_scraped_at)}</span>
          <span className="text-border">·</span>
          <FrequencySelector competitorId={c.id} initial={frequency} />
        </div>
      </div>

      {/* ─── Scan actions: always visible, prominent ─────────── */}
      <ScanDropdown
        competitorId={c.id}
        hasGoogleConfig={!!(c.google_advertiser_id || c.google_domain)}
      />

      {/* ─── Scan history (collapsible) ──────────────────────── */}
      {jobsList.length > 0 && <CollapsibleJobHistory jobs={jobsList} />}

      {/* ─── Channel tabs: Meta Ads / Google Ads / Instagram ── */}
      <ChannelTabs
        competitorId={c.id}
        ads={adsList}
        organicPosts={organicList}
        organicStats={{
          count: organicCount,
          avgLikes,
          avgComments,
          totalViews,
        }}
      />
    </div>
  );
}
