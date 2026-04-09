"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ScanButton({ competitorId }: { competitorId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    const t = toast.loading("Scraping in corso… (può richiedere 30-90s)");
    try {
      const res = await fetch("/api/apify/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_id: competitorId, max_items: 200 }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Scrape failed", { id: t });
      } else {
        toast.success(`${json.records} ads sincronizzate.`, { id: t });
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error", { id: t });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={loading}>
      <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
      {loading ? "Scanning…" : "Scan now"}
    </Button>
  );
}
