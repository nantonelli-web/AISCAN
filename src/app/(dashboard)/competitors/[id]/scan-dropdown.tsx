"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, CalendarRange, Square, Search, MapPin } from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { MetaIcon } from "@/components/ui/meta-icon";
import { TikTokIcon } from "@/components/ui/tiktok-icon";
import { SnapchatIcon } from "@/components/ui/snapchat-icon";
import { YouTubeIcon } from "@/components/ui/youtube-icon";
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
  hasTiktokConfig: boolean;
  hasSnapchatConfig: boolean;
  hasYoutubeConfig: boolean;
  /** DB-confirmed running job; shows Stop even after a page reload. */
  hasRunningJob?: boolean;
}

type ScanTarget = "meta" | "google" | "instagram" | "tiktok" | "snapchat" | "youtube";

export function ScanDropdown({
  competitorId,
  hasGoogleConfig,
  hasInstagramConfig,
  hasTiktokConfig,
  hasSnapchatConfig,
  hasYoutubeConfig,
  hasRunningJob = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  // After a successful scan we push `?tab=<channel>` so the brand
  // page lands on the just-imported channel instead of leaving the
  // user on the previous tab. router.replace + router.refresh keeps
  // the back-stack clean and re-runs the server component.
  function focusChannel(
    tab: "meta" | "google" | "instagram" | "tiktok" | "snapchat" | "youtube",
  ) {
    router.replace(`${pathname}?tab=${tab}`);
    router.refresh();
  }
  const { t } = useT();
  const [loading, setLoading] = useState<ScanTarget | null>(null);
  const [stopping, setStopping] = useState(false);

  // Shared date range
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Removed jumpToDateInput auto-jump from From → To: showPicker()
  // inside a setTimeout loses the user-activation gesture, leaving
  // the To picker in a frozen state where clicks/keys do not register
  // and click-outside does not close it. User can click To manually
  // — minor UX regression, much better than a stuck calendar.

  const isLoading = loading !== null;
  const showStop = isLoading || hasRunningJob;
  const abortRef = useRef<AbortController | null>(null);

  async function stopScan() {
    setStopping(true);
    // 1. Abort the client-side fetch if we own it
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // 2. Abort Apify run + mark job failed server-side. This also catches
    //    orphan runs started in a previous session (page reload case).
    try {
      await fetch("/api/apify/abort", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_id: competitorId }),
      });
      toast.info(t("scan", "scanStopped"));
    } catch {
      toast.error("Stop failed");
    } finally {
      setLoading(null);
      setStopping(false);
      router.refresh();
    }
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

  async function scanMeta() {
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
          max_items: 500,
          date_from: effectiveFrom,
          date_to: effectiveTo,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Scrape failed", { id: toastId });
      } else {
        if (json.debug) console.log("[AISCAN scan debug]", json.debug);
        toast.success(`${json.records} Meta Ads ${t("scan", "adsSynced")} (${rangeLabel})`, { id: toastId });
        focusChannel("meta");
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
          max_items: 500,
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
        focusChannel("google");
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
    if (rangeExceeded) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("instagram");
    const toastId = toast.loading(t("organic", "scanning"));
    try {
      const res = await fetch("/api/instagram/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_posts: 100,
          date_from: effectiveFrom,
          date_to: effectiveTo,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Instagram scrape failed", { id: toastId });
      } else {
        toast.success(
          `${json.records} ${t("organic", "postsSynced")} (${rangeLabel})`,
          { id: toastId }
        );
        focusChannel("instagram");
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

  // The YouTube actor returns the most recent N videos plus a channel
  // snapshot — no date filter to forward, so we ignore the date
  // range inputs above (same as TikTok).
  async function scanYoutube() {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("youtube");
    const toastId = toast.loading(t("organic", "scanning"));
    try {
      const res = await fetch("/api/youtube/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_videos: 30,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "YouTube scrape failed", { id: toastId });
      } else {
        toast.success(
          `${json.records} ${t("organic", "postsSynced")}`,
          { id: toastId },
        );
        focusChannel("youtube");
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

  // The Snapchat actor returns one profile snapshot per scan (no per-
  // post entity to filter, no date range). Always-on, regardless of
  // the date inputs above.
  async function scanSnapchat() {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("snapchat");
    const toastId = toast.loading(t("organic", "scanning"));
    try {
      const res = await fetch("/api/snapchat/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Snapchat scrape failed", { id: toastId });
      } else {
        toast.success(t("scan", "snapshotSynced"), { id: toastId });
        focusChannel("snapchat");
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

  // The TikTok actor pulls "most recent N videos" — there is no date
  // filter to forward, so we ignore dateFrom/dateTo (and the range
  // validation) for this channel.
  async function scanTikTok() {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading("tiktok");
    const toastId = toast.loading(t("organic", "scanning"));
    try {
      const res = await fetch("/api/tiktok/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_posts: 50,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "TikTok scrape failed", { id: toastId });
      } else {
        toast.success(
          `${json.records} ${t("organic", "postsSynced")}`,
          { id: toastId }
        );
        focusChannel("tiktok");
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

  // Compact channel buttons: 36px high vs the previous 48px so all
  // 8 channels + date pickers + group dividers fit on one or two
  // rows on a desktop, killing the "tall column of empty chrome"
  // problem. Icons drop from size-6 to size-4 to match.
  const bigCta = "h-9 px-3 text-sm gap-1.5 cursor-pointer";
  const bigCtaDisabled = "h-9 px-3 text-sm gap-1.5 opacity-40 cursor-not-allowed";
  const groupLabel = "text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold shrink-0";

  return (
    <div className="space-y-3">
      {/* ─── 1. Scan period — compact inline row ─── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <CalendarRange className="size-3.5" />
          <span className="font-medium text-foreground">{t("scan", "scanPeriod")}</span>
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder={daysAgo(30)}
          aria-label={t("scan", "dateFrom")}
          className="text-xs h-8 w-36"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label={t("scan", "dateTo")}
          className="text-xs h-8 w-36"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Reset
          </button>
        )}
        {rangeError && (
          <span className="text-xs tone-danger">{rangeError}</span>
        )}
      </div>

      {/* ─── 2. Stop button + scanning banner — visible whenever a
              scan is in flight on the client OR already running in
              the DB (survives a reload). The channel buttons below
              are hidden in this state so the user cannot accidentally
              fire a second scan while one is running. */}
      {showStop && (
        <div className="rounded-md border border-red-400/30 bg-red-400/5 p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t("scan", "scanInProgressTitle")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("scan", "scanInProgressHelp")}
            </p>
          </div>
          <Button
            onClick={stopScan}
            disabled={stopping}
            variant="outline"
            size="lg"
            className={cn(bigCta, "border-red-400/40 text-red-400 hover:bg-red-400/15 hover:border-red-400 shrink-0")}
          >
            <Square className="size-5 fill-current" />
            {stopping ? t("scan", "stopping") : "Stop"}
          </Button>
        </div>
      )}

      {/* ─── 3. Channels — grouped by Paid / Organic. Hidden while a
              scan is running so the user cannot fire a second scan
              from the same brand (the rate-limit gate would reject
              it server-side, but client-side hiding makes the state
              visually unambiguous and removes the failure path). */}
      {!showStop && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Paid group */}
        <span className={groupLabel}>{t("scan", "paid")}</span>
        <Button
          onClick={scanMeta}
          disabled={isLoading || rangeExceeded}
          variant="outline"
          size="sm"
          className={bigCta}
        >
          {loading === "meta" ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <MetaIcon className="size-4" />
          )}
          {loading === "meta" ? t("scan", "scanning") : "Meta"}
        </Button>
        <Button
          onClick={hasGoogleConfig ? scanGoogle : undefined}
          disabled={!hasGoogleConfig || isLoading || rangeExceeded}
          variant="outline"
          size="sm"
          className={hasGoogleConfig ? bigCta : bigCtaDisabled}
        >
          {loading === "google" ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <GoogleLogo className="size-4" />
          )}
          {loading === "google" ? t("scan", "scanningGoogle") : "Google"}
        </Button>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Organic group */}
        <span className={groupLabel}>{t("scan", "organic")}</span>
        <Button
          onClick={hasInstagramConfig ? scanInstagram : undefined}
          disabled={!hasInstagramConfig || isLoading || rangeExceeded}
          variant="outline"
          size="sm"
          className={hasInstagramConfig ? bigCta : bigCtaDisabled}
        >
          {loading === "instagram" ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <InstagramIcon className="size-4" />
          )}
          IG
        </Button>
        <Button
          onClick={hasTiktokConfig ? scanTikTok : undefined}
          disabled={!hasTiktokConfig || isLoading}
          variant="outline"
          size="sm"
          className={hasTiktokConfig ? bigCta : bigCtaDisabled}
        >
          {loading === "tiktok" ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <TikTokIcon className="size-4" />
          )}
          TikTok
        </Button>
        <Button
          onClick={hasSnapchatConfig ? scanSnapchat : undefined}
          disabled={!hasSnapchatConfig || isLoading}
          variant="outline"
          size="sm"
          className={hasSnapchatConfig ? bigCta : bigCtaDisabled}
        >
          {loading === "snapchat" ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <SnapchatIcon className="size-4" />
          )}
          Snap
        </Button>
        <Button
          onClick={hasYoutubeConfig ? scanYoutube : undefined}
          disabled={!hasYoutubeConfig || isLoading}
          variant="outline"
          size="sm"
          className={hasYoutubeConfig ? bigCta : bigCtaDisabled}
        >
          {loading === "youtube" ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <YouTubeIcon className="size-4" />
          )}
          YT
        </Button>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Monitoring group — workspace-level tools surfaced on the
            brand page so the user can launch a SERP query / Maps
            search pre-attached to the current brand without going
            through the sidebar. SERP and Maps don't have a "scan"
            action per se — clicking opens the create flow on the
            workspace page with brand context preserved. */}
        <span className={groupLabel}>{t("scan", "monitoringGroup")}</span>
        <Link
          href={`/serp?brandId=${competitorId}&new=1`}
          className={cn(
            bigCta,
            "inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <Search className="size-4" /> SERP
        </Link>
        <Link
          href="/maps"
          className={cn(
            bigCta,
            "inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <MapPin className="size-4" /> Maps
        </Link>
      </div>
      )}

      {/* ─── 4. Missing config — collapsed into a single inline row.
              The previous amber box stacked one row per missing channel
              and ate ~120px on a typical brand. The icon-only chips
              with a single "Configura" link convey the same info in
              ~32px and keep the Scan card compact. */}
      {!showStop && (() => {
        const missing = [
          !hasGoogleConfig && "Google",
          !hasInstagramConfig && "Instagram",
          !hasTiktokConfig && "TikTok",
          !hasSnapchatConfig && "Snapchat",
          !hasYoutubeConfig && "YouTube",
        ].filter(Boolean) as string[];
        if (missing.length === 0) return null;
        return (
          <div className="flex items-center gap-2 flex-wrap text-xs tone-warning bg-warning-soft rounded-md px-3 py-2">
            <span className="font-medium">
              {missing.length === 1
                ? t("scan", "configRequiredOne")
                : `${missing.length} ${t("scan", "configRequiredMany")}`}
              :
            </span>
            <span className="text-foreground/80">{missing.join(", ")}</span>
            <a
              href={`/competitors/${competitorId}/edit?from=brand`}
              className="ml-auto text-xs underline tone-warning hover:opacity-80"
            >
              {t("compare", "goToEdit")}
            </a>
          </div>
        );
      })()}
    </div>
  );
}
