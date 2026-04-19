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
} from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { MetaIcon } from "@/components/ui/meta-icon";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { AnalysisReport } from "./analysis-report";
import type { CreativeAnalysisResult } from "@/lib/ai/creative-analysis";
import type { MaitCompetitor } from "@/types";

type Tab = "technical" | "copy" | "visual";
type Channel = "all" | "meta" | "google" | "instagram";

interface CompStats {
  id: string;
  name: string;
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
  stale: boolean;
  created_at: string;
  updated_at: string;
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
    setChannel(null);
    setCache(null);
    setStats(null);
    setAiResult(null);
    setAiError(null);
    setMissingBrands([]);
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

        // 1. Try fetching from cache
        const getRes = await fetch(
          `/api/comparisons?ids=${ids.sort().join(",")}&locale=${locale}`
        );

        if (getRes.ok) {
          const data = await getRes.json();
          setCache({
            technical_data: data.technical_data,
            copy_analysis: data.copy_analysis,
            visual_analysis: data.visual_analysis,
            created_at: data.created_at,
            stale: data.stale,
          });
          if (data.technical_data) {
            setStats(data.technical_data);
          }
          if (data.copy_analysis || data.visual_analysis) {
            setAiResult({
              copywriterReport: data.copy_analysis ?? null,
              creativeDirectorReport: data.visual_analysis ?? null,
            });
          }
          setLoading(false);
          return;
        }

