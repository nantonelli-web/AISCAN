import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Calendar, Clock, Globe, Tag, Bot, Zap, LayoutGrid, MapPin, Users, UsersRound, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatNumber, isPlayableVideoUrl, youtubeIdFromUrl } from "@/lib/utils";
import { getLocale, serverT } from "@/lib/i18n/server";
import { extractAdInsights } from "@/lib/meta/ad-insights";
import { computeAdDurationDays } from "@/lib/analytics/ad-shared";
import { AI_TAGS_ENABLED } from "@/config/features";
import type { MaitAdExternal } from "@/types";

export const dynamic = "force-dynamic";

export default async function AdDetailPage({
  params,
}: {
  params: Promise<{ id: string; adId: string }>;
}) {
  const { id: competitorId, adId } = await params;
  await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const { data } = await supabase
    .from("mait_ads_external")
    .select("*")
    .eq("id", adId)
    .single();

  if (!data) notFound();
  const ad = data as MaitAdExternal;

  const raw = ad.raw_data as Record<string, unknown> | null;
  const snapshot = raw?.snapshot as Record<string, unknown> | null;
  const cards = (snapshot?.cards ?? []) as Array<{
    title?: string;
    body?: string;
    originalImageUrl?: string;
    resizedImageUrl?: string;
    videoHdUrl?: string;
    videoSdUrl?: string;
    linkUrl?: string;
    ctaText?: string;
  }>;
  const aiTags = raw?.ai_tags as Record<string, string> | null;
  const isGoogle = ad.source === "google";
  const pageName = isGoogle
    ? (raw?.advertiserName as string) ?? null
    : (raw?.pageName as string) ?? (snapshot?.pageName as string) ?? null;

  // External ad-library link — Meta vs Google. silva returns a
  // creative-specific URL on `raw.adLibraryUrl`
  // (`/advertiser/{AID}/creative/{CID}`) which lands directly on
  // the single ad we are inspecting. The previous code ignored it
  // and constructed a URL pointing at the advertiser page, which
  // listed ALL the brand ads and made it impossible to find the
  // specific creative. Prefer the creative-level URL when present
  // (silva), fall back to the advertiser-level URL otherwise
  // (legacy automation-lab rows).
  const adLibraryUrl: string | null = isGoogle
    ? (raw?.adLibraryUrl as string | undefined) ??
        (raw?.advertiserId
          ? `https://adstransparency.google.com/advertiser/${raw.advertiserId}`
          : null)
    : (raw?.adLibraryURL as string) ??
      `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}`;
  const adLibraryLabel = isGoogle
    ? "Google Ads Transparency"
    : "Meta Ad Library";

  // New metadata from raw_data. displayFormat is read in priority
  // order: Meta `snapshot.displayFormat` first, then silva/memo23
  // `raw.format`, then legacy automation-lab `raw.adFormat`. So a
  // Google ad gets a real "TEXT/IMAGE/VIDEO/SHOPPING" badge in the
  // metadata card instead of an empty row.
  const displayFormat =
    (snapshot?.displayFormat as string) ??
    (raw?.format as string) ??
    (raw?.adFormat as string) ??
    null;
  const ctaType = (snapshot?.ctaType as string) ?? (cards[0]?.ctaText as string) ?? null;
  const isAiGenerated = (raw?.containsDigitalCreatedMedia as boolean) ?? false;
  const isAaaEligible = (raw?.isAaaEligible as boolean) ?? false;
  const isReshared = (snapshot?.isReshared as boolean) ?? false;
  const collationCount = (raw?.collationCount as number) ?? null;
  // Countries we explicitly scanned this ad in. raw_data.
  // targetedOrReachedCountries used to source this but Meta never
  // populates it; scan_countries is the set of ISO codes we passed
  // Apify, so it is the only signal we have.
  const targetedCountries = ad.scan_countries ?? [];

  // ─── Silva-only Google enrichment ───
  // Read once and reuse so the JSX stays clean. All three are
  // null/empty when the row is Meta or pre-silva legacy Google.
  const numServedDays =
    typeof raw?.numServedDays === "number" ? raw.numServedDays : null;
  const creativeRegions = Array.isArray(raw?.creativeRegions)
    ? (raw.creativeRegions as string[]).filter(
        (s) => typeof s === "string" && s,
      )
    : [];
  type SilvaRegionStat = {
    regionCode?: string;
    regionName?: string;
    firstShown?: string;
    lastShown?: string;
    impressions?: { lowerBound?: number; upperBound?: number | null };
    surfaceServingStats?: Array<{
      surfaceCode?: string;
      surfaceName?: string;
    }>;
  };
  const regionStats = (Array.isArray(raw?.regionStats)
    ? (raw.regionStats as SilvaRegionStat[])
    : []) as SilvaRegionStat[];
  // YouTube watch URLs cannot be played by the HTML <video> element —
  // we render an enriched "click to open on YouTube" tile instead of
  // a black rectangle. Same trap fixed in Compare.
  const youtubeId = isGoogle ? youtubeIdFromUrl(ad.video_url) : null;
  const hasPlayableVideo = isPlayableVideoUrl(ad.video_url);
  const insights = extractAdInsights(raw);
  const genderLabelKey: Record<NonNullable<typeof insights.genderLabel>, string> = {
    all: "genderAll",
    mostlyMale: "genderMostlyMale",
    mostlyFemale: "genderMostlyFemale",
  };
  const totalAgeCount = insights.ageTotals.reduce((s, a) => s + a.count, 0);
  const pageInfoRaw = raw?.pageInfo as Record<string, unknown> | null;
  const adLibPageInfo = pageInfoRaw?.adLibraryPageInfo as Record<string, unknown> | null;
  const relatedPages = (adLibPageInfo?.relatedPages ?? []) as Array<{
    pageId?: string;
    pageName?: string;
    country?: string;
  }>;

  // Campaign duration via the shared helper — it treats ACTIVE ads
  // as "still running today" regardless of any spurious end_date.
  // Apify's endDate is a snapshot date, not the actual campaign end;
  // ads ingested before the normalize() fix landed still hold that
  // value in end_date, so the helper's status-aware logic is what
  // protects the duration number here.
  const durationDays = computeAdDurationDays(ad);
  const isActive = ad.status === "ACTIVE";

  // For Google ads we now prefer silva's `numServedDays` because it
  // is Google's authoritative count and correctly reports 0 for
  // sub-day campaigns (the heuristic above clamps everything to 1
  // and produces an indistinguishable "1 giorno" both for genuine
  // 1-day ads and for polling-artifact 0-day ads). Falls back to
  // the heuristic when silva did not return the field (legacy rows).
  const displayDurationDays =
    isGoogle && typeof numServedDays === "number"
      ? numServedDays
      : durationDays;

  const aiTagLabels: Record<string, string> = {
    sector: t("adDetail", "aiTagSector"),
    creative_format: t("adDetail", "aiTagFormat"),
    tone: t("adDetail", "aiTagTone"),
    objective: t("adDetail", "aiTagObjective"),
    seasonality: t("adDetail", "aiTagSeasonality"),
    language: t("adDetail", "aiTagLanguage"),
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back arrow — return to the brand-detail tab matching this
          ad's source, so navigating Google ads doesn't bounce the
          user to the Meta tab on return. Brand detail's tab state
          is URL-driven (?tab=...). */}
      <Link
        href={`/competitors/${competitorId}?tab=${isGoogle ? "google" : "meta"}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("adDetail", "backToCompetitor")}
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {pageName && (
            <p className="text-xs uppercase tracking-[0.15em] text-gold mb-1">
              {pageName}
            </p>
          )}
          <h1 className="text-2xl font-serif tracking-tight">
            {ad.headline ?? `Ad ${ad.ad_archive_id}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ID: {ad.ad_archive_id}
          </p>
        </div>
        <div className="flex gap-2">
          {ad.status === "ACTIVE" && <Badge variant="gold">ACTIVE</Badge>}
          {adLibraryUrl && (
            <a
              href={adLibraryUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 h-9 text-sm hover:border-gold/40 hover:text-gold transition-colors"
            >
              {adLibraryLabel} <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Main creative */}
        <div className="lg:col-span-3 space-y-4">
          {/* Primary creative. YouTube watch URLs cannot be embedded
              in the <video> element (same trap as in Compare) — render
              the YouTube thumbnail with a play overlay, click-out to
              YouTube. Only when the URL is a real media file do we
              fall back to the native player. */}
          {hasPlayableVideo && ad.video_url ? (
            <Card>
              <CardContent className="p-0">
                <video
                  src={ad.video_url}
                  poster={ad.image_url && !ad.image_url.includes("/render_ad/") ? ad.image_url : undefined}
                  controls
                  playsInline
                  className="w-full rounded-xl"
                />
              </CardContent>
            </Card>
          ) : youtubeId ? (
            <Card>
              <CardContent className="p-0">
                <a
                  href={`https://www.youtube.com/watch?v=${youtubeId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block group"
                  aria-label={t("adDetail", "youtubeOpenLabel")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
                    alt={ad.headline ?? "YouTube preview"}
                    className="w-full rounded-xl bg-muted"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/60 rounded-full p-4 backdrop-blur-sm group-hover:bg-black/75 transition-colors">
                      <Play
                        className="size-8 text-white"
                        strokeWidth={2.5}
                        fill="currentColor"
                      />
                    </div>
                  </div>
                </a>
              </CardContent>
            </Card>
          ) : ad.image_url && !ad.image_url.includes("/render_ad/") ? (
            <Card>
              {/* Google creatives are flat designs with embedded
                  text — render on a white backdrop so the text in
                  the image stays readable instead of riding on the
                  card surface. Meta creatives keep the default. */}
              <CardContent className={isGoogle ? "p-0 bg-white rounded-xl" : "p-0"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ad.image_url}
                  alt={ad.headline ?? "ad creative"}
                  className="w-full rounded-xl"
                />
              </CardContent>
            </Card>
          ) : (
            // Final fallback — no playable video, no YouTube ID, no
            // usable image. Common on silva Google rows whose
            // variations[] came back empty (the actor saw the ad ID
            // but did not capture media). Render a clear "no preview
            // available" card with a click-out to the Transparency
            // page so the user can still inspect the creative.
            <Card>
              <CardContent className="p-12 flex flex-col items-center text-center gap-3">
                <div className="size-12 rounded-full bg-muted grid place-items-center">
                  {isGoogle && (raw?.format as string)?.toUpperCase() === "VIDEO" ? (
                    <Play className="size-6 text-muted-foreground" />
                  ) : (
                    <ExternalLink className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {t("adDetail", "noPreviewAvailableTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md">
                    {t("adDetail", "noPreviewAvailableHelp")}
                  </p>
                </div>
                {adLibraryUrl && (
                  <a
                    href={adLibraryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 h-9 text-sm hover:border-gold/40 hover:text-gold transition-colors mt-1"
                  >
                    {adLibraryLabel} <ExternalLink className="size-3.5" />
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {/* All carousel cards */}
          {cards.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <LayoutGrid className="size-4" />
                  {t("adDetail", "allCarouselCards")} ({cards.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                  {cards.map((card, i) => {
                    const imgUrl =
                      card.originalImageUrl ?? card.resizedImageUrl;
                    return (
                      <div key={i} className="space-y-2">
                        {imgUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imgUrl}
                            alt={`${t("adDetail", "variantLabel")} ${i + 1}`}
                            className="w-full rounded-lg border border-border"
                          />
                        )}
                        {card.title && (
                          <p className="text-xs font-medium">{card.title}</p>
                        )}
                        {card.body && (
                          <p className="text-[11px] text-muted-foreground">
                            {card.body}
                          </p>
                        )}
                        {card.linkUrl && (
                          <a
                            href={card.linkUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-gold hover:underline break-all"
                          >
                            {card.linkUrl}
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Full ad text — hidden entirely when none of the three
              text fields are populated. Google Ads have all three
              null because the Apify Google actor does not extract
              copy (text is rendered inside the creative image), so
              showing an empty card just looks broken. */}
          {(ad.headline || ad.ad_text || ad.description) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("adDetail", "fullText")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {ad.headline && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("adDetail", "headline")}</p>
                    <p className="font-medium">{ad.headline}</p>
                  </div>
                )}
                {ad.ad_text && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("adDetail", "copy")}</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {ad.ad_text}
                    </p>
                  </div>
                )}
                {ad.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {t("adDetail", "descriptionLabel")}
                    </p>
                    <p className="text-sm">{ad.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar details */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("adDetail", "details")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status row — first thing the user sees on Google
                  ads. Google Transparency does not expose an
                  Active/Inactive flag on its public panel, so we
                  derive it from the freshness of `lastShown` (silva
                  / our normalizer). Render it explicitly with help
                  copy explaining where the value comes from. On
                  Meta the column maps directly so the help text is
                  redundant — keep the badge only. */}
              {isGoogle && (
                <div className="flex items-start gap-3">
                  <span className="text-muted-foreground mt-0.5 shrink-0">
                    <Zap className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("adDetail", "statusLabel")}
                    </p>
                    <div className="mt-0.5">
                      <Badge variant={isActive ? "gold" : "muted"}>
                        {isActive
                          ? t("adDetail", "statusActive")
                          : t("adDetail", "statusInactive")}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                      {t("adDetail", "statusGoogleHelp")}
                    </p>
                  </div>
                </div>
              )}
              <DetailRow
                icon={<Calendar className="size-4" />}
                // On Google these are silva's `firstShown` /
                // `lastShown` from regionStats — i.e. when Google
                // first / last observed the ad in its catalog, NOT
                // a user-declared campaign start/end. Relabel so
                // the user reads them as observations and does not
                // expect the Meta-style "campaign window".
                label={
                  isGoogle
                    ? t("adDetail", "googleFirstObserved")
                    : t("adDetail", "startDate")
                }
                value={formatDate(ad.start_date)}
              />
              {/* For ACTIVE ads we always show "still active" — the
                  end_date column may carry a stale snapshot date
                  from a pre-fix scan, which would otherwise render
                  as a misleading 1-day-after-start value. */}
              <DetailRow
                icon={<Calendar className="size-4" />}
                label={
                  isGoogle
                    ? t("adDetail", "googleLastObserved")
                    : t("adDetail", "endDate")
                }
                value={
                  isActive || !ad.end_date
                    ? t("adDetail", "stillActive")
                    : formatDate(ad.end_date)
                }
              />
              {displayDurationDays != null && (
                <DetailRow
                  icon={<Clock className="size-4" />}
                  label={t("adDetail", "duration")}
                  // 0 days = sub-day campaign (silva numServedDays=0
                  // happens on ads that ran for less than 24h). Show
                  // an explicit "less than 1 day" so the user does
                  // not confuse it with a real 1-day ad. Singular vs
                  // plural for everything else.
                  value={
                    displayDurationDays === 0
                      ? t("adDetail", "lessThanADay")
                      : displayDurationDays === 1
                        ? `1 ${t("adDetail", "dayUnit")}`
                        : `${displayDurationDays} ${t("adDetail", "daysUnit")}`
                  }
                />
              )}
              {ad.cta && (
                <DetailRow
                  icon={<ExternalLink className="size-4" />}
                  label="CTA"
                  value={ad.cta}
                />
              )}
              {ad.landing_url && (
                <div className="flex items-start gap-3">
                  <Globe className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("adDetail", "landingPage")}</p>
                    <a
                      href={ad.landing_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-gold hover:underline break-all"
                    >
                      {ad.landing_url}
                    </a>
                  </div>
                </div>
              )}
              {/* Our own scan-history signal — distinct from the
                  actor's lastShown above. Tells the user "we last
                  observed this ad in our scans on [date]". Useful
                  when the actor's catalog data drifts from the
                  user's actual scan cadence (e.g. Google takes
                  24-48h to refresh Transparency lastShown after
                  the ad has stopped serving). */}
              <DetailRow
                icon={<Clock className="size-4" />}
                label={t("adDetail", "lastSeenInScan")}
                value={formatDate(ad.last_seen_in_scan_at)}
              />
            </CardContent>
          </Card>

          {ad.platforms && ad.platforms.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {/* Google ads expose campaign types ("display",
                      "google_search", "youtube") in this column —
                      labelling them "Piattaforme" is misleading.
                      Meta really does carry FB / IG / Audience
                      Network / Messenger here, so the original
                      label stays for non-Google sources. */}
                  {isGoogle
                    ? t("adDetail", "campaignType")
                    : t("adDetail", "platforms")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {ad.platforms.map((p) => (
                    <Badge key={p} variant="muted">
                      {p}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {AI_TAGS_ENABLED && aiTags && Object.keys(aiTags).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tag className="size-4" /> AI Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(aiTags).map(([key, value]) => {
                  if (!value || typeof value !== "string") return null;
                  return (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {aiTagLabels[key] ?? key}
                      </span>
                      <Badge variant="gold">{value}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Ad metadata */}
          {(displayFormat || ctaType || collationCount || isAiGenerated || isAaaEligible || isReshared) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="size-4" /> {t("adDetail", "adMetadata")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {displayFormat && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("adDetail", "displayFormat")}</span>
                    <Badge variant="muted">{displayFormat}</Badge>
                  </div>
                )}
                {ctaType && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("adDetail", "ctaType")}</span>
                    <Badge variant="muted">{ctaType}</Badge>
                  </div>
                )}
                {collationCount != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("adDetail", "variantsCount")}</span>
                    <span className="font-medium">{collationCount}</span>
                  </div>
                )}
                {isAaaEligible && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Advantage+</span>
                    <Badge variant="gold">{t("adDetail", "enabled")}</Badge>
                  </div>
                )}
                {isAiGenerated && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Bot className="size-3" /> {t("adDetail", "aiGenerated")}
                    </span>
                    <Badge variant="gold">{t("adDetail", "yes")}</Badge>
                  </div>
                )}
                {isReshared && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("adDetail", "reshared")}</span>
                    <Badge variant="muted">{t("adDetail", "yes")}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Audience & Reach (EU DSA) */}
          {insights.hasData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <UsersRound className="size-4" /> {t("adDetail", "audienceReach")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.euReach != null && (
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">{t("adDetail", "reachLabel")}</span>
                      <span className="text-lg font-semibold text-gold">{formatNumber(insights.euReach)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                      {t("adDetail", "reachHelp")}
                    </p>
                  </div>
                )}
                {insights.ageRangeLabel && (
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                    <span className="text-muted-foreground">{t("adDetail", "dominantAge")}</span>
                    <span className="font-medium">{insights.ageRangeLabel}</span>
                  </div>
                )}
                {insights.genderLabel && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("adDetail", "genderMix")}</span>
                    <span className="font-medium">
                      {t("adDetail", genderLabelKey[insights.genderLabel])}
                    </span>
                  </div>
                )}
                {insights.ageTotals.length > 0 && totalAgeCount > 0 && (
                  <div className="pt-3 border-t border-border space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      {t("adDetail", "ageDistribution")}
                    </p>
                    {insights.ageTotals.map((a) => {
                      const pct = Math.round((a.count / totalAgeCount) * 100);
                      return (
                        <div key={a.ageRange} className="flex items-center gap-2 text-[11px]">
                          <span className="w-12 text-muted-foreground tabular-nums shrink-0">{a.ageRange}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-gold/70" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-8 text-right text-muted-foreground tabular-nums">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Google serving — silva-only enrichment. Replaces the
              "Targeted countries" card (which is empty on Google
              because scan_countries is NULL by design) with a richer
              breakdown: total served days, country list, and where
              available the per-country firstShown / lastShown /
              impressions / surface mix. */}
          {isGoogle &&
            (numServedDays != null || creativeRegions.length > 0 || regionStats.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Globe className="size-4" /> {t("adDetail", "googleServingHeader")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {t("adDetail", "googleServingHeaderHelp")}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {numServedDays != null && (
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t("adDetail", "googleNumServedDays")}
                        </p>
                        <p className="text-lg font-semibold mt-1">
                          {numServedDays} <span className="text-xs font-normal text-muted-foreground">{t("adDetail", "daysUnit")}</span>
                        </p>
                      </div>
                    )}
                    {creativeRegions.length > 0 && (
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t("adDetail", "googleCountriesServed")}
                        </p>
                        <p className="text-lg font-semibold mt-1">
                          {creativeRegions.length}
                        </p>
                      </div>
                    )}
                  </div>
                  {creativeRegions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {creativeRegions.map((c) => (
                        <Badge key={c} variant="muted">{c}</Badge>
                      ))}
                    </div>
                  )}
                  {/* Per-country detail. Many records have regionStats
                      with no surfaceServingStats / impressions because
                      Google does not publish those below an internal
                      impression threshold — render only the rows that
                      carry actual data so we don't show a wall of
                      empty country cards. */}
                  {(() => {
                    const richRows = regionStats.filter((r) => {
                      const hasImpr =
                        r.impressions &&
                        (typeof r.impressions.lowerBound === "number" ||
                          typeof r.impressions.upperBound === "number");
                      const hasSurface =
                        Array.isArray(r.surfaceServingStats) &&
                        r.surfaceServingStats.length > 0;
                      return hasImpr || hasSurface;
                    });
                    if (richRows.length === 0) {
                      return (
                        <p className="text-[11px] text-muted-foreground italic">
                          {t("adDetail", "googlePerCountryEmpty")}
                        </p>
                      );
                    }
                    const sorted = [...richRows].sort((a, b) => {
                      const ai = a.impressions?.lowerBound ?? 0;
                      const bi = b.impressions?.lowerBound ?? 0;
                      return bi - ai;
                    });
                    return (
                      <div className="space-y-2 pt-2 border-t border-border">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t("adDetail", "googlePerCountry")}
                        </p>
                        {sorted.slice(0, 8).map((r) => {
                          const lower = r.impressions?.lowerBound;
                          const upper = r.impressions?.upperBound;
                          const imprStr =
                            typeof lower === "number" && typeof upper === "number"
                              ? `${formatNumber(lower)}–${formatNumber(upper)}`
                              : typeof lower === "number"
                                ? `${formatNumber(lower)}+`
                                : null;
                          const surfaces =
                            r.surfaceServingStats?.map((s) => s.surfaceCode).filter(Boolean) ?? [];
                          return (
                            <div
                              key={r.regionCode ?? r.regionName ?? Math.random()}
                              className="rounded-md border border-border p-2.5 space-y-1"
                            >
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">
                                  {r.regionName ?? r.regionCode ?? "—"}
                                </span>
                                {imprStr && (
                                  <span className="text-xs text-muted-foreground">
                                    {imprStr}
                                  </span>
                                )}
                              </div>
                              {(r.firstShown || r.lastShown) && (
                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                  {r.firstShown && (
                                    <span>
                                      {t("adDetail", "googleFirstShown")}: {formatDate(r.firstShown)}
                                    </span>
                                  )}
                                  {r.lastShown && (
                                    <span>
                                      {t("adDetail", "googleLastShown")}: {formatDate(r.lastShown)}
                                    </span>
                                  )}
                                </div>
                              )}
                              {surfaces.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {surfaces.map((s, i) => (
                                    <Badge key={`${s}-${i}`} variant="muted" className="text-[10px]">
                                      {s}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

          {/* Targeted countries — Meta only. Hidden on Google because
              scan_countries is NULL by design there (the richer card
              above replaces it). */}
          {!isGoogle && targetedCountries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="size-4" /> {t("adDetail", "targetedCountries")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {targetedCountries.map((c) => (
                    <Badge key={c} variant="muted">{c}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Related pages */}
          {relatedPages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="size-4" /> {t("adDetail", "relatedPages")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {relatedPages.map((rp, i) => (
                  <div key={rp.pageId ?? i} className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">{rp.pageName ?? rp.pageId ?? "—"}</span>
                    {rp.country && (
                      <Badge variant="muted" className="shrink-0 ml-2">{rp.country}</Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
