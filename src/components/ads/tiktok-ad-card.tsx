"use client";

import { ExternalLink, Play, Eye, Heart, ImageIcon, Globe2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TikTokIcon } from "@/components/ui/tiktok-icon";
import { formatDate, formatNumber, cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { MaitTiktokAd } from "@/types/tiktok-ads";

/**
 * TikTok Ad card — renders both DSA library and Creative Center
 * shapes from the same component. The two sources expose different
 * fields (impressions ranges + targeting on DSA; CTR + likes +
 * budget level on CC), so we type-narrow on `source` and pull the
 * relevant block from each.
 *
 * Channel-rail accent and basic hover treatment come from
 * `globals.css` (.channel-rail[data-channel="tiktok"]) so the card
 * sits visually next to the existing TikTokPostCard from the
 * organic side without retraining the eye.
 */
export function TiktokAdCard({ ad }: { ad: MaitTiktokAd }) {
  const { t } = useT();
  const isLibrary = ad.source === "library";
  const cover = ad.video_cover_url;
  const playable = !!ad.video_url;

  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden flex flex-col hover:border-gold/40 hover:shadow-md transition-all channel-rail"
      data-channel="tiktok"
    >
      {/* Preview area — TikTok video covers are 9:16 portrait so the
          aspect-[4/5] keeps the proportions while fitting the grid. */}
      <div className="aspect-[4/5] bg-muted relative overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={ad.ad_title ?? ad.advertiser_name ?? "TikTok ad"}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="size-10" />
          </div>
        )}

        {/* Play overlay */}
        {playable && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/60 rounded-full p-2.5 backdrop-blur-sm">
              <Play
                className="size-5 text-white"
                strokeWidth={2.5}
                fill="currentColor"
              />
            </div>
          </div>
        )}

        {/* Source pill — DSA vs Creative Center */}
        <div className="absolute top-2 left-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white",
              isLibrary ? "bg-info/80" : "bg-gold/80",
            )}
          >
            <TikTokIcon className="size-3" />
            {isLibrary ? "DSA" : "CC"}
          </span>
        </div>

        {/* Format pill (CC only — DSA doesn't expose it) */}
        {!isLibrary && ad.ad_format && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white uppercase">
              {ad.ad_format.replace(/_/g, " ").replace(/ads/i, "")}
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        {/* Advertiser / brand line */}
        {ad.advertiser_name && (
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] uppercase tracking-widest text-gold truncate">
              {ad.advertiser_name}
            </p>
          </div>
        )}

        {/* Title (CC) or paid-by (DSA) */}
        {ad.ad_title && (
          <p className="font-semibold text-sm line-clamp-2 leading-snug">
            {ad.ad_title}
          </p>
        )}
        {isLibrary && ad.paid_by && ad.paid_by !== ad.advertiser_name && (
          <p className="text-xs text-muted-foreground leading-snug">
            <span className="text-foreground/60">Paid by:</span> {ad.paid_by}
          </p>
        )}

        {/* CC: ad text + CTA */}
        {!isLibrary && ad.ad_text && (
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {ad.ad_text}
          </p>
        )}

        {/* Source-specific stats row */}
        {isLibrary ? (
          <LibraryStats ad={ad} />
        ) : (
          <CcStats ad={ad} t={t} />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border mt-auto">
          {isLibrary ? (
            <span>
              {ad.first_shown_date ? formatDate(ad.first_shown_date) : "—"}
              {ad.days_running != null && ad.days_running > 0 && (
                <> · {ad.days_running}gg</>
              )}
            </span>
          ) : (
            <span>
              {ad.country ?? "—"}
              {ad.video_duration != null && (
                <> · {ad.video_duration}s</>
              )}
            </span>
          )}
          {ad.video_url && (
            <a
              href={ad.video_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-gold flex items-center gap-1"
            >
              video <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryStats({ ad }: { ad: import("@/types/tiktok-ads").MaitTiktokAdLibrary }) {
  const hasImpr = ad.impressions_lower != null || ad.impressions_upper != null;
  const hasReach = ad.reach_lower != null || ad.reach_upper != null;
  if (!hasImpr && !hasReach) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
      {hasImpr && (
        <span className="flex items-center gap-1">
          <Eye className="size-3" />
          {formatNumber(ad.impressions_lower ?? 0)}
          {ad.impressions_upper && ad.impressions_upper !== ad.impressions_lower
            ? `–${formatNumber(ad.impressions_upper)}`
            : ""}
        </span>
      )}
      {hasReach && (
        <span className="flex items-center gap-1">
          <Globe2 className="size-3" />
          {formatNumber(ad.reach_lower ?? 0)}
          {ad.reach_upper && ad.reach_upper !== ad.reach_lower
            ? `–${formatNumber(ad.reach_upper)}`
            : ""}
        </span>
      )}
    </div>
  );
}

function CcStats({
  ad,
  t,
}: {
  ad: import("@/types/tiktok-ads").MaitTiktokAdCc;
  t: (s: string, k: string) => string;
}) {
  if (ad.likes == null && ad.ctr == null) return null;
  const ctrPct = ad.ctr != null ? `${(ad.ctr * 100).toFixed(2)}%` : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
      {ad.likes != null && (
        <span className="flex items-center gap-1">
          <Heart className="size-3" /> {formatNumber(ad.likes)}
        </span>
      )}
      {ctrPct && (
        <span className="flex items-center gap-1">
          CTR {ctrPct}
        </span>
      )}
      {ad.industry && (
        <Badge variant="muted" className="text-[10px]">
          {ad.industry.replace(/_/g, " ")}
        </Badge>
      )}
      {ad.campaign_objective && (
        <Badge variant="outline" className="text-[10px]">
          {ad.campaign_objective.replace(/_/g, " ")}
        </Badge>
      )}
      {ad.budget_level && (
        <span className="text-[10px]">
          {t("tiktokAds", "budget")}: {ad.budget_level}
        </span>
      )}
    </div>
  );
}
