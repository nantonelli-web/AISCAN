"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

export function TagButton({ competitorId }: { competitorId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { t } = useT();

  async function onClick() {
    setLoading(true);
    const toastId = toast.loading(t("tagButton", "aiTagging"));
    try {
      const res = await fetch("/api/ai/tag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitorId,
          limit: 20,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? t("tagButton", "taggingFailed"), { id: toastId });
      } else {
        toast.success(`${json.tagged} ${t("tagButton", "adsTagged")}`, { id: toastId });
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tagButton", "error"), { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={loading} variant="outline">
      <Sparkles className={loading ? "size-4 animate-pulse" : "size-4"} />
      {loading ? t("tagButton", "tagging") : t("tagButton", "aiTag")}
    </Button>
  );
}
