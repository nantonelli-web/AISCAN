"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AdCard } from "@/components/ads/ad-card";
import { OrganicPostCard } from "@/components/organic/organic-post-card";
import { TagButton } from "@/components/ads/tag-button";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { Download } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { MaitAdExternal, MaitOrganicPost } from "@/types";

type Channel = "all" | "meta" | "google" | "instagram";

/* ─── Platform icons (small, inline) ─── */

function MetaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.93 3.78-3.93 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
    </svg>
  );
}

/* ─── Component ─── */

interface Props {
  competitorId: string;
  ads: MaitAdExternal[];
  organicPosts: MaitOrganicPost[];
  organicStats: {
    count: number;
    avgLikes: number;
    avgComments: number;
    totalViews: number;
  };
}

export function ChannelTabs({ competitorId, ads, organicPosts, organicStats }: Props) {
  const [channel, setChannel] = useState<Channel>("all");
  const { t } = useT();

  // Split ads by source
  const metaAds = ads.filter((a) => {
    const src = (a as unknown as Record<string, unknown>).source;
    return src !== "google";
  });
  const googleAds = ads.filter((a) => {
    const src = (a as unknown as Record<string, unknown>).source;
    return src === "google";
  });

  const tabs: { key: Channel; label: string; count: number; icon?: React.ReactNode }[] = [
    { key: "all", label: t("competitors", "channelAll"), count: ads.length + organicPosts.length },
    { key: "meta", label: "Meta Ads", count: metaAds.length, icon: <MetaIcon className="size-3.5" /> },
    { key: "google", label: "Google Ads", count: googleAds.length, icon: <GoogleIcon className="size-3.5" /> },
    { key: "instagram", label: "Instagram", count: organicPosts.length, icon: <InstagramIcon className="size-3.5" /> },
  ];

  // Filter out channels with 0 items (except "all")
  const visibleTabs = tabs.filter((tab) => tab.key === "all" || tab.count > 0);

  const showMeta = channel === "all" || channel === "meta";
  const showGoogle = channel === "all" || channel === "google";
  const showInstagram = channel === "all" || channel === "instagram";

  const visibleAds = channel === "meta" ? metaAds : channel === "google" ? googleAds : channel === "all" ? ads : [];
  const visibleOrganic = showInstagram ? organicPosts : [];

  return (
    <div className="space-y-6">
      {/* ─── Channel filter tabs ─── */}
      <div className="flex items-center gap-1 border-b border-border">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setChannel(tab.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px",
              "cursor-pointer",
              channel === tab.key
                ? "border-gold text-gold font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
            <span className={cn(
              "text-[10px] rounded-full px-1.5 py-0.5 min-w-[20px] text-center",
              channel === tab.key
                ? "bg-gold/20 text-gold"
                : "bg-muted text-muted-foreground"
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ─── Ads section (Meta + Google) ─── */}
      {(showMeta || showGoogle) && visibleAds.length > 0 && (
        <div className="space-y-4">
          {/* Header with count + AI Tag + Export */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {visibleAds.length} ads
            </p>
            <div className="flex items-center gap-3">
              <TagButton competitorId={competitorId} />
              <a
                href={`/api/export/ads.csv?competitor_id=${competitorId}`}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Download className="size-3" />
                {t("competitors", "exportCsv")}
              </a>
            </div>
          </div>

          {/* Grid */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleAds.map((ad) => (
              <AdCard key={ad.id} ad={ad} competitorId={competitorId} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state for ads tabs */}
      {(channel === "meta" || channel === "google") && visibleAds.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {channel === "meta" ? t("competitors", "noMetaAds") : t("competitors", "noGoogleAds")}
          </CardContent>
        </Card>
      )}

      {/* ─── Instagram section ─── */}
      {showInstagram && (
        <div className="space-y-4">
          {/* Engagement stats */}
          {organicStats.count > 0 && channel === "instagram" && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">{organicStats.count}</p>
                  <p className="text-xs text-muted-foreground">{t("organic", "totalPosts")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">{formatNumber(organicStats.avgLikes)}</p>
                  <p className="text-xs text-muted-foreground">{t("organic", "avgLikes")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">{formatNumber(organicStats.avgComments)}</p>
                  <p className="text-xs text-muted-foreground">{t("organic", "avgComments")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">{formatNumber(organicStats.totalViews)}</p>
                  <p className="text-xs text-muted-foreground">{t("organic", "totalViews")}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {visibleOrganic.length === 0 ? (
            channel === "instagram" && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  {t("organic", "noPostsYet")}
                </CardContent>
              </Card>
            )
          ) : (
            <>
              {channel === "instagram" && (
                <p className="text-sm text-muted-foreground">
                  {visibleOrganic.length} {t("organic", "postsCount")}
                </p>
              )}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleOrganic.map((post) => (
                  <OrganicPostCard key={post.id} post={post} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty state for "all" when nothing exists */}
      {channel === "all" && ads.length === 0 && organicPosts.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("competitors", "noAdsCollected")}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
