"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdCard } from "@/components/ads/ad-card";
import { OrganicPostCard } from "@/components/organic/organic-post-card";
import { TikTokPostCard } from "@/components/organic/tiktok-post-card";
import { TagButton } from "@/components/ads/tag-button";
import { AI_TAGS_ENABLED } from "@/config/features";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { MetaIcon } from "@/components/ui/meta-icon";
import { TikTokIcon } from "@/components/ui/tiktok-icon";
import { Download, Loader2 } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { CountryFilterDropdown } from "./country-filter-dropdown";
import type { MaitAdExternal, MaitOrganicPost, MaitTikTokPost } from "@/types";

type Channel = "all" | "meta" | "google" | "instagram" | "tiktok";
type Status = "all" | "active" | "inactive";

/* ─── Platform icons (small, inline) ─── */

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
  tiktokPosts: MaitTikTokPost[];
  /** DB-wide totals per channel — drive the filter chip badges so the
   *  user sees the real count for the brand, not the lazy-loaded
   *  array length (which is capped at 30 for performance). */
  channelTotals: { meta: number; google: number; instagram: number; tiktok: number };
  /** DB-wide active-only counts per source — fed to the Status pill
   *  so the Active badge matches the brand reality, not the loaded
   *  sample. Inactive = total − active. */
  activeTotals: { meta: number; google: number };
  /** Filter-aware per-source counts. Drive the "(X of Y)" caption
   *  above each grid so Y reflects the user's active narrowing,
   *  not the brand-wide channel total. */
  filteredTotals: { meta: number; google: number };
  /** URL-driven filter state. Pills navigate the URL; the server
   *  re-runs the ads query with these applied so the 30-row cap
   *  operates AFTER filtering. */
  tab: "all" | "meta" | "google" | "instagram" | "tiktok";
  statusFilter: "active" | "inactive" | null;
  countriesFilter: string[];
  /** Brand-wide country list (from page shell, not the loaded
   *  sample) so the dropdown always shows every market — even
   *  the ones whose ads dropped out under the active filters. */
  availableCountries: { code: string; count: number; name: string }[];
  organicStats: {
    count: number;
    /** null when every post has likes hidden (Instagram setting) —
     *  rendered as em-dash instead of "0" or "-1" so the user sees
     *  "unknown" rather than wrong numbers. */
    avgLikes: number | null;
    avgComments: number | null;
    totalViews: number;
  };
  tiktokStats: {
    count: number;
    avgLikes: number | null;
    avgComments: number | null;
    totalViews: number;
  };
}

