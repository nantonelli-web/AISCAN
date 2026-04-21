"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Pen,
  Palette,
  Loader2,
  AlertCircle,
  Target,
  Info,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  Trash2,
  ArrowLeft,
  Printer,
} from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { MetaIcon } from "@/components/ui/meta-icon";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { AnalysisReport } from "./analysis-report";
import {
  VolumeChart,
  FormatPieChart,
  FormatStackedChart,
  HorizontalBarChart,
  PlatformChart,
} from "@/components/dashboard/benchmark-charts";
import type {
  BenchmarkData,
  OrganicBenchmarkData,
} from "@/lib/analytics/benchmarks";
import type { CreativeAnalysisResult } from "@/lib/ai/creative-analysis";
import type { MaitCompetitor } from "@/types";
import { COUNTRIES } from "@/config/countries";

type Tab = "technical" | "copy" | "visual" | "benchmark";
type Channel = "all" | "meta" | "google" | "instagram";

interface AdsCompStats {
  id: string;
  name: string;
  kind: "ads";
  totalAds: number;
  activeAds: number;
  imageCount: number;
  videoCount: number;
  topCtas: { name: string; count: number }[];
  platforms: { name: string; count: number }[];
  avgDuration: number;
  avgCopyLength: number;
  adsPerWeek: number;
  objectiveInference: {
    objective: string;
    confidence: number;
    signals: string[];
  };
  latestAds: {
    headline: string | null;
    image_url: string | null;
    ad_archive_id: string;
  }[];
}

interface OrganicCompStats {
  id: string;
  name: string;
  kind: "organic";
  instagramUsername: string | null;
  profile: {
    fullName: string | null;
    biography: string | null;
    followersCount: number | null;
    followsCount: number | null;
    postsCount: number | null;
    profilePicUrl: string | null;
    verified: boolean;
    businessCategoryName: string | null;
  } | null;
  totalPosts: number;
  imageCount: number;
  videoCount: number;
  reelCount: number;
  avgLikes: number;
  avgComments: number;
  avgViews: number;
  topHashtags: { name: string; count: number }[];
  postsPerWeek: number;
  avgCaptionLength: number;
  latestPosts: {
    post_id: string;
    caption: string | null;
    display_url: string | null;
    post_url: string | null;
    likes: number;
    comments: number;
  }[];
}

type CompStats = AdsCompStats | OrganicCompStats;

/** Old cached rows (pre-organic) have no `kind` — default to "ads". */
function normalizeStats(raw: unknown): CompStats[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((s) => {
    const rec = s as Record<string, unknown>;
    if (rec.kind === "organic") return rec as unknown as OrganicCompStats;
    return { ...(rec as object), kind: "ads" } as AdsCompStats;
  });
}

interface CachedComparison {
  technical_data: CompStats[] | null;
  copy_analysis: CreativeAnalysisResult["copywriterReport"] | null;
  visual_analysis: CreativeAnalysisResult["creativeDirectorReport"] | null;
  created_at: string;
  stale: boolean;
}

