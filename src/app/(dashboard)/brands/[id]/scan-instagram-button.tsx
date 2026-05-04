"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

export function ScanInstagramButton({
  competitorId,
}: {
  competitorId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { t } = useT();

  async function doScan() {
    setLoading(true);
    const toastId = toast.loading(t("organic", "scanning"));
    try {
      const res = await fetch("/api/instagram/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          max_posts: 30,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Instagram scrape failed", { id: toastId });
      } else {
        toast.success(`${json.records} ${t("organic", "postsSynced")}`, {
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
      {loading ? (
        <RefreshCw className="size-4 animate-spin" />
      ) : (
        <InstagramIcon className="size-4" />
      )}
      {loading ? t("organic", "scanning") : t("organic", "scanInstagram")}
    </Button>
  );
}
