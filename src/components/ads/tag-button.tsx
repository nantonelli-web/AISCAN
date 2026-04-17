"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

export function TagButton({ competitorId }: { competitorId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [untaggedCount, setUntaggedCount] = useState<number | null>(null);
  const [lastTagged, setLastTagged] = useState<number | null>(null);
  const { t } = useT();

  // Fetch untagged count on mount
  useEffect(() => {
    fetchUntaggedCount();
  }, [competitorId]);

  async function fetchUntaggedCount() {
    try {
      const params = competitorId ? `?competitor_id=${competitorId}` : "";
      const res = await fetch(`/api/ai/tag/count${params}`);
      if (res.ok) {
        const json = await res.json();
        setUntaggedCount(json.untagged ?? null);
      }
    } catch {
      // ignore
    }
  }

  async function onClick() {
    setLoading(true);
    setLastTagged(null);
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
        toast.error(json.error ?? t("tagButton", "taggingFailed"), {
          id: toastId,
        });
      } else {
        const remaining =
          untaggedCount != null ? Math.max(0, untaggedCount - json.tagged) : null;
        setLastTagged(json.tagged);
        setUntaggedCount(remaining);

        if (json.tagged === 0) {
          toast.success(t("tagButton", "allTagged"), { id: toastId });
        } else {
          const msg =
            remaining && remaining > 0
              ? `${json.tagged} ${t("tagButton", "adsTagged")}. ${remaining} ${t("tagButton", "remaining")}`
              : `${json.tagged} ${t("tagButton", "adsTagged")}.`;
          toast.success(msg, { id: toastId });
        }
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tagButton", "error"), {
        id: toastId,
      });
    } finally {
      setLoading(false);
    }
  }

  const allDone = untaggedCount === 0;

  return (
    <div className="flex items-center gap-3">
      <Sparkles className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground">
          <span className="font-medium">{t("tagButton", "aiTag")}</span>
          {allDone
            ? ` — ${t("tagButton", "allTaggedBtn")}`
            : untaggedCount != null
              ? ` — ${untaggedCount} ${t("tagButton", "toTag")}`
              : ""}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          {t("tagButton", "aiTagShort")}
        </p>
      </div>
      {!allDone && (
        <Button
          onClick={onClick}
          disabled={loading}
          variant="outline"
          size="sm"
          className="shrink-0 text-xs hover:bg-gold/15 hover:text-gold hover:border-gold/40"
        >
          {loading ? t("tagButton", "tagging") : "Start"}
        </Button>
      )}
      {allDone && (
        <span className="text-[10px] text-green-400 shrink-0">✓</span>
      )}
    </div>
  );
}
