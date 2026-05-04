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
                  <div className="flex items-center gap-3 min-w-0">
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
                    <span>{j.records_count} ads</span>
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