        // 2. Not cached — generate technical data
        const postRes = await fetch("/api/comparisons", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            competitor_ids: ids,
            locale,
            channel,
            sections: ["technical"],
          }),
        });

        if (postRes.ok) {
          const data = await postRes.json();
          setCache({
            technical_data: data.technical_data,
            copy_analysis: data.copy_analysis ?? null,
            visual_analysis: data.visual_analysis ?? null,
            created_at: data.created_at ?? data.updated_at,
            stale: data.stale ?? false,
          });
          if (data.technical_data) {
            setStats(data.technical_data);
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
          technical_data: prev?.technical_data ?? data.technical_data,
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

  // Regenerate handler
  async function handleRegenerate() {
    if (selected.size < 2) return;
    setRegenerating(true);
    setAiError(null);

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
          sections,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCache({
          technical_data: data.technical_data,
          copy_analysis: data.copy_analysis ?? null,
          visual_analysis: data.visual_analysis ?? null,
          created_at: data.created_at,
          stale: data.stale ?? false,
        });
        if (data.technical_data) setStats(data.technical_data);
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

  // Check country mismatch between selected brands
  const countryMismatch = (() => {
    if (selectedComps.length < 2) return null;
    const countrySets = selectedComps.map((c) => {
      const raw = c.country?.split(",").map((s) => s.trim()).filter(Boolean).sort().join(", ");
      return raw || null;
    });
    const allSame = countrySets.every((cs) => cs === countrySets[0]);
    if (allSame) return null;
    return selectedComps.map((c) => ({
      name: c.page_name,
      countries: c.country?.split(",").map((s) => s.trim()).filter(Boolean).sort().join(", ") || null,
    }));
  })();

  const hasResults = selected.size >= 2 && channel !== null;

  return (
    <div className="space-y-6">
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

      {/* Channel selector — only visible after 2+ brands selected */}
      {selected.size >= 2 && (
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
            {/* Detailed disabled reasons per brand */}
            {disabledDetails.length > 0 && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 space-y-1.5">
                <p className="text-xs font-medium text-amber-400">{t("compare", "configRequired")}</p>
                {disabledDetails.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-foreground font-medium">{d.brand}</span>
                    <span className="text-muted-foreground">— {d.channel}: {d.reason}</span>
                    <a
                      href={`/competitors/${d.id}/edit?from=compare`}
                      className="ml-auto shrink-0"
                    >
                      <Button variant="outline" size="sm" className="text-xs h-6 px-2 cursor-pointer hover:bg-gold/25 hover:text-gold hover:border-gold">
                        {t("compare", "goToEdit")}
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
            )}
            {countryMismatch && (
              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  <Info className="size-3.5 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-400">{t("compare", "countryMismatch")}</p>
                </div>
                {countryMismatch.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs ml-5.5">
                    <span className="text-foreground font-medium">{b.name}</span>
                    <span className="text-muted-foreground">— {t("compare", "countryMismatchDetail")} {b.countries ?? t("compare", "noCountrySet")}</span>
                  </div>
                ))}
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
          {savedComparisons.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("compare", "savedComparisons")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {savedComparisons.map((sc) => {
                  const brandNames = sc.competitor_ids
                    .map((cid) => competitors.find((c) => c.id === cid)?.page_name ?? cid.slice(0, 8))
                    .join(" vs ");
                  return (
                    <button
                      key={sc.id}
                      onClick={() => {
                        const newSet = new Set(sc.competitor_ids);
                        setSelected(newSet);
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-md border border-border hover:border-gold/40 transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{brandNames}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span className="text-gold/70">Meta Ads</span>
                          <span>·</span>
                          {formatTimestamp(sc.updated_at, locale)}
                          {sc.stale && (
                            <span className="ml-1 text-amber-400">
                              ⚠ {t("compare", "staleShort")}
                            </span>
                          )}
                        </p>
                      </div>
                    </button>
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {t("compare", "generatedAt")}{" "}
              {formatTimestamp(cache.created_at, locale)}
            </p>
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
      )}

      {/* Tabs */}
      {hasResults && (
        <>
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
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
          </div>

          {/* Technical Tab */}
          {activeTab === "technical" &&
            (loading || regenerating ? (
              <LoadingState text={t("compare", "generating")} />
            ) : stats && stats.length >= 2 ? (
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

                {/* Estimated Campaign Objective */}
                <ObjectiveCard stats={stats} t={t} />

                <CompareTable
                  label={t("compare", "formatMix")}
                  stats={stats}
                  render={(s) => {
                    const total = s.imageCount + s.videoCount;
                    if (total === 0) return "\u2014";
                    const imgPct = Math.round(
                      (s.imageCount / total) * 100
                    );
                    return `${imgPct}% img \u00B7 ${100 - imgPct}% video`;
                  }}
                />
                <CompareTable
                  label={t("compare", "topCta")}
                  stats={stats}
                  render={(s) =>
                    s.topCtas
                      .slice(0, 3)
                      .map((c) => c.name)
                      .join(", ") || "\u2014"
                  }
                />
                <CompareTable
                  label={t("compare", "platformsLabel")}
                  stats={stats}
                  render={(s) =>
                    s.platforms.map((p) => p.name).join(", ") || "\u2014"
                  }
                />
                <CompareTable
                  label={t("compare", "avgDuration")}
                  stats={stats}
                  render={(s) =>
                    s.avgDuration > 0
                      ? `${s.avgDuration} ${t("compare", "avgDurationDays")}`
                      : "\u2014"
                  }
                />
                <CompareTable
                  label={t("compare", "avgCopyLength")}
                  stats={stats}
                  render={(s) =>
                    s.avgCopyLength > 0
                      ? `${s.avgCopyLength} ${t("compare", "avgCopyChars")}`
                      : "\u2014"
                  }
                />
                <CompareTable
                  label={t("compare", "refreshRate")}
                  stats={stats}
                  render={(s) =>
                    s.adsPerWeek > 0
                      ? `${s.adsPerWeek} ${t("compare", "adsPerWeek")}`
                      : "\u2014"
                  }
                  highlight
                />
                {/* Latest ads */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {t("compare", "latestAds")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={cn(
                        "grid gap-4",
                        stats.length === 2
                          ? "grid-cols-2"
                          : "grid-cols-3"
                      )}
                    >
                      {stats.map((s) => (
                        <div key={s.id} className="space-y-3">
                          <p className="text-xs font-medium text-gold">
                            {s.name}
                          </p>
                          {s.latestAds.slice(0, 3).map((ad) => (
                            <a
                              key={ad.ad_archive_id}
                              href={`https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg border border-border overflow-hidden hover:border-gold/40 transition-colors"
                            >
                              {ad.image_url &&
                              !ad.image_url.includes("/render_ad/") ? (
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
                                <p className="p-2 text-xs line-clamp-1">
                                  {ad.headline}
                                </p>
                              )}
                            </a>
                          ))}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
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

function ObjectiveCard({
  stats,
  t,
}: {
  stats: CompStats[];
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

function CompareTable({
  label,
  stats,
  render,
  highlight,
}: {
  label: string;
  stats: CompStats[];
  render: (s: CompStats) => string;
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
