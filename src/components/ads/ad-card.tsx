"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Eye, Sparkles, Play, ImageIcon, LayoutGrid, Bot, Type, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SaveToCollection } from "@/components/ads/save-to-collection";
import { VideoPreview } from "@/components/ads/video-preview";
import { VideoUnavailable } from "@/components/ui/video-unavailable";
import { formatDate, isPlayableVideoUrl, youtubeIdFromUrl } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { AI_TAGS_ENABLED } from "@/config/features";
import type { MaitAdExternal } from "@/types";

/** Strip JSON artifacts from ad text (e.g. {"text": "..."}) */
function cleanAdText(text: string | null): string | null {
  if (!text) return null;
  // Try to extract text from JSON-like wrappers
  const jsonMatch = text.match(/^\s*\{\s*"text"\s*:\s*"(.+)"\s*\}\s*$/);
  if (jsonMatch) return jsonMatch[1];
  // Remove stray JSON braces/quotes at start/end
  return text.replace(/^\s*\{\s*"text"\s*:\s*/, "").replace(/\s*\}\s*$/, "").replace(/^"|"$/g, "");
}

export function AdCard({
  ad,
  competitorId,
}: {
  ad: MaitAdExternal;
  competitorId?: string;
}) {
  const { t } = useT();
  const [imgFailed, setImgFailed] = useState(false);
  const [profileImgFailed, setProfileImgFailed] = useState(false);

  const aiTags = (ad.raw_data as Record<string, unknown> | null)?.ai_tags as
    | { sector?: string; tone?: string; objective?: string }
    | undefined;

  const raw = ad.raw_data as Record<string, unknown> | null;
  const source = (ad as unknown as Record<string, unknown>).source as string | undefined;
  const isGoogle = source === "google";
  const snapshot = raw?.snapshot as Record<string, unknown> | null;

  // Ad library URL — Meta vs Google. On Google, silva exposes a
  // creative-specific link in `raw.adLibraryUrl` that lands directly
  // on the single ad. Prefer it over the advertiser-page URL (which
  // shows the full ad list and forces the user to hunt the specific
  // creative). Fall back to the advertiser page on legacy rows that
  // do not carry adLibraryUrl.
  const adLibraryUrl = isGoogle
    ? ((raw?.adLibraryUrl as string | undefined) ??
        (raw?.advertiserId
          ? `https://adstransparency.google.com/advertiser/${raw.advertiserId}`
          : null))
    : (raw?.adLibraryURL as string) ??
      (ad.ad_archive_id
        ? `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}`
        : null);

  const pageName = isGoogle
    ? (raw?.advertiserName as string) ?? null
    : (raw?.pageName as string) ?? null;

  // Image URL — prefer saved image_url (may be permanent Supabase URL),
  // fall back to adSnapshotUrl only if image_url is missing.
  // Skip JS-based Google preview URLs.
  const rawImageUrl = ad.image_url;
  const isJsPreview = rawImageUrl?.includes("/ads/preview/content.js");
  const snapshotUrl = isJsPreview
    ? null
    : isGoogle
      ? rawImageUrl
      : rawImageUrl ?? (raw?.adSnapshotUrl as string) ?? null;
  const isSnapshotHtml = snapshotUrl?.includes("/render_ad/");

  const detailHref =
    competitorId ?? ad.competitor_id
      ? `/brands/${competitorId ?? ad.competitor_id}/ads/${ad.id}`
      : null;

  // Extract displayFormat — Meta uses snapshot.displayFormat. On
  // Google we now read in priority order silva `raw.format` →
  // memo23/legacy `raw.adFormat`. silva-scraped rows would otherwise
  // fall through to the "IMAGE" default and every Google video ad
  // would be mislabelled — confirmed bug on Elena Mirò 2026-04-30.
  const displayFormat = isGoogle
    ? ((raw?.format as string) ??
        (raw?.adFormat as string) ??
        null)
    : (snapshot?.displayFormat as string) ?? null;
  const isAiGenerated = (raw?.containsDigitalCreatedMedia as boolean) ?? false;
  const pageProfilePicture = (snapshot?.pageProfilePictureUrl as string) ?? null;

  // Determine the format badge label and icon
  const googleFormat = isGoogle ? (displayFormat ?? "").toLowerCase() : "";
  const formatLabel = isGoogle
    ? (googleFormat.includes("video") ? "VIDEO"
      : googleFormat.includes("text") ? "TEXT"
      : googleFormat.includes("shopping") ? "SHOPPING"
      : "IMAGE")
    : displayFormat === "DPA" || displayFormat === "DCO"
      ? "CAROUSEL"
      : displayFormat === "VIDEO"
        ? "VIDEO"
        : displayFormat === "IMAGE"
          ? "IMAGE"
          : displayFormat === "CAROUSEL"
            ? "CAROUSEL"
            : ad.video_url
              ? "VIDEO"
              : "IMAGE";
  const isCarousel = formatLabel === "CAROUSEL";
  const isVideo = formatLabel === "VIDEO";
  // YouTube watch URLs cannot be rendered by the HTML <video> element
  // — the previous behaviour was an empty black tile on every silva
  // YouTube ad. When we detect one, we substitute the official YouTube
  // hqdefault thumbnail and let the click-through go to the detail
  // page (or YouTube directly if there is no detail link).
  const ytId = ad.video_url ? youtubeIdFromUrl(ad.video_url) : null;
  const ytThumb = ytId
    ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`
    : null;
  const hasPlayableVideo = isPlayableVideoUrl(ad.video_url);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col hover:border-gold/40 hover:shadow-md transition-all">
      {/* Preview area — for Google ads we use object-contain on a
          white backdrop because the creatives are flat designs with
          embedded text ("Lino da indossare", brand logos, etc.).
          object-cover on a 4:3 box was zooming/cropping the image so
          the text became unreadable. Meta creatives are photo-style
          so cover still looks right there. */}
      <MaybeLink
        href={detailHref}
        className={
          isGoogle
            ? "aspect-[4/3] bg-white relative overflow-hidden block cursor-pointer"
            : "aspect-[4/3] bg-muted relative overflow-hidden block cursor-pointer"
        }
      >
        {hasPlayableVideo && ad.video_url ? (
          <VideoPreview
            src={ad.video_url}
            poster={snapshotUrl && !isSnapshotHtml ? snapshotUrl : undefined}
          />
        ) : ytThumb && !imgFailed ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ytThumb}
              alt={ad.headline ?? "YouTube preview"}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              // YouTube can 404 the thumbnail when the underlying
              // video has been deleted or made private after the
              // scan — fall through to the placeholder branch
              // below instead of leaving a broken-image glyph.
              onError={() => setImgFailed(true)}
            />
            {/* Centred play badge so the user reads it as a video, not
                a static product photo. Pointer-events-none so the
                surrounding MaybeLink keeps capturing the click. */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/60 rounded-full p-2.5 backdrop-blur-sm">
                <Play
                  className="size-5 text-white"
                  strokeWidth={2.5}
                  fill="currentColor"
                />
              </div>
            </div>
          </>
        ) : snapshotUrl && !isSnapshotHtml && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={snapshotUrl}
            alt={ad.headline ?? "ad creative"}
            className={
              isGoogle
                ? "absolute inset-0 w-full h-full object-contain"
                : "absolute inset-0 w-full h-full object-cover"
            }
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : isGoogle && (ad.headline || ad.ad_text) ? (
          // Google ad with NO usable image but structured copy is
          // present — silva sometimes captures headline / body even
          // when imageUrl is null (typical on Shopping + some Video
          // creatives). Rendering them inline matches the Meta text
          // preview branch and turns "empty placeholder" rows into
          // readable cards.
          <div className="absolute inset-0 p-4 flex flex-col justify-between bg-white">
            <div className="space-y-2">
              {ad.headline && (
                <p className="font-semibold text-sm line-clamp-2 text-blue-700">
                  {ad.headline}
                </p>
              )}
              {ad.ad_text && (
                <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">
                  {cleanAdText(ad.ad_text)}
                </p>
              )}
            </div>
            {adLibraryUrl && (
              <a
                href={adLibraryUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[10px] text-gold hover:underline mt-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <Eye className="size-3" /> {t("adCard", "viewOnGoogle")}
              </a>
            )}
          </div>
        ) : isGoogle && formatLabel === "VIDEO" ? (
          // Google VIDEO ad with neither a playable URL nor a
          // poster image. Use the dedicated "video not delivered"
          // placeholder (crossed-out play + explanation) instead
          // of the generic icon-only box that the user flagged
          // as looking like a UI malfunction.
          <>
            <VideoUnavailable />
            {adLibraryUrl && (
              <a
                href={adLibraryUrl}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[10px] text-gold bg-background/90 backdrop-blur-sm rounded px-1.5 py-0.5 hover:bg-background"
                onClick={(e) => e.stopPropagation()}
              >
                <Eye className="size-3" /> {t("adCard", "viewOnGoogle")}
              </a>
            )}
          </>
        ) : isGoogle ? (
          // Google IMAGE/TEXT ad without preview — keep the
          // existing iconographic placeholder. Only VIDEO gets
          // the dedicated unavailable block above; image/text
          // missing previews legitimately read as "this format
          // doesn't have a visual" rather than a delivery gap.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/50 p-4">
            <div className="size-10 rounded-full bg-muted grid place-items-center">
              {formatLabel === "TEXT" ? (
                <Type className="size-5 text-muted-foreground" />
              ) : (
                <ImageIcon className="size-5 text-muted-foreground" />
              )}
            </div>
            {pageName && !competitorId && (
              <p className="text-xs font-medium text-foreground text-center truncate max-w-full">
                {pageName}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">{formatLabel} ad</p>
            {adLibraryUrl && (
              <a
                href={adLibraryUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-gold hover:underline"
              >
                <Eye className="size-3" /> {t("adCard", "viewOnGoogle")}
              </a>
            )}
          </div>
        ) : isVideo ? (
          // Meta VIDEO ad with neither playable URL nor snapshot
          // image. Same source-side gap as the Google branch above
          // — use the explicit "video not delivered" placeholder so
          // the user knows it's a data-source issue, not a UI bug.
          <>
            <VideoUnavailable />
            {adLibraryUrl && (
              <a
                href={adLibraryUrl}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[10px] text-gold bg-background/90 backdrop-blur-sm rounded px-1.5 py-0.5 hover:bg-background"
                onClick={(e) => e.stopPropagation()}
              >
                <Eye className="size-3" /> {t("adCard", "viewOnMeta")}
              </a>
            )}
          </>
        ) : (
          // Meta text preview (when no direct image available)
          <div className="absolute inset-0 p-4 flex flex-col justify-between">
            <div className="space-y-2">
              {pageName && (
                <div className="flex items-center gap-1.5">
                  {pageProfilePicture && !profileImgFailed && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pageProfilePicture}
                      alt=""
                      className="size-4 rounded-full object-cover shrink-0"
                      onError={() => setProfileImgFailed(true)}
                    />
                  )}
                  <p className="text-[10px] uppercase tracking-widest text-gold truncate">
                    {pageName}
                  </p>
                </div>
              )}
              {ad.headline && (
                <p className="font-semibold text-sm line-clamp-2">
                  {ad.headline}
                </p>
              )}
              {ad.ad_text && (
                <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">
                  {ad.ad_text}
                </p>
              )}
            </div>
            {adLibraryUrl && (
              <a
                href={adLibraryUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[10px] text-gold hover:underline mt-auto"
              >
                <Eye className="size-3" /> {t("adCard", "viewOnMeta")}
              </a>
            )}
          </div>
        )}
        <div className="absolute top-2 left-2">
          <SaveToCollection adId={ad.id} />
        </div>
        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          <span className="inline-flex items-center gap-1 rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white">
            {formatLabel === "CAROUSEL" ? (
              <LayoutGrid className="size-3" />
            ) : formatLabel === "VIDEO" ? (
              <Play className="size-3" />
            ) : formatLabel === "TEXT" ? (
              <Type className="size-3" />
            ) : formatLabel === "SHOPPING" ? (
              <ShoppingBag className="size-3" />
            ) : (
              <ImageIcon className="size-3" />
            )}
            {formatLabel}
          </span>
          {isAiGenerated && (
            <span className="inline-flex items-center gap-1 rounded bg-purple-600/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-white">
              <Bot className="size-3" /> AI
            </span>
          )}
        </div>
      </MaybeLink>

      {/* Details */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Headline + status pill */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {ad.headline && (
              <p className="font-semibold leading-snug line-clamp-2 text-sm text-foreground">
                {cleanAdText(ad.headline)}
              </p>
            )}
          </div>
          {ad.status === "ACTIVE" && (
            <span className="status-pill is-active shrink-0">
              {t("adCard", "active")}
            </span>
          )}
        </div>

        {/* Body copy */}
        {ad.ad_text && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {cleanAdText(ad.ad_text)}
          </p>
        )}
        {AI_TAGS_ENABLED && aiTags && (
          <div className="flex items-center gap-1 flex-wrap">
            <Sparkles className="size-3 text-gold shrink-0" />
            {aiTags.sector && <Badge variant="gold">{aiTags.sector}</Badge>}
            {aiTags.tone && <Badge variant="outline">{aiTags.tone}</Badge>}
            {aiTags.objective && (
              <Badge variant="outline">{aiTags.objective}</Badge>
            )}
          </div>
        )}
        {(ad.cta || (ad.platforms && ad.platforms.length > 0)) && (
          <div className="pt-3 border-t border-border">
            {ad.cta && (
              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-bold shrink-0 w-14">
                  CTA
                </span>
                <span className="text-xs font-medium text-gold bg-gold/15 border border-gold/30 rounded px-2 py-0.5">
                  {ad.cta}
                </span>
              </div>
            )}
            {/* Inner divider only when BOTH rows are present, so the
                CTA and ON sections read as two distinct sub-blocks
                inside the metadata zone. my-3 gives 12px top+bottom
                breathing room so the line never feels cramped. */}
            {ad.cta && ad.platforms && ad.platforms.length > 0 && (
              <div className="my-3 border-t border-border/40" />
            )}
            {ad.platforms && ad.platforms.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-bold shrink-0 w-14 mt-0.5">
                  {t("adCard", "onPlatforms")}
                </span>
                <div className="flex flex-wrap gap-1">
                  {ad.platforms.map((p) => (
                    <span
                      key={p}
                      className="text-[10px] text-foreground bg-muted rounded px-1.5 py-0.5 capitalize"
                    >
                      {p.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Footer: start_date + outbound links */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-3 border-t border-border mt-auto">
          <span>{formatDate(ad.start_date)}</span>
          <div className="flex items-center gap-3">
            {ad.landing_url && (
              <a
                href={ad.landing_url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-gold flex items-center gap-1"
              >
                landing <ExternalLink className="size-3" />
              </a>
            )}
            {adLibraryUrl && (
              <a
                href={adLibraryUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-gold flex items-center gap-1"
              >
                ad library <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MaybeLink({
  href,
  children,
  className,
}: {
  href: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return <div className={className}>{children}</div>;
}