function formatTimestamp(isoDate: string, locale: string): string {
  return new Date(isoDate).toLocaleString(
    locale === "it" ? "it-IT" : "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

interface SavedComparison {
  id: string;
  competitor_ids: string[];
  locale: string;
  countries: string[] | null;
  channel: string | null;
  stale: boolean;
  created_at: string;
  updated_at: string;
}

function isChannel(v: string | null | undefined): v is Channel {
  return v === "all" || v === "meta" || v === "google" || v === "instagram";
}

function channelLabel(ch: string | null | undefined, t: (s: string, k: string) => string): string {
  switch (ch) {
    case "meta": return "Meta Ads";
    case "google": return "Google Ads";
    case "instagram": return "Instagram";
    case "all": return t("compare", "allChannels");
    default: return "Meta Ads";
  }
}

export function CompareView({
  competitors,
  savedComparisons = [],
}: {
  competitors: MaitCompetitor[];
  workspaceId: string;
  savedComparisons?: SavedComparison[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<Channel | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("technical");

  // Cached comparison state
  const [cache, setCache] = useState<CachedComparison | null>(null);
  const [stats, setStats] = useState<CompStats[] | null>(null);
  const [aiResult, setAiResult] = useState<CreativeAnalysisResult | null>(
    null
  );

  // Loading states
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Missing data state
  const [missingBrands, setMissingBrands] = useState<string[]>([]);
  const [misconfiguredBrands, setMisconfiguredBrands] = useState<{ name: string; id: string; reason: string }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [savedList, setSavedList] = useState(savedComparisons);

  // Benchmark tab state — may be ads or organic depending on channel
  type BenchmarkPayload =
    | ({ kind: "ads" } & BenchmarkData)
    | ({ kind: "organic" } & OrganicBenchmarkData);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkPayload | null>(
    null
  );
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  const fetchingRef = useRef<string>("");

  const { t, locale } = useT();
  const selectedIds = [...selected];
  const selectedKey = selectedIds.sort().join(",") + "|" + channel;

  function switchChannel(ch: Channel) {
    setChannel(ch);
    setCache(null);
    setStats(null);
    setAiResult(null);
    setAiError(null);
    setMissingBrands([]);
    setBenchmarkData(null);
    fetchingRef.current = "";
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
    // Reset all state when selection changes
    setSelectedCountries(new Set());
    setChannel(null);
    setCache(null);
    setStats(null);
    setAiResult(null);
    setAiError(null);
    setMissingBrands([]);
    setBenchmarkData(null);
    fetchingRef.current = "";
  }

  // Fetch or generate comparison when selection changes
  const fetchComparison = useCallback(
    async (ids: string[]) => {
      if (ids.length < 2) return;

      const key = [...ids].sort().join(",") + "|" + channel;
      if (fetchingRef.current === key) return;
      fetchingRef.current = key;

      setLoading(true);
      setAiError(null);
      setMissingBrands([]);

      try {
        // 0. Check if brands have data for this channel
        if (channel !== "all") {
          const checkRes = await fetch(
            `/api/competitors/check-channel?ids=${ids.join(",")}&channel=${channel}`
          );
          if (checkRes.ok) {
            const { results } = await checkRes.json();
            const missing = (results as { id: string; count: number }[])
              .filter((r) => r.count === 0)
              .map((r) => {
                const comp = competitors.find((c) => c.id === r.id);
                return comp?.page_name ?? r.id;
              });
            if (missing.length > 0) {
              setMissingBrands(missing);
              setLoading(false);
              return;
            }
          }
        }

        // 1. Try fetching from cache. The cache row is keyed only by
        // (workspace, ids, locale), so data from a different channel may
        // still be returned — if the stored kind mismatches the requested
        // channel (organic vs ads), we treat it as a miss and regenerate.
        const expectedKind: "organic" | "ads" =
          channel === "instagram" ? "organic" : "ads";
        const getRes = await fetch(
          `/api/comparisons?ids=${ids.sort().join(",")}&locale=${locale}`
        );

        if (getRes.ok) {
          const data = await getRes.json();
          const normalized = normalizeStats(data.technical_data);
          const cachedKind = normalized?.[0]?.kind ?? null;
          // Organic stats gained a `profile` field later — if the cached
          // row predates that, refresh so the profile card actually shows.
          const needsOrganicRefresh =
            cachedKind === "organic" &&
            normalized !== null &&
            normalized.some((s) => !("profile" in (s as object)));
          if (normalized && cachedKind === expectedKind && !needsOrganicRefresh) {
            setCache({
              technical_data: normalized,
              copy_analysis: data.copy_analysis,
              visual_analysis: data.visual_analysis,
              created_at: data.created_at,
              stale: data.stale,
            });
            setStats(normalized);
            if (data.copy_analysis || data.visual_analysis) {
              setAiResult({
                copywriterReport: data.copy_analysis ?? null,
                creativeDirectorReport: data.visual_analysis ?? null,
              });
            }
            setLoading(false);
            return;
          }
          // kind mismatch — fall through to POST which will overwrite the row
        }

        // 2. Not cached — generate technical data
        const postRes = await fetch("/api/comparisons", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            competitor_ids: ids,
            locale,
            channel,
            countries: [...selectedCountries],
            sections: ["technical"],
          }),
        });

        if (postRes.ok) {
          const data = await postRes.json();
          const normalized = normalizeStats(data.technical_data);
          setCache({
            technical_data: normalized,
            copy_analysis: data.copy_analysis ?? null,
            visual_analysis: data.visual_analysis ?? null,
            created_at: data.created_at ?? data.updated_at,
            stale: data.stale ?? false,
          });
          if (normalized) {
            setStats(normalized);
          }
          if (data.copy_analysis || data.visual_analysis) {
            setAiResult({
              copywriterReport: data.copy_analysis ?? null,
              creativeDirectorReport: data.visual_analysis ?? null,
            });
          }
        }
      } catch {
        // Silently fail — user sees no data
      } finally {
        setLoading(false);
      }
    },
    [locale, channel, competitors]
  );

  useEffect(() => {
    if (selected.size >= 2 && channel !== null) {
      fetchComparison(selectedIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  // Generate AI analysis when copy/visual tab is selected and not cached
  useEffect(() => {
    if (selected.size < 2 || channel === null) return;
    if (activeTab !== "copy" && activeTab !== "visual") return;

    // Check if we already have the data
    if (activeTab === "copy" && cache?.copy_analysis) {
      if (!aiResult?.copywriterReport) {
        setAiResult((prev) => ({
          copywriterReport: cache.copy_analysis,
          creativeDirectorReport: prev?.creativeDirectorReport ?? null,
        }));
      }
      return;
    }
    if (activeTab === "visual" && cache?.visual_analysis) {
      if (!aiResult?.creativeDirectorReport) {
        setAiResult((prev) => ({
          copywriterReport: prev?.copywriterReport ?? null,
          creativeDirectorReport: cache.visual_analysis,
        }));
      }
      return;
    }

    // Need to generate
    const section = activeTab === "copy" ? "copy" : "visual";
    const alreadyHas =
      section === "copy"
        ? aiResult?.copywriterReport
        : aiResult?.creativeDirectorReport;
    if (alreadyHas || aiLoading) return;

    setAiLoading(true);
    setAiError(null);

    fetch("/api/comparisons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        competitor_ids: selectedIds,
        locale,
        channel,
        sections: [section],
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setAiError(data.error ?? t("creativeAnalysis", "analysisFailed"));
          return;
        }
        const data = await res.json();
        // Update cache
        setCache((prev) => ({
          technical_data:
            prev?.technical_data ?? normalizeStats(data.technical_data),
          copy_analysis: data.copy_analysis ?? prev?.copy_analysis ?? null,
          visual_analysis:
            data.visual_analysis ?? prev?.visual_analysis ?? null,
          created_at: data.updated_at ?? data.created_at,
          stale: data.stale ?? false,
        }));
        // Update AI result
        setAiResult((prev) => ({
          copywriterReport:
            data.copy_analysis ?? prev?.copywriterReport ?? null,
          creativeDirectorReport:
            data.visual_analysis ?? prev?.creativeDirectorReport ?? null,
        }));
      })
      .catch(() => setAiError(t("creativeAnalysis", "analysisFailed")))
      .finally(() => setAiLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedKey, cache?.copy_analysis, cache?.visual_analysis]);

  // Fetch benchmark data when benchmark tab is selected
  useEffect(() => {
    if (selected.size < 2 || channel === null) return;
    if (activeTab !== "benchmark") return;
    if (benchmarkData) return; // already fetched

    setBenchmarkLoading(true);
    const source =
      channel === "meta" ? "meta"
      : channel === "google" ? "google"
      : channel === "instagram" ? "instagram"
      : undefined;
    const url = `/api/benchmarks?ids=${selectedIds.join(",")}${source ? `&source=${source}` : ""}`;
    fetch(url)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setBenchmarkData(data);
        }
      })
      .catch(() => {})
      .finally(() => setBenchmarkLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedKey]);

  // Regenerate handler
  async function handleRegenerate() {
    if (selected.size < 2) return;
    setRegenerating(true);
    setAiError(null);
    setBenchmarkData(null);

    try {
      // Delete cache
      await fetch("/api/comparisons", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_ids: selectedIds,
          locale,
        }),
      });

      // Determine which sections to regenerate
      const sections: string[] = ["technical"];
      if (cache?.copy_analysis || aiResult?.copywriterReport)
        sections.push("copy");
      if (cache?.visual_analysis || aiResult?.creativeDirectorReport)
        sections.push("visual");

      // Regenerate
      const res = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_ids: selectedIds,
          locale,
          channel,
          countries: [...selectedCountries],
          sections,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const normalized = normalizeStats(data.technical_data);
        setCache({
          technical_data: normalized,
          copy_analysis: data.copy_analysis ?? null,
          visual_analysis: data.visual_analysis ?? null,
          created_at: data.created_at,
          stale: data.stale ?? false,
        });
        if (normalized) setStats(normalized);
        setAiResult({
          copywriterReport: data.copy_analysis ?? null,
          creativeDirectorReport: data.visual_analysis ?? null,
        });
      }
    } catch {
      // Silently fail
    } finally {
      setRegenerating(false);
    }
  }

  // Scan missing brands for the selected channel
  async function handleScanMissing() {
    setScanning(true);
    const idsToScan = [...selected].filter((id) => {
      const comp = competitors.find((c) => c.id === id);
      return comp && missingBrands.includes(comp.page_name);
    });

    for (const id of idsToScan) {
      try {
        const endpoint =
          channel === "google"
            ? "/api/apify/scan-google"
            : channel === "instagram"
              ? "/api/instagram/scan"
              : "/api/apify/scan";

        const body =
          channel === "instagram"
            ? { competitor_id: id, max_posts: 30 }
            : { competitor_id: id, max_items: 200 };

        await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        // Continue with next brand
      }
    }

    setScanning(false);
    setMissingBrands([]);
    fetchingRef.current = "";
    fetchComparison(selectedIds);
  }

  // Check which channels are disabled (missing config for any selected brand)
  const selectedComps = competitors.filter((c) => selected.has(c.id));
  const googleDisabled = selectedComps.some((c) => !c.google_advertiser_id && !c.google_domain);
  const instagramDisabled = selectedComps.some((c) => !c.instagram_username);
  const channelDisabled: Record<Channel, boolean> = {
    meta: false,
    google: googleDisabled,
    instagram: instagramDisabled,
    all: googleDisabled || instagramDisabled,
  };

  // Build detailed disabled reasons per brand
  const disabledDetails: { brand: string; id: string; channel: string; reason: string }[] = [];
  if (selected.size >= 2) {
    for (const c of selectedComps) {
      if (!c.google_advertiser_id && !c.google_domain) {
        disabledDetails.push({ brand: c.page_name, id: c.id, channel: "Google Ads", reason: t("compare", "missingGoogleConfig") });
      }
      if (!c.instagram_username) {
        disabledDetails.push({ brand: c.page_name, id: c.id, channel: "Instagram", reason: t("compare", "missingInstagramConfig") });
      }
    }
  }

  // Full list of available countries
  const allCountries = COUNTRIES;

  function toggleCountry(code: string) {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    // Reset comparison state when countries change
    setChannel(null);
    setCache(null);
    setStats(null);
    setAiResult(null);
    setAiError(null);
    setMissingBrands([]);
    fetchingRef.current = "";
  }

  function selectAllCountries() {
    setSelectedCountries(new Set(allCountries.map((c) => c.code)));
    setChannel(null);
    setCache(null);
    setStats(null);
    setAiResult(null);
    setAiError(null);
    setMissingBrands([]);
    fetchingRef.current = "";
  }

  // Check which brands are missing scan coverage for selected countries
  const countryGaps = (() => {
    if (selectedCountries.size === 0 || selectedComps.length < 2) return [];
    const gaps: { brand: string; id: string; missingCountries: string[] }[] = [];
    for (const c of selectedComps) {
      const brandCountries = new Set(
        c.country?.split(",").map((s) => s.trim()).filter(Boolean) ?? []
      );
      const missing = [...selectedCountries].filter((code) => !brandCountries.has(code));
      if (missing.length > 0) {
        gaps.push({ brand: c.page_name, id: c.id, missingCountries: missing });
      }
    }
    return gaps;
  })();

  async function deleteSavedComparison(sc: SavedComparison) {
    try {
      await fetch("/api/comparisons", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_ids: sc.competitor_ids, locale: sc.locale }),
      });
      setSavedList((prev) => prev.filter((s) => s.id !== sc.id));
    } catch {
      // silent
    }
  }

  const hasResults = selected.size >= 2 && channel !== null;
  // Any selection at all means the user is mid-flow — show the reset affordance
  const hasAnySelection =
    selected.size > 0 || selectedCountries.size > 0 || channel !== null;

  // Clear every piece of comparison state and scroll to the top so the user
  // lands back on the brand selector — the "home" of this page.
  function resetToSelection() {
    setSelected(new Set());
    setSelectedCountries(new Set());
    setChannel(null);
    setCache(null);
    setStats(null);
    setAiResult(null);
    setAiError(null);
    setMissingBrands([]);
    setMisconfiguredBrands([]);
    setBenchmarkData(null);
    setActiveTab("technical");
    fetchingRef.current = "";
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Always-visible breadcrumb-style back action — lets the user exit the
          comparison at any stage (mid-selection, while loading, or after results). */}
      {hasAnySelection && (
        <button
          type="button"
          onClick={resetToSelection}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold transition-colors cursor-pointer print:hidden"
        >
          <ArrowLeft className="size-4" />
          {t("compare", "backToSelection")}
        </button>
      )}

      {/* Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {t("compare", "selectCompetitors")} ({selected.size}/3)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {competitors.map((c) => {
              const isSelected = selected.has(c.id);
              return (
                <Button
                  key={c.id}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggle(c.id)}
                  disabled={!isSelected && selected.size >= 3}
                >
                  {c.page_name}
                </Button>
              );
            })}
          </div>
          {competitors.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("compare", "noCompetitorsInWorkspace")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Country selector — visible after 2+ brands selected */}
      {selected.size >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("compare", "selectCountries")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {allCountries.map((c) => (
                <Button
                  key={c.code}
                  variant={selectedCountries.has(c.code) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleCountry(c.code)}
                  className="gap-1"
                >
                  <span className="font-medium">{c.code}</span>
                  <span className="text-muted-foreground text-[10px]">{c.name}</span>
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={selectAllCountries}
                className="text-xs text-muted-foreground hover:text-gold transition-colors underline"
              >
                {t("compare", "selectAll")}
              </button>
              {selectedCountries.size > 0 && (
                <button
                  onClick={() => { setSelectedCountries(new Set()); setChannel(null); setCache(null); setStats(null); setAiResult(null); setAiError(null); setMissingBrands([]); fetchingRef.current = ""; }}
                  className="text-xs text-muted-foreground hover:text-red-400 transition-colors underline"
                >
                  Reset
                </button>
              )}
            </div>
            {selectedCountries.size === 0 && (
              <p className="text-xs text-muted-foreground">{t("compare", "selectCountriesHint")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Country scan gaps warning */}
      {countryGaps.length > 0 && (
        <Card className="border-amber-500/30">
          <CardContent className="py-6 space-y-4">
            <div className="flex items-center gap-4">
              <AlertTriangle className="size-8 text-amber-400 shrink-0" />
              <p className="text-sm font-medium flex-1">{t("compare", "countryScanNeeded")}</p>
            </div>
            <div className="space-y-2 ml-12">
              {countryGaps.map((g) => (
                <div key={g.id} className="flex items-center gap-2 text-xs">
                  <span className="text-foreground font-medium">{g.brand}</span>
                  <span className="text-muted-foreground">— {g.missingCountries.join(", ")}</span>
                  <a href={`/competitors/${g.id}/edit?from=compare`} className="ml-auto shrink-0">
                    <Button variant="outline" size="sm" className="text-xs h-6 px-2 cursor-pointer">
                      {t("compare", "addCountryAndScan")}
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Channel selector — visible after 2+ brands + countries selected */}
      {selected.size >= 2 && selectedCountries.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("compare", "channel")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              {/* Paid channels */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t("compare", "channelPaid")}</span>
                {([
                  { key: "meta" as const, label: "Meta Ads", icon: <MetaIcon className="size-4" /> },
                  { key: "google" as const, label: "Google Ads", icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" /><path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" /></svg> },
                ] as const).map((ch) => {
                  const disabled = channelDisabled[ch.key];
                  return (
                    <Button
                      key={ch.key}
                      variant={channel === ch.key ? "default" : "outline"}
                      size="sm"
                      onClick={() => !disabled && switchChannel(ch.key)}
                      disabled={disabled}
                      className={cn("gap-1.5", disabled && "opacity-40 cursor-not-allowed")}
                    >
                      {ch.icon}
                      {ch.label}
                    </Button>
                  );
                })}
              </div>

              <div className="h-6 w-px bg-border hidden sm:block" />

              {/* Organic channels */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t("compare", "channelOrganic")}</span>
                {(() => {
                  const disabled = channelDisabled.instagram;
                  return (
                    <Button
                      variant={channel === "instagram" ? "default" : "outline"}
                      size="sm"
                      onClick={() => !disabled && switchChannel("instagram")}
                      disabled={disabled}
                      className={cn("gap-1.5", disabled && "opacity-40 cursor-not-allowed")}
                    >
                      <InstagramIcon className="size-4" />
                      Instagram
                    </Button>
                  );
                })()}
              </div>

              <div className="h-6 w-px bg-border hidden sm:block" />

              {/* All channels */}
              {(() => {
                const disabled = channelDisabled.all;
                return (
                  <Button
                    variant={channel === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => !disabled && switchChannel("all")}
                    disabled={disabled}
                    className={cn("gap-1.5", disabled && "opacity-40 cursor-not-allowed")}
                  >
                    {t("compare", "allChannels")}
                  </Button>
                );
              })()}
            </div>
            {/* Detailed disabled reasons per brand (collapsible) */}
            {disabledDetails.length > 0 && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5">
                <button
                  onClick={() => setConfigOpen(!configOpen)}
                  className="w-full flex items-center gap-2 p-3 text-xs font-medium text-amber-400 cursor-pointer hover:bg-amber-500/10 transition-colors rounded-md"
                >
                  <ChevronDown className={cn("size-3.5 transition-transform", !configOpen && "-rotate-90")} />
                  {t("compare", "configRequired")}
                </button>
                {configOpen && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {disabledDetails.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-foreground font-medium">{d.brand}</span>
                        <span className="text-muted-foreground">— {d.channel}: {d.reason}</span>
                        <a
                          href={`/competitors/${d.id}/edit?from=compare`}
                          className="ml-auto shrink-0"
                        >
                          <Button variant="outline" size="sm" className="text-xs h-6 px-2 cursor-pointer">
                            {t("compare", "goToEdit")}
                          </Button>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {channel === null && (
              <p className="text-xs text-muted-foreground">{t("compare", "selectChannel")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scanning overlay */}
      {scanning && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Card className="w-80">
            <CardContent className="py-8 text-center space-y-4">
              <Loader2 className="size-8 animate-spin text-gold mx-auto" />
              <p className="text-sm font-medium">{t("compare", "scanningBrands")}</p>
              <p className="text-xs text-muted-foreground">{t("compare", "scanningWait")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Missing data prompt — config OK but no scan done */}
      {missingBrands.length > 0 && !scanning && (
        <Card className="border-amber-500/30">
          <CardContent className="py-6 text-center space-y-4">
            <AlertTriangle className="size-8 text-amber-400 mx-auto" />
            <div>
              <p className="text-sm font-medium">
                {t("compare", "noDataForChannel")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {missingBrands.join(", ")} — {channel === "google" ? "Google Ads" : channel === "instagram" ? "Instagram" : "Meta Ads"}
              </p>
            </div>
            <Button onClick={handleScanMissing} className="gap-2">
              <RefreshCw className="size-4" />
              {t("compare", "scanNowAndCompare")}
            </Button>
          </CardContent>
        </Card>
      )}

      {selected.size < 2 && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("compare", "selectAtLeast2")}
          </p>

          {/* Saved comparisons */}
          {savedList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("compare", "savedComparisons")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {savedList.map((sc) => {
                  const brandNames = sc.competitor_ids
                    .map((cid) => competitors.find((c) => c.id === cid)?.page_name ?? cid.slice(0, 8))
                    .join(" vs ");
                  return (
                    <div
                      key={sc.id}
                      className="flex items-center gap-2 p-3 rounded-md border border-border hover:border-gold/40 transition-colors"
                    >
                      <button
                        onClick={() => {
                          setSelected(new Set(sc.competitor_ids));
                          setSelectedCountries(new Set(sc.countries ?? []));
                          setChannel(isChannel(sc.channel) ? sc.channel : null);
                          setCache(null);
                          setStats(null);
                          setAiResult(null);
                          setAiError(null);
                          setMissingBrands([]);
                          setBenchmarkData(null);
                          fetchingRef.current = "";
                        }}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="text-sm font-medium truncate">{brandNames}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span className="text-gold/70">{channelLabel(sc.channel, t)}</span>
                          {sc.countries && sc.countries.length > 0 && (
                            <>
                              <span>·</span>
                              <span className="truncate">{sc.countries.join(", ")}</span>
                            </>
                          )}
                          <span>·</span>
                          {formatTimestamp(sc.updated_at, locale)}
                          {sc.stale && (
                            <span className="ml-1 text-amber-400">
                              ⚠ {t("compare", "staleShort")}
                            </span>
                          )}
                        </p>
                      </button>
                      <button
                        onClick={() => deleteSavedComparison(sc)}
                        className="size-8 rounded-md border border-border hover:bg-muted hover:border-red-400/40 grid place-items-center text-muted-foreground hover:text-red-400 transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Timestamp + Stale Warning + Regenerate */}
      {hasResults && cache && (
        <div className="space-y-2">
          {cache.stale && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
              <AlertTriangle className="size-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300 flex-1">
                {t("compare", "staleWarning")}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500/30 text-amber-400 hover:bg-amber-500/20 shrink-0"
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                {regenerating ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="size-3.5 mr-1.5" />
                )}
                {regenerating
                  ? t("compare", "regenerating")
                  : t("compare", "regenerate")}
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between print:hidden">
            <p className="text-xs text-muted-foreground">
              {t("compare", "generatedAt")}{" "}
              {formatTimestamp(cache.created_at, locale)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => window.print()}
              >
                <Printer className="size-3 mr-1.5" />
                {t("compare", "print")}
              </Button>
              {!cache.stale && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                >
                  {regenerating ? (
                    <Loader2 className="size-3 animate-spin mr-1.5" />
                  ) : (
                    <RefreshCw className="size-3 mr-1.5" />
                  )}
                  {regenerating
                    ? t("compare", "regenerating")
                    : t("compare", "regenerate")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Print cover — hidden on screen, becomes the first page when printing */}
      {hasResults && (
        <div className="hidden print:flex print-cover flex-col items-center justify-center min-h-[260mm] gap-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="AISCAN" className="h-24" />
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              {t("compare", "printCoverTitle")}
            </p>
            <h1 className="text-3xl font-serif tracking-tight text-foreground">
              {competitors
                .filter((c) => selected.has(c.id))
                .map((c) => c.page_name)
                .join(" · ")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {channel === "instagram"
                ? "Instagram · Organic"
                : channel === "meta"
                  ? "Meta Ads · Paid"
                  : channel === "google"
                    ? "Google Ads · Paid"
                    : channel === "all"
                      ? t("compare", "allChannels")
                      : ""}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString(
              locale === "it" ? "it-IT" : "en-GB",
              { day: "2-digit", month: "long", year: "numeric" }
            )}
          </p>
        </div>
      )}

      {/* Tabs */}
      {hasResults && (
        <>
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1 print:hidden">
            <TabButton
              active={activeTab === "technical"}
              onClick={() => setActiveTab("technical")}
              icon={<BarChart3 className="size-3.5" />}
              label={t("compare", "tabTechnical")}
            />
            <TabButton
              active={activeTab === "copy"}
              onClick={() => setActiveTab("copy")}
              icon={<Pen className="size-3.5" />}
              label={t("compare", "tabCopy")}
              loading={aiLoading && activeTab === "copy"}
            />
            <TabButton
              active={activeTab === "visual"}
              onClick={() => setActiveTab("visual")}
              icon={<Palette className="size-3.5" />}
              label={t("compare", "tabVisual")}
              loading={aiLoading && activeTab === "visual"}
            />
            <TabButton
              active={activeTab === "benchmark"}
              onClick={() => setActiveTab("benchmark")}
              icon={<Target className="size-3.5" />}
              label={t("compare", "tabBenchmark")}
            />
          </div>

          {/* Technical Tab — branch on stats kind (ads vs organic) */}
          {activeTab === "technical" &&
            (loading || regenerating ? (
              <LoadingState text={t("compare", "generating")} />
            ) : stats && stats.length >= 2 ? (
              stats[0].kind === "organic" ? (
                <OrganicTechnicalView stats={stats as OrganicCompStats[]} t={t} />
              ) : (
                <AdsTechnicalView stats={stats as AdsCompStats[]} t={t} />
              )
            ) : null)}
          {/* Copy Tab */}
          {activeTab === "copy" &&
            (aiLoading || regenerating ? (
              <LoadingState text={t("compare", "generatingAi")} />
            ) : aiError ? (
              <ErrorState text={aiError} />
            ) : aiResult?.copywriterReport ? (
              <AnalysisReport
                result={aiResult}
                mode="copywriter"
                onClose={() => setActiveTab("technical")}
              />
            ) : null)}

          {/* Visual Tab */}
          {activeTab === "visual" &&
            (aiLoading || regenerating ? (
              <LoadingState text={t("compare", "generatingAi")} />
            ) : aiError ? (
              <ErrorState text={aiError} />
            ) : aiResult?.creativeDirectorReport ? (
              <AnalysisReport
                result={aiResult}
                mode="creativeDirector"
                onClose={() => setActiveTab("technical")}
              />
            ) : null)}

          {/* Benchmark Tab — branch on kind (ads vs organic) */}
          {activeTab === "benchmark" &&
            (benchmarkLoading || regenerating ? (
              <LoadingState text={t("compare", "generating")} />
            ) : benchmarkData?.kind === "organic" ? (
              benchmarkData.totals.totalPosts > 0 ? (
                <OrganicBenchmarkCharts data={benchmarkData} t={t} />
              ) : (
                <div className="py-16 text-center text-muted-foreground text-sm">
                  {t("benchmarks", "noData")}
                </div>
              )
            ) : benchmarkData?.kind === "ads" ? (
              benchmarkData.totals.totalAds > 0 ? (
                <BenchmarkCharts data={benchmarkData} t={t} />
              ) : (
                <div className="py-16 text-center text-muted-foreground text-sm">
                  {t("benchmarks", "noData")}
                </div>
              )
            ) : null)}

          {/* Bottom "back" action — same affordance at the end of the scroll */}
          <div className="flex justify-center pt-6 print:hidden">
            <Button variant="outline" size="sm" onClick={resetToSelection} className="gap-1.5">
              <ArrowLeft className="size-3.5" /> {t("compare", "backToSelection")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  loading,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors",
        active
          ? "bg-gold text-gold-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="py-16 text-center space-y-3">
      <Loader2 className="size-6 animate-spin mx-auto text-gold" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function ErrorState({ text }: { text: string }) {
  return (
    <div className="py-16 text-center space-y-3">
      <AlertCircle className="size-6 mx-auto text-red-400" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function AdsTechnicalView({
  stats,
  t,
}: {
  stats: AdsCompStats[];
  t: (s: string, k: string) => string;
}) {
  return (
    <div className="space-y-4">
      <CompareTable
        label={t("compare", "totalAds")}
        stats={stats}
        render={(s) => String(s.totalAds)}
      />
      <CompareTable
        label={t("compare", "activeAds")}
        stats={stats}
        render={(s) => String(s.activeAds)}
        highlight
      />
      <ObjectiveCard stats={stats} t={t} />
      <CompareTable
        label={t("compare", "formatMix")}
        stats={stats}
        render={(s) => {
          const total = s.imageCount + s.videoCount;
          if (total === 0) return "—";
          const imgPct = Math.round((s.imageCount / total) * 100);
          return `${imgPct}% img · ${100 - imgPct}% video`;
        }}
      />
      <CompareTable
        label={t("compare", "topCta")}
        stats={stats}
        render={(s) =>
          s.topCtas.slice(0, 3).map((c) => c.name).join(", ") || "—"
        }
      />
      <CompareTable
        label={t("compare", "platformsLabel")}
        stats={stats}
        render={(s) => s.platforms.map((p) => p.name).join(", ") || "—"}
      />
      <CompareTable
        label={t("compare", "avgDuration")}
        stats={stats}
        render={(s) =>
          s.avgDuration > 0
            ? `${s.avgDuration} ${t("compare", "avgDurationDays")}`
            : "—"
        }
      />
      <CompareTable
        label={t("compare", "avgCopyLength")}
        stats={stats}
        render={(s) =>
          s.avgCopyLength > 0
            ? `${s.avgCopyLength} ${t("compare", "avgCopyChars")}`
            : "—"
        }
      />
      <CompareTable
        label={t("compare", "refreshRate")}
        stats={stats}
        render={(s) =>
          s.adsPerWeek > 0
            ? `${s.adsPerWeek} ${t("compare", "adsPerWeek")}`
            : "—"
        }
        highlight
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("compare", "latestAds")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "grid gap-4",
              stats.length === 2 ? "grid-cols-2" : "grid-cols-3"
            )}
          >
            {stats.map((s) => (
              <div key={s.id} className="space-y-3">
                <p className="text-xs font-medium text-gold">{s.name}</p>
                {s.latestAds.slice(0, 3).map((ad) => (
                  <a
                    key={ad.ad_archive_id}
                    href={`https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-border overflow-hidden hover:border-gold/40 transition-colors"
                  >
                    {ad.image_url && !ad.image_url.includes("/render_ad/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ad.image_url}
                        alt=""
                        className="w-full aspect-video object-cover"
                      />
                    ) : (
                      <div className="aspect-video bg-muted grid place-items-center text-xs text-muted-foreground">
                        {ad.headline ?? "Ad"}
                      </div>
                    )}
                    {ad.headline && (
                      <p className="p-2 text-xs line-clamp-1">{ad.headline}</p>
                    )}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OrganicProfileCard({
  stat,
  t,
}: {
  stat: OrganicCompStats;
  t: (s: string, k: string) => string;
}) {
  const p = stat.profile;
  const handle = stat.instagramUsername ?? p?.fullName ?? stat.name;
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start gap-3">
        {p?.profilePicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.profilePicUrl}
            alt={stat.name}
            className="size-12 rounded-full object-cover border border-border shrink-0"
          />
        ) : (
          <div className="size-12 rounded-full bg-muted border border-border shrink-0 grid place-items-center text-muted-foreground font-semibold">
            {stat.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gold truncate">{stat.name}</p>
          {stat.instagramUsername && (
            <a
              href={`https://www.instagram.com/${stat.instagramUsername}/`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground truncate block"
            >
              @{handle}
            </a>
          )}
          {p?.verified && (
            <span className="text-[10px] text-blue-400">✓ {t("compare", "verified")}</span>
          )}
        </div>
      </div>

      {p ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <ProfileStat
              label={t("compare", "followers")}
              value={p.followersCount != null ? formatNumber(p.followersCount) : "—"}
            />
            <ProfileStat
              label={t("compare", "following")}
              value={p.followsCount != null ? formatNumber(p.followsCount) : "—"}
            />
            <ProfileStat
              label={t("compare", "postsTotal")}
              value={p.postsCount != null ? formatNumber(p.postsCount) : "—"}
            />
          </div>
          {p.businessCategoryName && (
            <p className="text-[11px] text-muted-foreground text-center">
              {p.businessCategoryName}
            </p>
          )}
          {p.biography && (
            <p className="text-xs text-muted-foreground line-clamp-3 border-t border-border pt-2">
              {p.biography}
            </p>
          )}
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {t("compare", "profileNotFetched")}
        </p>
      )}
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
    </div>
  );
}

function OrganicTechnicalView({
  stats,
  t,
}: {
  stats: OrganicCompStats[];
  t: (s: string, k: string) => string;
}) {
  // Hide the profile banner entirely if no brand has profile data yet —
  // keeps the UI clean for brands scanned before profile scraping existed.
  const anyProfile = stats.some((s) => s.profile);

  return (
    <div className="space-y-4">
      {anyProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t("compare", "profileOverview")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "grid gap-4",
                stats.length === 2 ? "grid-cols-2" : "grid-cols-3"
              )}
            >
              {stats.map((s) => (
                <OrganicProfileCard key={s.id} stat={s} t={t} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <CompareTable
        label={t("compare", "totalPosts")}
        stats={stats}
        render={(s) => String(s.totalPosts)}
        highlight
      />
      <CompareTable
        label={t("compare", "postsPerWeek")}
        stats={stats}
        render={(s) =>
          s.postsPerWeek > 0
            ? `${s.postsPerWeek} ${t("compare", "postsPerWeekUnit")}`
            : "—"
        }
        highlight
      />
      <CompareTable
        label={t("compare", "formatMix")}
        stats={stats}
        render={(s) => {
          const total = s.imageCount + s.videoCount + s.reelCount;
          if (total === 0) return "—";
          const img = Math.round((s.imageCount / total) * 100);
          const vid = Math.round((s.videoCount / total) * 100);
          const reel = 100 - img - vid;
          return `${img}% img · ${vid}% video · ${reel}% reel`;
        }}
      />
      <CompareTable
        label={t("compare", "avgLikes")}
        stats={stats}
        render={(s) => (s.avgLikes > 0 ? formatNumber(s.avgLikes) : "—")}
      />
      <CompareTable
        label={t("compare", "avgComments")}
        stats={stats}
        render={(s) =>
          s.avgComments > 0 ? formatNumber(s.avgComments) : "—"
        }
      />
      <CompareTable
        label={t("compare", "avgViews")}
        stats={stats}
        render={(s) => (s.avgViews > 0 ? formatNumber(s.avgViews) : "—")}
      />
      <CompareTable
        label={t("compare", "topHashtags")}
        stats={stats}
        render={(s) =>
          s.topHashtags
            .slice(0, 5)
            .map((h) => `#${h.name}`)
            .join(" ") || "—"
        }
      />
      <CompareTable
        label={t("compare", "avgCaptionLength")}
        stats={stats}
        render={(s) =>
          s.avgCaptionLength > 0
            ? `${s.avgCaptionLength} ${t("compare", "avgCopyChars")}`
            : "—"
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {t("compare", "latestPosts")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "grid gap-4",
              stats.length === 2 ? "grid-cols-2" : "grid-cols-3"
            )}
          >
            {stats.map((s) => (
              <div key={s.id} className="space-y-3">
                <p className="text-xs font-medium text-gold">{s.name}</p>
                {s.latestPosts.slice(0, 3).map((post) => (
                  <a
                    key={post.post_id}
                    href={post.post_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-border overflow-hidden hover:border-gold/40 transition-colors"
                  >
                    {post.display_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.display_url}
                        alt=""
                        className="w-full aspect-square object-cover"
                      />
                    ) : (
                      <div className="aspect-square bg-muted grid place-items-center text-xs text-muted-foreground">
                        Post
                      </div>
                    )}
                    <div className="p-2 space-y-1">
                      {post.caption && (
                        <p className="text-xs line-clamp-2">{post.caption}</p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>♥ {formatNumber(post.likes)}</span>
                        <span>💬 {formatNumber(post.comments)}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ObjectiveCard({
  stats,
  t,
}: {
  stats: AdsCompStats[];
  t: (s: string, k: string) => string;
}) {
  const OBJECTIVE_LABELS: Record<string, Record<string, string>> = {
    sales: { it: "Vendite / Conversioni", en: "Sales / Conversions" },
    traffic: { it: "Traffico", en: "Traffic" },
    awareness: { it: "Notoriet\u00E0 / Awareness", en: "Awareness" },
    app_install: { it: "Installazione app", en: "App Install" },
    engagement: { it: "Interazione", en: "Engagement" },
    lead_generation: { it: "Lead Generation", en: "Lead Generation" },
    unknown: { it: "Non determinabile", en: "Not determinable" },
  };

  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-amber-500/30 overflow-hidden">
      <div className="bg-amber-500/10 px-4 py-2 flex items-center gap-2">
        <Target className="size-3.5 text-amber-400" />
        <p className="text-xs font-medium text-foreground">
          {t("compare", "estimatedObjective")}
        </p>
        <span className="text-[9px] text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 uppercase tracking-wider">
          {t("compare", "estimate")}
        </span>
      </div>
      <div
        className={cn(
          "grid divide-x divide-border",
          stats.length === 2 ? "grid-cols-2" : "grid-cols-3"
        )}
      >
        {stats.map((s) => {
          const obj = s.objectiveInference;
          const label =
            OBJECTIVE_LABELS[obj.objective]?.it ?? obj.objective;
          const isExpanded = expanded === s.id;
          return (
            <div key={s.id} className="px-4 py-3">
              <p className="text-[10px] text-muted-foreground mb-1 truncate">
                {s.name}
              </p>
              <p className="text-sm font-medium text-amber-400">{label}</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${obj.confidence}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {obj.confidence}%
                </span>
              </div>
              <button
                onClick={() => setExpanded(isExpanded ? null : s.id)}
                className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info className="size-3" />
                {isExpanded
                  ? t("compare", "hideSignals")
                  : t("compare", "showSignals")}
              </button>
              {isExpanded && (
                <ul className="mt-2 space-y-1">
                  {obj.signals.map((signal, i) => (
                    <li
                      key={i}
                      className="text-[10px] text-muted-foreground flex items-start gap-1.5"
                    >
                      <span className="text-amber-400 mt-0.5">
                        &bull;
                      </span>
                      {signal}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <div className="bg-amber-500/5 px-4 py-2 border-t border-amber-500/20">
        <p className="text-[9px] text-amber-400/70 leading-relaxed">
          {t("compare", "objectiveDisclaimer")}
        </p>
      </div>
    </div>
  );
}

function CompareTable<T extends { id: string; name: string }>({
  label,
  stats,
  render,
  highlight,
}: {
  label: string;
  stats: T[];
  render: (s: T) => string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border overflow-hidden",
        highlight && "border-gold/20"
      )}
    >
      <div className="bg-muted/30 px-4 py-2">
        <p className="text-xs font-medium text-foreground">{label}</p>
      </div>
      <div
        className={cn(
          "grid divide-x divide-border",
          stats.length === 2 ? "grid-cols-2" : "grid-cols-3"
        )}
      >
        {stats.map((s) => (
          <div key={s.id} className="px-4 py-3">
            <p className="text-[10px] text-muted-foreground mb-1 truncate">
              {s.name}
            </p>
            <p
              className={cn(
                "text-sm font-medium",
                highlight && "text-gold"
              )}
            >
              {render(s)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrganicBenchmarkCharts({
  data,
  t,
}: {
  data: OrganicBenchmarkData;
  t: (section: string, key: string) => string;
}) {
  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <BenchmarkStat
          label={t("compare", "totalPosts")}
          value={formatNumber(data.totals.totalPosts)}
        />
        <BenchmarkStat
          label={t("compare", "avgLikes")}
          value={formatNumber(data.totals.avgLikes)}
        />
        <BenchmarkStat
          label={t("compare", "avgComments")}
          value={formatNumber(data.totals.avgComments)}
        />
        <BenchmarkStat
          label={t("compare", "avgViews")}
          value={formatNumber(data.totals.avgViews)}
        />
        <BenchmarkStat
          label={t("compare", "avgCaptionLength")}
          value={`${data.totals.avgCaptionLength} chr`}
        />
      </div>

      {/* Posts per competitor */}
      <Card>
        <CardHeader>
          <CardTitle>{t("benchmarks", "postsVolumePerCompetitor")}</CardTitle>
        </CardHeader>
        <CardContent>
          <HorizontalBarChart
            data={data.postsByCompetitor}
            dataKey="posts"
            label={t("compare", "totalPosts")}
          />
        </CardContent>
      </Card>

      {/* Format mix per brand */}
      <Card>
        <CardHeader>
          <CardTitle>{t("benchmarks", "globalFormatMix")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`grid gap-6 ${data.formatMixByCompetitor.length <= 2 ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}
          >
            {data.formatMixByCompetitor.map((entry) => (
              <div key={entry.competitor} className="text-center">
                <p className="text-xs font-medium text-gold mb-2">
                  {entry.competitor}
                </p>
                <FormatPieChart data={entry.data} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top hashtags */}
      {data.topHashtags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("compare", "topHashtags")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.topHashtags}
              dataKey="count"
              label={t("benchmarks", "adsLabel")}
            />
          </CardContent>
        </Card>
      )}

      {/* Engagement: likes / comments / views per competitor */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("compare", "avgLikes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.avgLikesByCompetitor}
              dataKey="likes"
              label={t("compare", "avgLikes")}
              color="#c9a44d"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("compare", "avgComments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.avgCommentsByCompetitor}
              dataKey="comments"
              label={t("compare", "avgComments")}
              color="#6b8e6b"
            />
          </CardContent>
        </Card>
        {data.avgViewsByCompetitor.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("compare", "avgViews")}</CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalBarChart
                data={data.avgViewsByCompetitor}
                dataKey="views"
                label={t("compare", "avgViews")}
                color="#5b7ea3"
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cadence + caption length */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("compare", "postsPerWeek")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.postsPerWeekByCompetitor}
              dataKey="postsPerWeek"
              label={t("compare", "postsPerWeekUnit")}
              color="#a06b5b"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("compare", "avgCaptionLength")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.avgCaptionLengthByCompetitor}
              dataKey="chars"
              label={t("benchmarks", "charsAxisLabel")}
              color="#8a6bb0"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BenchmarkStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
          {label}
        </div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function BenchmarkCharts({
  data,
  t,
}: {
  data: BenchmarkData;
  t: (section: string, key: string) => string;
}) {
  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <BenchmarkStat label={t("benchmarks", "totalAds")} value={formatNumber(data.totals.totalAds)} />
        <BenchmarkStat label={t("benchmarks", "activeAds")} value={formatNumber(data.totals.activeAds)} />
        <BenchmarkStat label={t("benchmarks", "avgCampaignDuration")} value={`${data.totals.avgDuration}gg`} />
        <BenchmarkStat label={t("benchmarks", "avgCopyLength")} value={`${data.totals.avgCopyLength} chr`} />
        <BenchmarkStat label={t("benchmarks", "aiGeneratedPercent")} value={`${data.totals.aiGeneratedPercent}%`} />
        <BenchmarkStat label={t("benchmarks", "advantagePlusPercent")} value={`${data.totals.advantagePlusPercent}%`} />
      </div>

      {/* Volume */}
      <Card>
        <CardHeader><CardTitle>{t("benchmarks", "volumePerCompetitor")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descVolume")}</p>
          <VolumeChart data={data.volumeByCompetitor} />
        </CardContent>
      </Card>

      {/* Format mix per brand */}
      <Card>
        <CardHeader><CardTitle>{t("benchmarks", "globalFormatMix")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descFormatPie")}</p>
          <div className={`grid gap-6 ${data.formatMixByCompetitor.length <= 2 ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {data.formatMixByCompetitor.map((entry) => (
              <div key={entry.competitor} className="text-center">
                <p className="text-xs font-medium text-gold mb-2">{entry.competitor}</p>
                <FormatPieChart data={entry.data} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Format per competitor (stacked) */}
      <Card>
        <CardHeader><CardTitle>{t("benchmarks", "formatPerCompetitor")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descFormatStacked")}</p>
          <FormatStackedChart data={data.formatByCompetitor} />
        </CardContent>
      </Card>

      {/* CTA */}
      <Card>
        <CardHeader><CardTitle>{t("benchmarks", "topCta")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descTopCta")}</p>
          <HorizontalBarChart data={data.topCtas} dataKey="count" label={t("benchmarks", "adsLabel")} />
        </CardContent>
      </Card>

      {/* Platform distribution per brand */}
      <Card>
        <CardHeader><CardTitle>{t("benchmarks", "platformDistribution")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descPlatform")}</p>
          <div className={`grid gap-6 ${data.platformByCompetitor.length <= 2 ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {data.platformByCompetitor.map((entry) => (
              <div key={entry.competitor} className="text-center">
                <p className="text-xs font-medium text-gold mb-2">{entry.competitor}</p>
                <PlatformChart data={entry.data} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Duration + Copy length + Refresh rate */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t("benchmarks", "avgCampaignDurationChart")}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descDuration")}</p>
            <HorizontalBarChart data={data.avgDurationByCompetitor} dataKey="days" label={t("benchmarks", "daysAxisLabel")} color="#5b7ea3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("benchmarks", "avgCopyLengthChart")}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descCopyLength")}</p>
            <HorizontalBarChart data={data.avgCopyLengthByCompetitor} dataKey="chars" label={t("benchmarks", "charsAxisLabel")} color="#6b8e6b" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("benchmarks", "refreshRateChart")}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descRefreshRate")}</p>
            <HorizontalBarChart data={data.refreshRate} dataKey="adsPerWeek" label={t("benchmarks", "adsPerWeekAxisLabel")} color="#a06b5b" />
          </CardContent>
        </Card>
      </div>

      {/* AI-generated + Advantage+ + Variants */}
      {(data.aiGeneratedByCompetitor.length > 0 || data.advantagePlusByCompetitor.length > 0 || data.avgVariantsByCompetitor.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-3">
          {data.aiGeneratedByCompetitor.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t("benchmarks", "aiGeneratedChart")}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descAiGenerated")}</p>
                <HorizontalBarChart data={data.aiGeneratedByCompetitor} dataKey="percent" label="%" color="#8a6bb0" />
              </CardContent>
            </Card>
          )}
          {data.advantagePlusByCompetitor.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t("benchmarks", "advantagePlusChart")}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descAdvantagePlus")}</p>
                <HorizontalBarChart data={data.advantagePlusByCompetitor} dataKey="percent" label="%" color="#5ba09b" />
              </CardContent>
            </Card>
          )}
          {data.avgVariantsByCompetitor.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t("benchmarks", "avgVariantsChart")}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descAvgVariants")}</p>
                <HorizontalBarChart data={data.avgVariantsByCompetitor} dataKey="variants" label={t("benchmarks", "variantsLabel")} color="#a06b5b" />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Top targeted countries */}
      {data.topTargetedCountries.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t("benchmarks", "topTargetedCountries")}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descTopCountries")}</p>
            <HorizontalBarChart data={data.topTargetedCountries} dataKey="count" label={t("benchmarks", "adsLabel")} color="#6b8e6b" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
