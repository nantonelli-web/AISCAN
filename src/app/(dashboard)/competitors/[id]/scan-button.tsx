"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

export function ScanButton({ competitorId }: { competitorId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { t } = useT();

  async function onClick() {
    setLoading(true);
    const toastId = toast.loading(t("scan", "scrapingInProgress"));
    try {
      const res = await fetch("/api/apify/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_id: competitorId, max_items: 200 }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Scrape failed", { id: toastId });
      } else {
        toast.success(`${json.records} ${t("scan", "adsSynced")}`, { id: toastId });
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={loading}>
      <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
      {loading ? t("scan", "scanning") : t("scan", "scanNow")}
    </Button>
  );
}
