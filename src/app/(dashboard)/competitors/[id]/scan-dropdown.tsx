"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  RefreshCw,
  ChevronDown,
  CalendarRange,
  Globe,
  Search,
} from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/context";

interface Props {
  competitorId: string;
  hasGoogleConfig: boolean;
}

type ScanTarget = "meta" | "google" | "instagram";

export function ScanDropdown({ competitorId, hasGoogleConfig }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ScanTarget | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Meta advanced options
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [adStatus, setAdStatus] = useState<"ACTIVE" | "ALL">("ACTIVE");

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAdvanced(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function scanMeta() {
    setLoading("meta");
    setOpen(false);
    setShowAdvanced(false);
    const toastId = toast.loading(t("scan", "scrapingInProgress"));
    try {
      const res = await fetch("/api/apify/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_items: 200,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          active_status: adStatus,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Scrape failed", { id: toastId });
      } else {
        if (json.debug) console.log("[MAIT scan debug]", json.debug);
        toast.success(`${json.records} ${t("scan", "adsSynced")}`, { id: toastId });
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
    setOpen(false);
    const toastId = toast.loading(t("scan", "scrapingGoogleInProgress"));
    try {
      const res = await fetch("/api/apify/scan-google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_id: competitorId, max_items: 200 }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Google Ads scrape failed", { id: toastId });
      } else {
        toast.success(`${json.records} Google Ads ${t("scan", "adsSynced")}`, { id: toastId });
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
    setOpen(false);
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

  const isLoading = loading !== null;
  const loadingLabel =
    loading === "meta" ? t("scan", "scanning")
    : loading === "google" ? t("scan", "scanningGoogle")
    : loading === "instagram" ? t("organic", "scanning")
    : null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main button */}
      <div className="flex">
        <Button
          onClick={scanMeta}
          disabled={isLoading}
          className="rounded-r-none"
        >
          <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
          {isLoading ? loadingLabel : t("scan", "scanNow")}
        </Button>
        <Button
          onClick={() => { setOpen(!open); setShowAdvanced(false); }}
          disabled={isLoading}
          className="rounded-l-none border-l border-gold-foreground/20 px-2"
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-64 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          {/* Scan targets */}
          <div className="p-1.5">
            <button
              onClick={scanMeta}
              disabled={isLoading}
              className="flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Globe className="size-4 text-blue-400" />
              Scan Meta Ads
            </button>

            {hasGoogleConfig && (
              <button
                onClick={scanGoogle}
                disabled={isLoading}
                className="flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Search className="size-4 text-emerald-400" />
                Scan Google Ads
              </button>
            )}

            <button
              onClick={scanInstagram}
              disabled={isLoading}
              className="flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <InstagramIcon className="size-4 text-pink-400" />
              Scan Instagram
            </button>
          </div>

          {/* Divider + advanced options toggle */}
          <div className="border-t border-border">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <CalendarRange className="size-3.5" />
              {t("scan", "scanOptions")}
              <ChevronDown className={`size-3 ml-auto transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            </button>

            {showAdvanced && (
              <div className="px-4 pb-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">{t("scan", "dateFrom")}</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
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
                  <Label className="text-[10px]">{t("scan", "adStatus")}</Label>
                  <select
                    value={adStatus}
                    onChange={(e) => setAdStatus(e.target.value as "ACTIVE" | "ALL")}
                    className="flex h-7 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground"
                  >
                    <option value="ACTIVE">{t("scan", "activeOnly")}</option>
                    <option value="ALL">{t("scan", "allAds")}</option>
                  </select>
                </div>
                {(dateFrom || dateTo || adStatus !== "ACTIVE") && (
                  <button
                    onClick={() => { setDateFrom(""); setDateTo(""); setAdStatus("ACTIVE"); }}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {t("scan", "resetFilters")}
                  </button>
                )}
                <Button onClick={scanMeta} disabled={isLoading} className="w-full" size="sm">
                  <RefreshCw className={isLoading ? "size-3 animate-spin" : "size-3"} />
                  {t("scan", "launchScan")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
