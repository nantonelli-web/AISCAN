"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  RefreshCw,
  ChevronDown,
  CalendarRange,
} from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/context";

/* ─── Platform SVG logos ─────────────────────────────────── */

function MetaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.93 3.78-3.93 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z" />
    </svg>
  );
}

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

/* ─── Component ──────────────────────────────────────────── */

interface Props {
  competitorId: string;
  hasGoogleConfig: boolean;
}

type ScanTarget = "meta" | "google" | "instagram";

export function ScanDropdown({ competitorId, hasGoogleConfig }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [loading, setLoading] = useState<ScanTarget | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dateRef = useRef<HTMLDivElement>(null);

  // Shared date range (applies to Meta + Google)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Meta-specific
  const [adStatus, setAdStatus] = useState<"ACTIVE" | "ALL">("ACTIVE");

  // Close date picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    }
    if (showDatePicker) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDatePicker]);

  const isLoading = loading !== null;

  // Effective range: custom or last 30 days
  const effectiveFrom = dateFrom || daysAgo(30);
  const effectiveTo = dateTo || new Date().toISOString().slice(0, 10);
  const isCustomRange = !!(dateFrom || dateTo);
  const rangeLabel = formatRange(effectiveFrom, effectiveTo);

  async function scanMeta() {
    setLoading("meta");
    setShowDatePicker(false);
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
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Scrape failed", { id: toastId });
      } else {
        if (json.debug) console.log("[MAIT scan debug]", json.debug);
        toast.success(`${json.records} Meta Ads ${t("scan", "adsSynced")} (${rangeLabel})`, { id: toastId });
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
    } finally {
      setLoading(null);
    }
  }

  async function scanGoogle() {
    setLoading("google");
    setShowDatePicker(false);
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
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Google Ads scrape failed", { id: toastId });
      } else {
        toast.success(`${json.records} Google Ads ${t("scan", "adsSynced")} (${rangeLabel})`, { id: toastId });
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
    } finally {
      setLoading(null);
    }
  }

  async function scanInstagram() {
    setLoading("instagram");
    setShowDatePicker(false);
    const toastId = toast.loading(t("organic", "scanning"));
    try {
      const res = await fetch("/api/instagram/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_id: competitorId, max_posts: 30 }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Instagram scrape failed", { id: toastId });
      } else {
        toast.success(`${json.records} ${t("organic", "postsSynced")}`, { id: toastId });
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      {/* ─── Date range (shared) + scan buttons ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Meta Ads */}
        <Button
          onClick={scanMeta}
          disabled={isLoading}
          className="gap-2"
        >
          {loading === "meta" ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <MetaLogo className="size-4" />
          )}
          {loading === "meta" ? t("scan", "scanning") : "Meta Ads"}
        </Button>

        {/* Google Ads */}
        {hasGoogleConfig && (
          <Button
            onClick={scanGoogle}
            disabled={isLoading}
            variant="outline"
            className="gap-2 border-border hover:border-gold/40"
          >
            {loading === "google" ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <GoogleLogo className="size-4" />
            )}
            {loading === "google" ? t("scan", "scanningGoogle") : "Google Ads"}
          </Button>
        )}

        {/* Instagram */}
        <Button
          onClick={scanInstagram}
          disabled={isLoading}
          variant="outline"
          className="gap-2 border-border hover:border-gold/40"
        >
          {loading === "instagram" ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <InstagramIcon className="size-4" />
          )}
          {loading === "instagram" ? t("organic", "scanning") : "Instagram"}
        </Button>
      </div>

      {/* ─── Date range indicator + picker ─── */}
      <div className="relative" ref={dateRef}>
        <button
          onClick={() => setShowDatePicker(!showDatePicker)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <CalendarRange className="size-3" />
          <span>
            {isCustomRange ? rangeLabel : `${t("scan", "last30days")} (${rangeLabel})`}
          </span>
          <ChevronDown className={`size-3 transition-transform ${showDatePicker ? "rotate-180" : ""}`} />
        </button>

        {showDatePicker && (
          <div className="absolute left-0 top-full mt-1 z-20 w-72 rounded-lg border border-border bg-card shadow-lg p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">{t("scan", "dateFrom")}</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder={daysAgo(30)}
                  className="text-xs h-7"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">{t("scan", "dateTo")}</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-xs h-7"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">{t("scan", "adStatusMeta")}</Label>
              <select
                value={adStatus}
                onChange={(e) => setAdStatus(e.target.value as "ACTIVE" | "ALL")}
                className="flex h-7 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground"
              >
                <option value="ACTIVE">{t("scan", "activeOnly")}</option>
                <option value="ALL">{t("scan", "allAds")}</option>
              </select>
            </div>
            {isCustomRange && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                {t("scan", "resetFilters")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
