"use client";

import { useState } from "react";
import { ExternalLink, Eye, ImageIcon, Globe2 } from "lucide-react";
import { SnapchatIcon } from "@/components/ui/snapchat-icon";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber, cn } from "@/lib/utils";
import type { MaitSnapchatAd } from "@/types/snapchat-ads";

/**
 * Snapchat Ad card — renders one row from `mait_snapchat_ads`.
 *
 * Snap's Ads Library API exposes creative either as a single
 * `top_snap_media` (rendered as a static placeholder for now —
 * Snap doesn't surface a direct media URL on the search endpoint)
 * or as a Dynamic Product Ad with `dpa_preview.items[]` carrying
 * multiple product images. When DPA images are present we show the
 * first one; otherwise the card falls back to an icon tile.
 *
 * Stat row: impressions_total + top-3 country breakdown from
 * impressions_map. Targeting badges (min_age, language) come off
 * targeting_v2.demographics[] when present.
 */
export function SnapchatAdCard({ ad }: { ad: MaitSnapchatAd }) {
  const heroImage = pickHeroImage(ad);
  const topCountries = pickTopCountries(ad.impressions_map, 3);
  const minAge = pickMinAge(ad.targeting_v2);
  const targetLangs = pickLanguages(ad.targeting_v2);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col hover:border-gold/40 hover:shadow-md transition-all">
      {/* Snap Ads on the gallery are 9:16 portrait; aspect-[4/5]
          keeps the proportions readable at grid widths. */}
      <div className="aspect-[4/5] bg-muted relative overflow-hidden">
        {heroImage ? (
          <SafeImage
            src={heroImage}
            alt={ad.headline ?? ad.profile_name ?? "Snapchat ad"}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="size-10" />
          </div>
        )}
        {/* Channel pill */}
        <div className="absolute top-2 left-2 pointer-events-none">
          <span className="inline-flex items-center gap-1 rounded backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-black bg-yellow-300/90">
            <SnapchatIcon className="size-3" />
            Snap
          </span>
        </div>
        {/* Status pill */}
        {ad.status && (
          <div className="absolute top-2 right-2 pointer-events-none">
            <span
              className={cn(
                "inline-flex items-center rounded backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium uppercase",
                ad.status === "ACTIVE"
                  ? "bg-success/80 text-white"
                  : "bg-black/70 text-white",
              )}
            >
              {ad.status}
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col gap-2">
        {/* Advertiser line */}
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] uppercase tracking-widest text-gold truncate">
            {ad.profile_name ?? ad.paying_advertiser_name}
          </p>
        </div>

        {/* Headline */}
        {ad.headline && (
          <p className="font-semibold text-sm line-clamp-2 leading-snug">
            {ad.headline}
          </p>
        )}

        {/* Paying advertiser disclosure (DSA requirement) */}
        {ad.paying_advertiser_name &&
          ad.paying_advertiser_name !== ad.profile_name && (
            <p className="text-xs text-muted-foreground leading-snug">
              <span className="text-foreground/60">Paid by:</span>{" "}
              {ad.paying_advertiser_name}
            </p>
          )}

        {/* CTA + render-type */}
        <div className="flex flex-wrap gap-1.5">
          {ad.call_to_action && (
            <Badge variant="muted" className="text-[10px] uppercase">
              {ad.call_to_action.replace(/_/g, " ")}
            </Badge>
          )}
          {ad.ad_render_type && (
            <Badge variant="outline" className="text-[10px] uppercase">
              {ad.ad_render_type}
            </Badge>
          )}
        </div>

        {/* Stat row — impressions + country breakdown */}
        {(ad.impressions_total > 0 || topCountries.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
            {ad.impressions_total > 0 && (
              <span className="flex items-center gap-1">
                <Eye className="size-3" />
                {formatNumber(ad.impressions_total)}
              </span>
            )}
            {topCountries.length > 0 && (
              <span className="flex items-center gap-1">
                <Globe2 className="size-3" />
                {topCountries
                  .map((c) => `${c.code.toUpperCase()} ${formatNumber(c.value)}`)
                  .join(" · ")}
              </span>
            )}
          </div>
        )}

        {/* Targeting row (DSA-grade) */}
        {(minAge || targetLangs.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {minAge && (
              <Badge variant="outline" className="text-[10px]">
                {minAge}+
              </Badge>
            )}
            {targetLangs.slice(0, 3).map((l) => (
              <Badge key={l} variant="outline" className="text-[10px] uppercase">
                {l}
              </Badge>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border mt-auto">
          <span>
            {ad.start_date ? formatDate(ad.start_date) : "—"}
            {ad.end_date && <> → {formatDate(ad.end_date)}</>}
          </span>
          <a
            href={`https://adsgallery.snap.com/?id=${encodeURIComponent(ad.ad_id)}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-gold flex items-center gap-1"
          >
            gallery <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────────── */

function pickHeroImage(ad: MaitSnapchatAd): string | null {
  // Prefer the first DPA item's main image. Snap's signed CDN URLs
  // expire after a few hours; the card silently falls back to the
  // icon tile when an <img> fails to load.
  const dpa = ad.dpa_preview as
    | { items?: Array<{ main_image?: { image_links?: string[] } }> }
    | null;
  const first = dpa?.items?.[0]?.main_image?.image_links?.[0];
  if (first) return first;
  return ad.profile_logo_url;
}

function pickTopCountries(
  map: Record<string, number> | null,
  n: number,
): Array<{ code: string; value: number }> {
  if (!map) return [];
  return Object.entries(map)
    .map(([code, value]) => ({ code, value }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

function pickMinAge(targeting: Record<string, unknown> | null): string | null {
  if (!targeting) return null;
  const demos = targeting.demographics;
  if (!Array.isArray(demos) || demos.length === 0) return null;
  const first = demos[0] as { min_age?: string };
  return first?.min_age ?? null;
}

function pickLanguages(targeting: Record<string, unknown> | null): string[] {
  if (!targeting) return [];
  const demos = targeting.demographics;
  if (!Array.isArray(demos)) return [];
  const langs = new Set<string>();
  for (const d of demos) {
    const arr = (d as { languages?: unknown[] }).languages;
    if (Array.isArray(arr)) {
      for (const l of arr) if (typeof l === "string") langs.add(l);
    }
  }
  return [...langs];
}

function SafeImage({ src, alt }: { src: string; alt: string }) {
  // Snap CDN URLs are signed with short TTLs; render as a stateful
  // fallback so an expired image doesn't leave a broken-image glyph.
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
        <ImageIcon className="size-10" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="absolute inset-0 w-full h-full object-cover"
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}