export function ChannelTabs({
  competitorId,
  ads,
  organicPosts,
  tiktokPosts,
  channelTotals,
  activeTotals,
  filteredTotals,
  availableCountries,
  tab,
  statusFilter,
  countriesFilter,
  organicStats,
  tiktokStats,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useT();

  // URL-derived filter state. Pills navigate to a new URL; the server
  // re-runs the query with the new filters so the 30-row cap is
  // applied AFTER filtering. No client-side state — ads come from
  // the server already filtered.
  const channel: Channel = tab;
  const status: Status = statusFilter ?? "all";
  const selectedCountries = useMemo(
    () => new Set(countriesFilter),
    [countriesFilter],
  );

  // Build a URL with one or more search params updated. Passing null
  // removes the param, so e.g. picking "All" on the Status pills
  // drops `status` from the URL entirely (cleaner bookmarkable state).
  function buildHref(updates: Record<string, string | null>): string {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // Split server-rendered ads by source so the "all" view can group
  // Meta and Google sections separately. Server has already applied
  // every active filter — no further client-side narrowing needed.
  // Strict equality on source: filteredTotals.meta is computed via
  // .eq("source", "meta") on the server, so the client filter must
  // match exactly. Using `!== "google"` would pick up legacy rows
  // with source=NULL and inflate metaAds.length past filteredTotals.meta,
  // which silently hid the Load more button on brands with any null-source rows.
  const serverMetaAds = ads.filter((a) => {
    const src = (a as unknown as Record<string, unknown>).source;
    return src === "meta";
  });
  const serverGoogleAds = ads.filter((a) => {
    const src = (a as unknown as Record<string, unknown>).source;
    return src === "google";
  });

  // Country filter only narrows Meta ads (Google rows have NULL
  // scan_countries; Instagram and TikTok do not carry the column).
  // Showing it on those tabs would imply a filter that does nothing.
  const showCountryFilter =
    availableCountries.length > 0 &&
    (channel === "all" || channel === "meta");

  // ── Load more: client-appended ads beyond the initial 30 ──
  // The server-rendered Suspense child caps the first paint at 30
  // ads to keep the wire transfer light (each ad carries 50-200 KB
  // of raw_data). The "Load more" button calls /api/competitors/{id}
  // /ads?offset=… to pull the next page client-side and append in
  // place — no full Suspense reload, no skeleton flash.
  //
  // Suspense key includes every filter, so when the user changes a
  // filter the entire ChannelTabs subtree re-mounts and these
  // client-side states reset to empty automatically.
  const [extraMeta, setExtraMeta] = useState<MaitAdExternal[]>([]);
  const [extraGoogle, setExtraGoogle] = useState<MaitAdExternal[]>([]);
  const [loadingMore, setLoadingMore] = useState<"meta" | "google" | null>(
    null,
  );

  const metaAds = useMemo(
    () => [...serverMetaAds, ...extraMeta],
    [serverMetaAds, extraMeta],
  );
  const googleAds = useMemo(
    () => [...serverGoogleAds, ...extraGoogle],
    [serverGoogleAds, extraGoogle],
  );

  async function loadMore(source: "meta" | "google") {
    setLoadingMore(source);
    try {
      const params = new URLSearchParams();
      params.set("source", source);
      params.set(
        "offset",
        String(source === "meta" ? metaAds.length : googleAds.length),
      );
      params.set("limit", "30");
      if (statusFilter) params.set("status", statusFilter);
      if (countriesFilter.length > 0) {
        params.set("countries", countriesFilter.join(","));
      }
      const res = await fetch(
        `/api/competitors/${competitorId}/ads?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { ads: MaitAdExternal[] };
      const next = json.ads ?? [];
      if (source === "meta") setExtraMeta((prev) => [...prev, ...next]);
      else setExtraGoogle((prev) => [...prev, ...next]);
    } catch {
      // Silent on failure — the button stays clickable for retry.
    } finally {
      setLoadingMore(null);
    }
  }

  // Channel badge counts honour the active Status filter: when the
  // user picks "Active", each channel chip shows its DB-wide active
  // subset (so 396 Meta → 84 if only 84 are currently active). The
  // "all" tab sums the paid subset under filter + the unfiltered
  // Instagram total since organic has no ACTIVE/INACTIVE concept.
  const metaCount =
    status === "all"
      ? channelTotals.meta
      : status === "active"
        ? activeTotals.meta
        : Math.max(0, channelTotals.meta - activeTotals.meta);
  const googleCount =
    status === "all"
      ? channelTotals.google
      : status === "active"
        ? activeTotals.google
        : Math.max(0, channelTotals.google - activeTotals.google);
  const instagramCount = channelTotals.instagram;
  const tiktokCount = channelTotals.tiktok;

  const tabs: { key: Channel; label: string; count: number; icon?: React.ReactNode }[] = [
    {
      key: "all",
      label: t("competitors", "channelAll"),
      count: metaCount + googleCount + instagramCount + tiktokCount,
    },
    { key: "meta", label: "Meta Ads", count: metaCount, icon: <MetaIcon className="size-3.5" /> },
    { key: "google", label: "Google Ads", count: googleCount, icon: <GoogleIcon className="size-3.5" /> },
    { key: "instagram", label: "Instagram", count: instagramCount, icon: <InstagramIcon className="size-3.5" /> },
    { key: "tiktok", label: "TikTok", count: tiktokCount, icon: <TikTokIcon className="size-3.5" /> },
  ];

  // Status pills — paid channels only (Instagram & TikTok organic
  // posts have no ACTIVE/INACTIVE concept). Counts come from the
  // head+exact queries done in the parent page; we drop them from
  // the pill UI itself to mirror Benchmarks but keep the structure
  // here in case we want them back as e.g. tooltips or sidebar copy.
  const showStatusFilter = channel !== "instagram" && channel !== "tiktok";
  const statusPills: { key: Status; label: string }[] = [
    { key: "all", label: t("competitors", "channelAll") },
    { key: "active", label: t("competitors", "statusActive") },
    { key: "inactive", label: t("competitors", "statusInactive") },
  ];

  // Filter out channels with 0 items (except "all")
  const visibleTabs = tabs.filter((entry) => entry.key === "all" || entry.count > 0);

  const showMeta = channel === "all" || channel === "meta";
  const showGoogle = channel === "all" || channel === "google";
  const showInstagram = channel === "all" || channel === "instagram";
  const showTiktok = channel === "all" || channel === "tiktok";

  const visibleAds = channel === "meta" ? metaAds : channel === "google" ? googleAds : channel === "all" ? ads : [];
  const visibleOrganic = showInstagram ? organicPosts : [];
  const visibleTiktok = showTiktok ? tiktokPosts : [];

  // Identical chip class to Benchmarks: flat pill, gold/15 selected,
  // neutral border otherwise. No count badge — counts are already
  // visible in the "(X of Y) ads" line above each grid, and Benchmarks
  // itself omits them for visual cleanliness.
  const chipClass = (selected: boolean) =>
    selected
      ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors cursor-pointer"
      : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer";

  return (
    <div className="space-y-6">
      {/* ─── Channel · Country · Status — all on one row ──────
          Same grammar as the Benchmarks filter strip: inline label
          (uppercase 10px bold), pills without count badges, vertical
          divider between groups. Country dropdown sits in the middle
          (Meta-only, hidden on Instagram/Google) so the row reads
          left-to-right as "narrow the channel, then the market,
          then the status". */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 print:hidden">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-foreground font-bold">
            {t("competitors", "filterByChannel")}
          </span>
          {visibleTabs.map((p) => (
            <Link
              key={p.key}
              href={buildHref({
                tab: p.key === "all" ? null : p.key,
                // Switching to Instagram or Google disables the
                // country filter (no scan_countries on those rows).
                // Drop the selection rather than carrying an
                // invisible filter forward.
                ...(p.key === "instagram" || p.key === "google"
                  ? { countries: null }
                  : {}),
              })}
              className={chipClass(channel === p.key)}
            >
              {p.icon}
              {p.label}
            </Link>
          ))}
        </div>

        {showCountryFilter && (
          <>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-foreground font-bold">
                {t("competitors", "filterByCountry")}
              </span>
              <CountryFilterDropdown
                availableCountries={availableCountries}
                selected={selectedCountries}
                onChange={(next) => {
                  const codes = [...next];
                  router.push(
                    buildHref({
                      countries: codes.length > 0 ? codes.join(",") : null,
                    }),
                  );
                }}
              />
            </div>
          </>
        )}

        {showStatusFilter && (
          <>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-foreground font-bold">
                {t("competitors", "filterByStatus")}
              </span>
              {statusPills.map((p) => (
                <Link
                  key={p.key}
                  href={buildHref({
                    status: p.key === "all" ? null : p.key,
                  })}
                  className={chipClass(status === p.key)}
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ─── Ads section ─── */}
      {channel === "all" ? (
        <>
          {/* All: grouped by channel. The (X of Y) suffix tells the
              user that the grid is a recent slice — Y is the real DB
              total, X is the loaded sample (capped at 30). */}
          {metaAds.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MetaIcon className="size-4 text-gold" />
                  <p className="text-sm font-medium">Meta Ads</p>
                  <span className="text-xs text-muted-foreground">
                    ({metaAds.length}
                    {filteredTotals.meta > metaAds.length
                      ? ` ${t("competitors", "ofTotal")} ${filteredTotals.meta}`
                      : ""}
                    )
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {AI_TAGS_ENABLED && <TagButton competitorId={competitorId} />}
                  <a
                    href={`/api/export/ads.csv?competitor_id=${competitorId}`}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Download className="size-3" />
                    {t("competitors", "exportCsv")}
                  </a>
                </div>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {metaAds.map((ad) => (
                  <AdCard key={ad.id} ad={ad} competitorId={competitorId} />
                ))}
              </div>
              {filteredTotals.meta > metaAds.length && (
                <div className="flex justify-center pt-3 print:hidden">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => loadMore("meta")}
                    disabled={loadingMore !== null}
                    className="gap-2 cursor-pointer min-w-[240px] h-12 text-sm font-medium"
                  >
                    {loadingMore === "meta" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {t("competitors", "loadingMore")}
                      </>
                    ) : (
                      `${t("competitors", "loadMore")} (${filteredTotals.meta - metaAds.length})`
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {googleAds.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <GoogleIcon className="size-4 text-gold" />
                <p className="text-sm font-medium">Google Ads</p>
                <span className="text-xs text-muted-foreground">
                  ({googleAds.length}
                  {filteredTotals.google > googleAds.length
                    ? ` ${t("competitors", "ofTotal")} ${filteredTotals.google}`
                    : ""}
                  )
                </span>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {googleAds.map((ad) => (
                  <AdCard key={ad.id} ad={ad} competitorId={competitorId} />
                ))}
              </div>
              {filteredTotals.google > googleAds.length && (
                <div className="flex justify-center pt-3 print:hidden">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => loadMore("google")}
                    disabled={loadingMore !== null}
                    className="gap-2 cursor-pointer min-w-[240px] h-12 text-sm font-medium"
                  >
                    {loadingMore === "google" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {t("competitors", "loadingMore")}
                      </>
                    ) : (
                      `${t("competitors", "loadMore")} (${filteredTotals.google - googleAds.length})`
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Filtered: single channel */}
          {(channel === "meta" || channel === "google") && visibleAds.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {visibleAds.length}
                  {(() => {
                    const total =
                      channel === "meta" ? filteredTotals.meta : filteredTotals.google;
                    return total > visibleAds.length
                      ? ` ${t("competitors", "ofTotal")} ${total}`
                      : "";
                  })()}
                  {" "}ads
                </p>
                <div className="flex items-center gap-3">
                  {AI_TAGS_ENABLED && <TagButton competitorId={competitorId} />}
                  <a
                    href={`/api/export/ads.csv?competitor_id=${competitorId}`}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Download className="size-3" />
                    {t("competitors", "exportCsv")}
                  </a>
                </div>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleAds.map((ad) => (
                  <AdCard key={ad.id} ad={ad} competitorId={competitorId} />
                ))}
              </div>
              {(() => {
                if (channel !== "meta" && channel !== "google") return null;
                const total =
                  channel === "meta" ? filteredTotals.meta : filteredTotals.google;
                if (total <= visibleAds.length) return null;
                const remaining = total - visibleAds.length;
                return (
                  <div className="flex justify-center pt-3 print:hidden">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => loadMore(channel)}
                      disabled={loadingMore !== null}
                      className="gap-2 cursor-pointer min-w-[240px] h-12 text-sm font-medium"
                    >
                      {loadingMore === channel ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t("competitors", "loadingMore")}
                        </>
                      ) : (
                        `${t("competitors", "loadMore")} (${remaining})`
                      )}
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Empty state for single channel */}
          {(channel === "meta" || channel === "google") && visibleAds.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                {channel === "meta" ? t("competitors", "noMetaAds") : t("competitors", "noGoogleAds")}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ─── Instagram section ─── */}
      {showInstagram && (
        <div className="space-y-4">
          {/* Engagement stats */}
          {organicStats.count > 0 && channel === "instagram" && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {channelTotals.instagram}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("organic", "totalPosts")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {organicStats.avgLikes != null ? formatNumber(organicStats.avgLikes) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("organic", "avgLikes")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {organicStats.avgComments != null ? formatNumber(organicStats.avgComments) : "—"}
                  </p>
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
              {/* Section header on the all-tab so the user can tell
                  these cards are Instagram posts, not "more ads
                  that loaded by themselves". Same grammar as the
                  Meta/Google headers above so the rhythm matches. */}
              {channel === "all" && (
                <div className="flex items-center gap-2 pt-4 border-t border-border">
                  <InstagramIcon className="size-4 text-gold" />
                  <p className="text-sm font-medium">Instagram</p>
                  <span className="text-xs text-muted-foreground">
                    ({visibleOrganic.length}
                    {channelTotals.instagram > visibleOrganic.length
                      ? ` ${t("competitors", "ofTotal")} ${channelTotals.instagram}`
                      : ""}
                    )
                  </span>
                </div>
              )}
              {channel === "instagram" && (
                <p className="text-sm text-muted-foreground">
                  {visibleOrganic.length}
                  {channelTotals.instagram > visibleOrganic.length
                    ? ` ${t("competitors", "ofTotal")} ${channelTotals.instagram}`
                    : ""}
                  {" "}{t("organic", "postsCount")}
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

      {/* ─── TikTok section ─── */}
      {showTiktok && (
        <div className="space-y-4">
          {tiktokStats.count > 0 && channel === "tiktok" && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {channelTotals.tiktok}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("organic", "totalPosts")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {tiktokStats.avgLikes != null ? formatNumber(tiktokStats.avgLikes) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("organic", "avgLikes")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {tiktokStats.avgComments != null ? formatNumber(tiktokStats.avgComments) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("organic", "avgComments")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">{formatNumber(tiktokStats.totalViews)}</p>
                  <p className="text-xs text-muted-foreground">{t("organic", "totalViews")}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {visibleTiktok.length === 0 ? (
            channel === "tiktok" && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  {t("organic", "noPostsYet")}
                </CardContent>
              </Card>
            )
          ) : (
            <>
              {channel === "all" && (
                <div className="flex items-center gap-2 pt-4 border-t border-border">
                  <TikTokIcon className="size-4 text-gold" />
                  <p className="text-sm font-medium">TikTok</p>
                  <span className="text-xs text-muted-foreground">
                    ({visibleTiktok.length}
                    {channelTotals.tiktok > visibleTiktok.length
                      ? ` ${t("competitors", "ofTotal")} ${channelTotals.tiktok}`
                      : ""}
                    )
                  </span>
                </div>
              )}
              {channel === "tiktok" && (
                <p className="text-sm text-muted-foreground">
                  {visibleTiktok.length}
                  {channelTotals.tiktok > visibleTiktok.length
                    ? ` ${t("competitors", "ofTotal")} ${channelTotals.tiktok}`
                    : ""}
                  {" "}{t("organic", "postsCount")}
                </p>
              )}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleTiktok.map((post) => (
                  <TikTokPostCard key={post.id} post={post} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty state for "all" when nothing exists */}
      {channel === "all" && ads.length === 0 && organicPosts.length === 0 && tiktokPosts.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("competitors", "noAdsCollected")}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
