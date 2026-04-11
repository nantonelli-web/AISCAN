"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { MaitCompetitor } from "@/types";

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
  latestAds: {
    headline: string | null;
    image_url: string | null;
    ad_archive_id: string;
  }[];
}

export function CompareView({
  competitors,
  workspaceId,
}: {
  competitors: MaitCompetitor[];
  workspaceId: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<CompStats[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useT();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (selected.size < 2) {
      setStats(null);
      return;
    }
    setLoading(true);
    fetch("/api/competitors/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    })
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [selected]);

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

      {selected.size < 2 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t("compare", "selectAtLeast2")}
        </p>
      )}

      {loading && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t("compare", "calculating")}
        </p>
      )}

      {/* Comparison table */}
      {stats && stats.length >= 2 && (
        <div className="space-y-4">
          <CompareTable label={t("compare", "totalAds")} stats={stats} render={(s) => String(s.totalAds)} />
          <CompareTable label={t("compare", "activeAds")} stats={stats} render={(s) => String(s.activeAds)} highlight />
          <CompareTable
            label={t("compare", "formatMix")}
            stats={stats}
            render={(s) => {
              const total = s.imageCount + s.videoCount;
              if (total === 0) return "\u2014";
              const imgPct = Math.round((s.imageCount / total) * 100);
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
            render={(s) => (s.avgDuration > 0 ? `${s.avgDuration} ${t("compare", "avgDurationDays")}` : "\u2014")}
          />
          <CompareTable
            label={t("compare", "avgCopyLength")}
            stats={stats}
            render={(s) =>
              s.avgCopyLength > 0 ? `${s.avgCopyLength} ${t("compare", "avgCopyChars")}` : "\u2014"
            }
          />
          <CompareTable
            label={t("compare", "refreshRate")}
            stats={stats}
            render={(s) =>
              s.adsPerWeek > 0 ? `${s.adsPerWeek} ${t("compare", "adsPerWeek")}` : "\u2014"
            }
            highlight
          />

          {/* Latest ads preview */}
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
      )}
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
