"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

export function ScanGoogleButton({
  competitorId,
  hasGoogleConfig,
}: {
  competitorId: string;
  hasGoogleConfig: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { t } = useT();

  if (!hasGoogleConfig) return null;

  async function doScan() {
    setLoading(true);
    const toastId = toast.loading(t("scan", "scrapingGoogleInProgress"));
    try {
      const res = await fetch("/api/apify/scan-google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_items: 500,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Google Ads scrape failed", { id: toastId });
      } else {
        toast.success(`${json.records} Google Ads ${t("scan", "adsSynced")}`, {
          id: toastId,
        });
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", {
        id: toastId,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={doScan} disabled={loading} variant="outline">
      <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
      {loading ? t("scan", "scanningGoogle") : t("scan", "scanGoogle")}
    </Button>
  );
}
