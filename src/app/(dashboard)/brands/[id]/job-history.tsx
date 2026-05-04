"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  CheckSquare,
  Square,
  MinusSquare,
} from "lucide-react";
import { useT } from "@/lib/i18n/context";
import type { MaitScrapeJob } from "@/types";

const statusBadge: Record<
  MaitScrapeJob["status"],
  { variant: "default" | "muted" | "gold"; icon: React.ReactNode }
> = {
  succeeded: {
    variant: "gold",
    icon: <CheckCircle2 className="size-3" />,
  },
  failed: {
    variant: "muted",
    icon: <XCircle className="size-3 text-red-400" />,
  },
  running: {
    variant: "muted",
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  pending: {
    variant: "muted",
    icon: <Loader2 className="size-3" />,
  },
};

export function JobHistory({ jobs }: { jobs: MaitScrapeJob[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmSingle, setConfirmSingle] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { t, locale } = useT();

  function formatRelative(d: string | null) {
    if (!d) return "\u2014";
    const diffMs = Date.now() - new Date(d).getTime();
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH < 1) return `${Math.round(diffH * 60)}${t("relativeTime", "minutesAgo")}`;
    if (diffH < 24) return `${Math.round(diffH)}${t("relativeTime", "hoursAgo")}`;
    return `${Math.round(diffH / 24)}${t("relativeTime", "daysAgo")}`;
  }

  // Map the `source` column value (set by each scan API) to a
  // human-readable channel label. Sources that don't match any
  // known canal (legacy rows, future ones we forgot to update
  // here) fall through and just render the raw token.
  function channelLabel(source: string | null): string | null {
    if (!source) return null;
    const map: Record<string, string> = {
      meta: "Meta",
      google: "Google",
      instagram: "Instagram",
      tiktok: "TikTok",
      tiktok_ads: "TikTok Ads",
      tiktok_cc: "TikTok CC",
      snapchat: "Snapchat",
      youtube: "YouTube",
      serp: "SERP",
      maps: "Maps",
    };
    return map[source] ?? source;
  }

  // Compact ISO range for the chip \u2014 "DD/MM \u2192 DD/MM" if same year,
  // "DD/MM/YY \u2192 DD/MM/YY" otherwise. Returns null when the scan was
  // a full-archive run (date_from / date_to NULL on legacy rows or
  // cron-triggered scans).
  function formatRange(from: string | null, to: string | null): string | null {
    if (!from || !to) return null;
    const f = new Date(from);
    const tt = new Date(to);
    if (Number.isNaN(f.getTime()) || Number.isNaN(tt.getTime())) return null;
    const sameYear = f.getFullYear() === tt.getFullYear();
    const dd = (n: number) => n.toString().padStart(2, "0");
    const fStr = `${dd(f.getDate())}/${dd(f.getMonth() + 1)}${sameYear ? "" : `/${String(f.getFullYear()).slice(-2)}`}`;
    const tStr = `${dd(tt.getDate())}/${dd(tt.getMonth() + 1)}/${String(tt.getFullYear()).slice(-2)}`;
    return `${fStr} \u2192 ${tStr}`;
  }

  // Scope chip \u2014 replaces the date-range chip for channels whose
  // actor doesn't take a date filter (TikTok organic, YouTube,
  // Snapchat). For those, the actor pulls the latest N items and
  // there's no honest "DD/MM \u2192 DD/MM" to show. Instead we surface
  // the count-based scope so the user knows what was collected:
  //
  //   \u2022 snapchat \u2192 "Snapshot profilo"
  //   \u2022 youtube  \u2192 "Ultimi N video"
  //   \u2022 tiktok   \u2192 "Ultimi N post"
  //
  // Returns null when no scope is meaningful (legacy rows missing
  // source, or paid-channel scans where formatRange is the right
  // surface).
  function scopeLabel(source: string | null, count: number): string | null {
    if (source === "snapchat") return "Snapshot profilo";
    if (source === "youtube") return `Ultimi ${count} video`;
    if (source === "tiktok") return `Ultimi ${count} post`;
    return null;
  }

  // Per-source unit label for the records count. Snapchat returns
  // a single profile snapshot per scan, NOT an ad \u2014 the previous
  // hard-coded "ads" caption was misleading (user feedback
  // 2026-05-04: "Snapchat riporta '1 ads' ma \u00e8 organico"). Each
  // source gets its own noun + auto-pluralisation.
  function recordsLabel(source: string | null, count: number): string {
    const plural = count !== 1;
    switch (source) {
      case "snapchat":
        return plural ? "snapshot" : "snapshot";
      case "instagram":
        return plural ? "post" : "post";
      case "tiktok":
        return plural ? "post" : "post";
      case "youtube":
        return plural ? "video" : "video";
      case "tiktok_ads":
      case "tiktok_cc":
      case "meta":
      case "google":
        return plural ? "ads" : "ad";
      case "serp":
        return plural ? "query" : "query";
      case "maps":
        return plural ? "luoghi" : "luogo";
      default:
        return plural ? "elementi" : "elemento";
    }
  }

  const allSelected = selected.size === jobs.length && jobs.length > 0;
  const someSelected = selected.size > 0 && !allSelected;
  const totalAdsSelected = jobs
    .filter((j) => selected.has(j.id))
    .reduce((sum, j) => sum + j.records_count, 0);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(jobs.map((j) => j.id)));
  }

  async function handleDeleteSingle(jobId: string, deleteAds: boolean) {
    setDeleting(true);
    const toastId = toast.loading(t("jobHistory", "deletingProgress"));
    try {
      const res = await fetch(
        `/api/scrape-jobs/${jobId}?deleteAds=${deleteAds}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: t("jobHistory", "error") }));
        toast.error(json.error, { id: toastId });
      } else {
        toast.success(
          deleteAds ? t("jobHistory", "scanAndAdsDeleted") : t("jobHistory", "scanDeleted"),
          { id: toastId }
        );
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("jobHistory", "error"), { id: toastId });
    } finally {
      setDeleting(false);
      setConfirmSingle(null);
    }
  }

  async function handleBulkDelete(deleteAds: boolean) {
    setDeleting(true);
    const ids = [...selected];
    const toastId = toast.loading(`${t("jobHistory", "deletingScanCount")} ${ids.length} scan\u2026`);
    try {
      const res = await fetch("/api/scrape-jobs/bulk", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, deleteAds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: t("jobHistory", "error") }));
        toast.error(json.error, { id: toastId });
      } else {
        toast.success(
          deleteAds
            ? `${ids.length} ${t("jobHistory", "scansAndAdsDeleted")}`
            : `${ids.length} ${t("jobHistory", "scansDeleted")}`,
          { id: toastId }
        );
        setSelected(new Set());
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("jobHistory", "error"), { id: toastId });
    } finally {
      setDeleting(false);
      setConfirmBulk(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-sm">{t("jobHistory", "title")}</CardTitle>
        {selected.size > 0 && !confirmBulk && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmBulk(true)}
            disabled={deleting}
          >
            <Trash2 className="size-3.5" />
            {t("jobHistory", "deleteSelected")} {selected.size}{" "}
            {selected.size === 1
              ? t("jobHistory", "selectedSuffixSingular")
              : t("jobHistory", "selectedSuffix")}
          </Button>
        )}
      </CardHeader>

      {/* Bulk confirmation bar */}
      {confirmBulk && (
        <div className="mx-5 mb-3 p-3 rounded-md border border-red-400/30 bg-red-400/5 space-y-2">
          <p className="text-xs text-foreground">
            {t("jobHistory", "bulkDeletePrompt")} <b>{selected.size} {t("jobHistory", "scansWord")}</b>
            {totalAdsSelected > 0 && (
              <> ({totalAdsSelected} {t("jobHistory", "adsAssociated")})</>
            )}. {t("jobHistory", "deleteAdsQuestion")}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={deleting}
              onClick={() => handleBulkDelete(true)}
            >
              {t("jobHistory", "deleteScanAndAds")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={deleting}
              onClick={() => handleBulkDelete(false)}
            >
              {t("jobHistory", "onlyScans")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={deleting}
              onClick={() => setConfirmBulk(false)}
            >
              {t("jobHistory", "cancel")}
            </Button>
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {/* Select all header */}
        <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-muted/30 text-xs text-muted-foreground">
          <button
            onClick={toggleAll}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={allSelected ? t("jobHistory", "deselectAll") : t("jobHistory", "selectAll")}
          >
            {allSelected ? (
              <CheckSquare className="size-4 text-gold" />
            ) : someSelected ? (
              <MinusSquare className="size-4 text-gold" />
            ) : (
              <Square className="size-4" />
            )}
          </button>
          <span>
            {selected.size > 0
              ? `${selected.size} ${t("jobHistory", "ofTotal")} ${jobs.length} ${t("jobHistory", "selectedLabel")}`
              : `${jobs.length} scan`}
          </span>
        </div>

        <div className="divide-y divide-border">
          {jobs.map((j) => {
            const cfg = statusBadge[j.status];
            const isSelected = selected.has(j.id);
            const isConfirming = confirmSingle === j.id;
            return (
              <div
                key={j.id}
                className={`px-5 py-3 text-sm transition-colors ${
                  isSelected ? "bg-gold/5" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <button
                      onClick={() => toggleOne(j.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="size-4 text-gold" />
                      ) : (
                        <Square className="size-4" />
                      )}
                    </button>
                    <Badge variant={cfg.variant} className="gap-1">
                      {cfg.icon}
                      {j.status}
                    </Badge>
                    {/* Channel chip (NULL on legacy rows from before
                        migration 0027 — we just hide the chip then). */}
                    {channelLabel(j.source) && (
                      <span className="inline-flex items-center rounded-md bg-gold/10 text-gold border border-gold/30 px-2 py-0.5 text-[11px] font-medium">
                        {channelLabel(j.source)}
                      </span>
                    )}
                    {/* Scope chip — date range when the scan was
                        windowed (paid + Instagram), count-based
                        scope label for actors that don't take a
                        date filter (TikTok / YouTube / Snapchat).
                        Hidden on legacy rows where neither applies. */}
                    {formatRange(j.date_from, j.date_to) ? (
                      <span className="inline-flex items-center rounded-md bg-muted text-muted-foreground border border-border px-2 py-0.5 text-[11px] tabular-nums">
                        {formatRange(j.date_from, j.date_to)}
                      </span>
                    ) : scopeLabel(j.source, j.records_count) ? (
                      <span className="inline-flex items-center rounded-md bg-muted text-muted-foreground border border-border px-2 py-0.5 text-[11px]">
                        {scopeLabel(j.source, j.records_count)}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">
                      {formatRelative(j.started_at)}
                    </span>
                    {j.error && (
                      <span className="text-xs text-red-400 truncate max-w-xs">
                        {j.error}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {j.records_count} {recordsLabel(j.source, j.records_count)}
                    </span>
                    {j.cost_cu > 0 && <span>${j.cost_cu.toFixed(3)}</span>}
                    <button
                      onClick={() =>
                        setConfirmSingle(isConfirming ? null : j.id)
                      }
                      disabled={deleting}
                      className="size-7 rounded-md border border-border hover:bg-muted hover:border-red-400/40 grid place-items-center text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
                      aria-label={t("jobHistory", "deleteScanLabel")}
                      title={t("jobHistory", "deleteScanLabel")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {isConfirming && (
                  <div className="mt-3 ml-7 p-3 rounded-md border border-border bg-muted/50 space-y-2">
                    <p className="text-xs text-foreground">
                      {t("jobHistory", "confirmDeleteAds")} <b>{j.records_count} {t("jobHistory", "adsCollected")}</b>
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={deleting}
                        onClick={() => handleDeleteSingle(j.id, true)}
                      >
                        {t("jobHistory", "scanPlusAds")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deleting}
                        onClick={() => handleDeleteSingle(j.id, false)}
                      >
                        {t("jobHistory", "scanOnly")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={deleting}
                        onClick={() => setConfirmSingle(null)}
                      >
                        {t("jobHistory", "cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
