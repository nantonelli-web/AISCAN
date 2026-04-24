import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Calendar, Clock, Globe, Tag, Bot, Zap, LayoutGrid, MapPin, Users, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/utils";
import { getLocale, serverT } from "@/lib/i18n/server";
import { extractAdInsights } from "@/lib/meta/ad-insights";
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
  const pageName = (raw?.pageName as string) ?? (snapshot?.pageName as string) ?? null;
  const adLibraryUrl =
    (raw?.adLibraryURL as string) ??
    `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}`;

  // New metadata from raw_data
  const displayFormat = (snapshot?.displayFormat as string) ?? null;
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

  // Calculate campaign duration
  let durationDays: number | null = null;
  if (ad.start_date) {
    const start = new Date(ad.start_date).getTime();
    const end = ad.end_date ? new Date(ad.end_date).getTime() : Date.now();
    durationDays = Math.max(1, Math.round((end - start) / 86_400_000));
  }

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
      <Link
        href={`/competitors/${competitorId}`}
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
          <a
            href={adLibraryUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 h-9 text-sm hover:border-gold/40 hover:text-gold transition-colors"
          >
            Meta Ad Library <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Main creative */}
        <div className="lg:col-span-3 space-y-4">
          {/* Primary creative */}
          {ad.video_url ? (
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
          ) : ad.image_url && !ad.image_url.includes("/render_ad/") ? (
            <Card>
              <CardContent className="p-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ad.image_url}
                  alt={ad.headline ?? "ad creative"}
                  className="w-full rounded-xl"
                />
              </CardContent>
            </Card>
          ) : null}

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

          {/* Full ad text */}
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
        </div>

        {/* Sidebar details */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("adDetail", "details")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DetailRow
                icon={<Calendar className="size-4" />}
                label={t("adDetail", "startDate")}
                value={formatDate(ad.start_date)}
              />
              <DetailRow
                icon={<Calendar className="size-4" />}
                label={t("adDetail", "endDate")}
                value={ad.end_date ? formatDate(ad.end_date) : t("adDetail", "stillActive")}
              />
              {durationDays && (
                <DetailRow
                  icon={<Clock className="size-4" />}
                  label={t("adDetail", "duration")}
                  value={`${durationDays} ${t("adDetail", "daysUnit")}`}
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
            </CardContent>
          </Card>

          {ad.platforms && ad.platforms.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("adDetail", "platforms")}</CardTitle>
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

          {aiTags && Object.keys(aiTags).length > 0 && (
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

          {/* Targeted countries */}
          {targetedCountries.length > 0 && (
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
