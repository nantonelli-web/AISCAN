"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { CreativeAnalysisResult } from "@/lib/ai/creative-analysis";

export function AnalysisReport({
  result,
  mode,
}: {
  result: CreativeAnalysisResult;
  mode: "copywriter" | "creativeDirector";
  onClose: () => void;
}) {
  const { t } = useT();

  if (mode === "copywriter") {
    if (!result.copywriterReport) {
      return <AgentFailed text={t("creativeAnalysis", "copywriterFailed")} />;
    }
    const report = result.copywriterReport;
    // Defensive guard: cached reports from before the server-side
    // normalizer could have a non-array `brandAnalyses`. Render the
    // failed state instead of crashing on `.map`.
    if (!Array.isArray(report.brandAnalyses)) {
      return <AgentFailed text={t("creativeAnalysis", "copywriterFailed")} />;
    }
    // Empty brandAnalyses signals an explicit skip (e.g. Google text-
    // only brands where the comparison is structurally meaningless).
    // Render a single centred message card instead of an empty grid.
    if (report.brandAnalyses.length === 0) {
      return <SkippedAnalysisCard message={String(report.comparison ?? "")} />;
    }
    return (
      <div className="space-y-4">
        <div className={cn("grid gap-4", report.brandAnalyses.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3")}>
          {report.brandAnalyses.map((brand) => (
            <Card key={brand.brandName} className="bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gold">{brand.brandName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label={t("creativeAnalysis", "toneOfVoice")} value={brand.toneOfVoice} />
                <Field label={t("creativeAnalysis", "copyStyle")} value={brand.copyStyle} />
                {brand.emotionalTriggers?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      {t("creativeAnalysis", "emotionalTriggers")}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {brand.emotionalTriggers.map((trigger) => (
                        <Badge key={trigger} variant="gold">{trigger}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <Field label={t("creativeAnalysis", "ctaPatterns")} value={brand.ctaPatterns} />
                <Field label={t("creativeAnalysis", "strengths")} value={brand.strengths} highlight="positive" />
                <Field label={t("creativeAnalysis", "weaknesses")} value={brand.weaknesses} highlight="negative" />
              </CardContent>
            </Card>
          ))}
        </div>
        <HighlightCard label={t("creativeAnalysis", "comparison")} text={report.comparison} />
        <HighlightCard label={t("creativeAnalysis", "recommendations")} text={report.recommendations} />
      </div>
    );
  }

  // Creative Director
  if (!result.creativeDirectorReport) {
    return <AgentFailed text={t("creativeAnalysis", "creativeDirectorFailed")} />;
  }
  const report = result.creativeDirectorReport;
  if (!Array.isArray(report.brandAnalyses)) {
    return <AgentFailed text={t("creativeAnalysis", "creativeDirectorFailed")} />;
  }
  // Same skipped-analysis path as copywriter — empty brandAnalyses
  // means the comparison was explicitly refused (asymmetric image
  // availability, all-text selection, etc.). Show one card.
  if (report.brandAnalyses.length === 0) {
    return <SkippedAnalysisCard message={String(report.comparison ?? "")} />;
  }
  return (
    <div className="space-y-4">
      <div className={cn("grid gap-4", report.brandAnalyses.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3")}>
        {report.brandAnalyses.map((brand) => (
          <Card key={brand.brandName} className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gold">{brand.brandName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label={t("creativeAnalysis", "visualStyle")} value={brand.visualStyle} />
              <Field label={t("creativeAnalysis", "colorPalette")} value={brand.colorPalette} />
              <Field label={t("creativeAnalysis", "photographyStyle")} value={brand.photographyStyle} />
              <Field label={t("creativeAnalysis", "brandConsistency")} value={brand.brandConsistency} />
              <Field label={t("creativeAnalysis", "formatPreferences")} value={brand.formatPreferences} />
              <Field label={t("creativeAnalysis", "strengths")} value={brand.strengths} highlight="positive" />
              <Field label={t("creativeAnalysis", "weaknesses")} value={brand.weaknesses} highlight="negative" />
            </CardContent>
          </Card>
        ))}
      </div>
      <HighlightCard label={t("creativeAnalysis", "comparison")} text={report.comparison} />
      <HighlightCard label={t("creativeAnalysis", "recommendations")} text={report.recommendations} />
    </div>
  );
}

/**
 * Render a per-brand AI field. The server-side normalizer guarantees
 * `value` is a string, but historically the model returned the field
 * as a comparative object keyed by brand name (React error #31). Keep
 * a final coerce here as a belt-and-suspenders so any future schema
 * drift degrades gracefully instead of crashing the page.
 */
function Field({
  label,
  value,
  highlight,
}: {
  label: string;
  value: unknown;
  highlight?: "positive" | "negative";
}) {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (value == null) {
    text = "";
  } else {
    text = JSON.stringify(value).slice(0, 400);
  }
  if (!text) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className={cn(
        "text-xs leading-relaxed",
        highlight === "positive" && "text-emerald-600",
        highlight === "negative" && "text-gold",
        !highlight && "text-foreground"
      )}>{text}</p>
    </div>
  );
}

function HighlightCard({ label, text }: { label: string; text: unknown }) {
  // Same defensive coerce as `Field` — protects against the model
  // returning an object instead of a plain string.
  const safe =
    typeof text === "string"
      ? text
      : text == null
        ? ""
        : JSON.stringify(text).slice(0, 800);
  if (!safe) return null;
  return (
    <div className="rounded-lg border border-gold/20 bg-gold/5 p-4">
      <p className="text-[10px] uppercase tracking-wider text-gold mb-2">{label}</p>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{safe}</p>
    </div>
  );
}

function AgentFailed({ text }: { text: string }) {
  return (
    <div className="py-16 text-center space-y-2">
      <AlertCircle className="size-8 text-muted-foreground/50 mx-auto" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/**
 * Single explanatory card rendered when an AI section is intentionally
 * skipped — e.g. Google text-only brands where the visual comparison is
 * structurally meaningless. Distinct from `AgentFailed` because this is
 * not a model error, it's a deliberate refusal that the user should
 * read as informative, not as something to retry.
 */
function SkippedAnalysisCard({ message }: { message: string }) {
  if (!message) {
    return null;
  }
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-6 text-center max-w-2xl mx-auto">
      <AlertCircle className="size-8 text-muted-foreground/60 mx-auto mb-3" />
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
        {message}
      </p>
    </div>
  );
}
