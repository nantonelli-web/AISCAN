"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, ChevronDown, CalendarRange, Square } from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { MetaIcon } from "@/components/ui/meta-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/* ─── Platform SVG logos ─────────────────────────────────── */

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
    </svg>
  );
}

/* ─── Helpers ────────────────────────────────────────────── */

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${f.toLocaleDateString("it-IT", opts)} — ${t.toLocaleDateString("it-IT", opts)}`;
}

const MAX_RANGE_DAYS = 90;

/* ─── Component ──────────────────────────────────────────── */

interface Props {
  competitorId: string;
  hasGoogleConfig: boolean;
  hasInstagramConfig: boolean;
}

type ScanTarget = "meta" | "google" | "instagram";

export function ScanDropdown({ competitorId, hasGoogleConfig, hasInstagramConfig }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [loading, setLoading] = useState<ScanTarget | null>(null);

  // Shared date range
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Meta status dropdown
  const [showMetaMenu, setShowMetaMenu] = useState(false);
  const metaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (metaRef.current && !metaRef.current.contains(e.target as Node)) {
        setShowMetaMenu(false);
      }
    }
    if (showMetaMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMetaMenu]);

  const isLoading = loading !== null;
  const abortRef = useRef<AbortController | null>(null);

  async function stopScan() {
    // 1. Abort the client-side fetch
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(null);
    toast.info(t("scan", "scanStopped"));

    // 2. Abort Apify run + mark job failed server-side
    try {
      await fetch("/api/apify/abort", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_id: competitorId }),
      });
    } catch {
      // Best effort — client already stopped
    }
    router.refresh();
  }

  // Effective range: custom or last 30 days
  const effectiveFrom = dateFrom || daysAgo(30);
  const effectiveTo = dateTo || new Date().toISOString().slice(0, 10);
  const rangeLabel = formatRange(effectiveFrom, effectiveTo);

  // Date range validation
  const rangeDays = Math.round(
    (new Date(effectiveTo).getTime() - new Date(effectiveFrom).getTime()) / 86_400_000
  );
  const rangeExceeded = rangeDays > MAX_RANGE_DAYS;
  const rangeError = rangeExceeded
    ? `Max ${MAX_RANGE_DAYS} ${t("scan", "days")}`
    : null;

  // ─── Scan handlers ───

  async function scanMeta(adStatus: "ACTIVE" | "ALL") {
    setShowMetaMenu(false);
    if (rangeExceeded) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("meta");
    const toastId = toast.loading(t("scan", "scrapingInProgress"));
    try {
      const res = await fetch("/api/apify/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_items: 200,
          date_from: effectiveFrom,
          date_to: effectiveTo,
          active_status: adStatus,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Scrape failed", { id: toastId });
      } else {
        if (json.debug) console.log("[AISCAN scan debug]", json.debug);
        toast.success(`${json.records} Meta Ads ${t("scan", "adsSynced")} (${rangeLabel})`, { id: toastId });
        router.refresh();
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
      }
    } finally {
      abortRef.current = null;
      setLoading(null);
    }
  }

  async function scanGoogle() {
    if (rangeExceeded) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("google");
    const toastId = toast.loading(t("scan", "scrapingGoogleInProgress"));
    try {
      const res = await fetch("/api/apify/scan-google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_items: 200,
          date_from: effectiveFrom,
          date_to: effectiveTo,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Google Ads scrape failed", { id: toastId });
        if (json.debug) console.error("[AISCAN Google scan error]", json);
      } else {
        if (json.debug) console.log("[AISCAN Google scan debug]", json.debug);
        toast.success(`${json.records} Google Ads ${t("scan", "adsSynced")} (${rangeLabel})`, { id: toastId });
        router.refresh();
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
      }
    } finally {
      abortRef.current = null;
      setLoading(null);
    }
  }

  async function scanInstagram() {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("instagram");
    const toastId = toast.loading(t("organic", "scanning"));
    try {
      const res = await fetch("/api/instagram/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_id: competitorId, max_posts: 30 }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Instagram scrape failed", { id: toastId });
      } else {
        toast.success(`${json.records} ${t("organic", "postsSynced")}`, { id: toastId });
        router.refresh();
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
      }
    } finally {
      abortRef.current = null;
      setLoading(null);
    }
  }

  // ─── Render ───

  const bigCta = "h-12 px-5 text-base gap-2.5 cursor-pointer";
  const bigCtaDisabled = "h-12 px-5 text-base gap-2.5 opacity-40 cursor-not-allowed";
  const groupLabel = "text-[10px] uppercase tracking-wider text-muted-foreground font-medium";

  return (
    <div className="space-y-4">
      {/* ─── 1. Scan period — everything on one line ─── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-foreground" />
          <span className="text-sm font-medium text-foreground">{t("scan", "scanPeriod")}:</span>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("scan", "dateFrom")}</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder={daysAgo(30)}
            className="text-xs h-8 w-36"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("scan", "dateTo")}</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-xs h-8 w-36"
          />
        </label>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Reset
          </button>
        )}
        {rangeError && (
          <span className="text-xs text-red-400">{rangeError}</span>
        )}
      </div>

      {/* ─── 2. Stop button — only while a scan is in flight ─── */}
      {isLoading && (
        <Button
          onClick={stopScan}
          variant="outline"
          size="lg"
          className={cn(bigCta, "border-red-400/40 text-red-400 hover:bg-red-400/15 hover:border-red-400")}
        >
          <Square className="size-5 fill-current" />
          Stop
        </Button>
      )}

      {/* ─── 3. Channels — grouped by Paid / Organic ─── */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        {/* Paid group */}
        <div className="space-y-2">
          <p className={groupLabel}>{t("scan", "paid")}</p>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Meta Ads — with ad status dropdown */}
            <div className="relative" ref={metaRef}>
              <div className="flex">
                <Button
                  onClick={() => scanMeta("ACTIVE")}
                  disabled={isLoading || rangeExceeded}
                  variant="outline"
                  size="lg"
                  className={cn(bigCta, "rounded-r-none")}
                >
                  {loading === "meta" ? (
                    <RefreshCw className="size-6 animate-spin" />
                  ) : (
                    <MetaIcon className="size-6" />
                  )}
                  {loading === "meta" ? t("scan", "scanning") : "Meta Ads"}
                </Button>
                <Button
                  onClick={() => setShowMetaMenu(!showMetaMenu)}
                  disabled={isLoading || rangeExceeded}
                  variant="outline"
                  size="lg"
                  className="h-12 rounded-l-none border-l-0 px-3 cursor-pointer"
                >
                  <ChevronDown className="size-4" />
                </Button>
              </div>

              {showMetaMenu && (
                <div className="absolute left-0 top-full mt-1 z-20 w-48 rounded-lg border border-border bg-card shadow-lg p-1">
                  <button
                    onClick={() => scanMeta("ACTIVE")}
                    className="flex items-center w-full rounded-md px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    {t("scan", "activeOnly")}
                  </button>
                  <button
                    onClick={() => scanMeta("ALL")}
                    className="flex items-center w-full rounded-md px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    {t("scan", "allAds")}
                  </button>
                </div>
              )}
            </div>

            {/* Google Ads */}
            <Button
              onClick={hasGoogleConfig ? scanGoogle : undefined}
              disabled={!hasGoogleConfig || isLoading || rangeExceeded}
              variant="outline"
              size="lg"
              className={hasGoogleConfig ? bigCta : bigCtaDisabled}
            >
              {loading === "google" ? (
                <RefreshCw className="size-6 animate-spin" />
              ) : (
                <GoogleLogo className="size-6" />
              )}
              {loading === "google" ? t("scan", "scanningGoogle") : "Google Ads"}
            </Button>
          </div>
        </div>

        {/* Divider between groups */}
        <div className="hidden sm:block w-px self-stretch bg-border mt-6" />

        {/* Organic group */}
        <div className="space-y-2">
          <p className={groupLabel}>{t("scan", "organic")}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={hasInstagramConfig ? scanInstagram : undefined}
              disabled={!hasInstagramConfig || isLoading}
              variant="outline"
              size="lg"
              className={hasInstagramConfig ? bigCta : bigCtaDisabled}
            >
              {loading === "instagram" ? (
                <RefreshCw className="size-6 animate-spin" />
              ) : (
                <InstagramIcon className="size-6" />
              )}
              {loading === "instagram" ? t("organic", "scanning") : "Instagram"}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── 3. Missing config details (amber box) ─── */}
      {(!hasGoogleConfig || !hasInstagramConfig) && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 space-y-1.5">
          <p className="text-xs font-medium text-amber-400">{t("scan", "configRequiredBrand")}</p>
          {!hasGoogleConfig && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Google Ads: {t("scan", "googleNotConfigured")}</span>
              <a href={`/competitors/${competitorId}/edit?from=brand`} className="ml-auto shrink-0">
                <Button variant="outline" size="sm" className="text-xs h-6 px-2 cursor-pointer">
                  {t("compare", "goToEdit")}
                </Button>
              </a>
            </div>
          )}
          {!hasInstagramConfig && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Instagram: {t("scan", "instagramNotConfigured")}</span>
              <a href={`/competitors/${competitorId}/edit?from=brand`} className="ml-auto shrink-0">
                <Button variant="outline" size="sm" className="text-xs h-6 px-2 cursor-pointer">
                  {t("compare", "goToEdit")}
                </Button>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
