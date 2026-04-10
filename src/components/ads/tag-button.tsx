"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TagButton({ competitorId }: { competitorId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    const t = toast.loading("AI tagging in corso…");
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
        toast.error(json.error ?? "Tagging fallito.", { id: t });
      } else {
        toast.success(`${json.tagged} ads taggate con AI.`, { id: t });
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore", { id: t });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={loading} variant="outline">
      <Sparkles className={loading ? "size-4 animate-pulse" : "size-4"} />
      {loading ? "Tagging…" : "AI Tag"}
    </Button>
  );
}
