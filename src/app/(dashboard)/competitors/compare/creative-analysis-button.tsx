"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { AnalysisReport } from "./analysis-report";
import type { CreativeAnalysisResult } from "@/lib/ai/creative-analysis";

export function CreativeAnalysisButton({
  competitorIds,
}: {
  competitorIds: string[];
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreativeAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useT();

  const disabled = competitorIds.length < 2;

  async function handleClick() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/ai/creative-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_ids: competitorIds }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t("creativeAnalysis", "analysisFailed"));
        return;
      }

      const data: CreativeAnalysisResult = await res.json();
      setResult(data);
    } catch {
      setError(t("creativeAnalysis", "analysisFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (disabled) return null;

  return (
    <div className="space-y-4">
      {!result && (
        <Button
          onClick={handleClick}
          disabled={loading}
          size="lg"
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("creativeAnalysis", "analyzing")}
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              {t("creativeAnalysis", "launchAnalysis")}
            </>
          )}
        </Button>
      )}
      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}
      {result && (
        <AnalysisReport result={result} onClose={() => setResult(null)} />
      )}
    </div>
  );
}
