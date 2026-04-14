"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Pen, Palette, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { CreativeAnalysisResult } from "@/lib/ai/creative-analysis";

type Tab = "copywriter" | "creativeDirector";

export function AnalysisReport({
  result,
  onClose,
}: {
  result: CreativeAnalysisResult;
  onClose: () => void;
}) {
  const hasCopy = !!result.copywriterReport;
  const hasVisual = !!result.creativeDirectorReport;
  const [activeTab, setActiveTab] = useState<Tab>(
    hasCopy ? "copywriter" : "creativeDirector"
  );
  const { t } = useT();

  return (
    <Card className="border-gold/30">
      {/* Header */}
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-lg font-serif">
            {t("creativeAnalysis", "title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t("creativeAnalysis", "subtitle")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="shrink-0"
        >
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-3">
          <button
            onClick={() => setActiveTab("copywriter")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === "copywriter"
                ? "bg-gold text-gold-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Pen className="size-3.5" />
            {t("creativeAnalysis", "copywriterTitle")}
            {!hasCopy && <AlertCircle className="size-3 text-red-400" />}
          </button>
          <button
            onClick={() => setActiveTab("creativeDirector")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === "creativeDirector"
                ? "bg-gold text-gold-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Palette className="size-3.5" />
            {t("creativeAnalysis", "creativeDirectorTitle")}
            {!hasVisual && <AlertCircle className="size-3 text-red-400" />}
          </button>
        </div>

        {/* Copywriter Tab */}
        {activeTab === "copywriter" && (
          hasCopy ? (
            <div className="space-y-4">
              <div
                className={cn(
                  "grid gap-4",
                  result.copywriterReport!.brandAnalyses.length === 2
                    ? "grid-cols-1 md:grid-cols-2"
                    : "grid-cols-1 md:grid-cols-3"
                )}
              >
                {result.copywriterReport!.brandAnalyses.map((brand) => (
                  <Card key={brand.brandName} className="bg-muted/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gold">
                        {brand.brandName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Field
                        label={t("creativeAnalysis", "toneOfVoice")}
                        value={brand.toneOfVoice}
                      />
                      <Field
                        label={t("creativeAnalysis", "copyStyle")}
                        value={brand.copyStyle}
                      />
                      {brand.emotionalTriggers?.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                            {t("creativeAnalysis", "emotionalTriggers")}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {brand.emotionalTriggers.map((trigger) => (
                              <Badge key={trigger} variant="gold">
                                {trigger}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <Field
                        label={t("creativeAnalysis", "ctaPatterns")}
                        value={brand.ctaPatterns}
                      />
                      <Field
                        label={t("creativeAnalysis", "strengths")}
                        value={brand.strengths}
                        highlight="positive"
                      />
                      <Field
                        label={t("creativeAnalysis", "weaknesses")}
                        value={brand.weaknesses}
                        highlight="negative"
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <ComparisonCard
                label={t("creativeAnalysis", "comparison")}
                text={result.copywriterReport!.comparison}
              />
              <ComparisonCard
                label={t("creativeAnalysis", "recommendations")}
                text={result.copywriterReport!.recommendations}
              />
            </div>
          ) : (
            <AgentFailedMessage t={t} agent="copywriter" />
          )
        )}

        {/* Creative Director Tab */}
        {activeTab === "creativeDirector" && (
          hasVisual ? (
            <div className="space-y-4">
              <div
                className={cn(
                  "grid gap-4",
                  result.creativeDirectorReport!.brandAnalyses.length === 2
                    ? "grid-cols-1 md:grid-cols-2"
                    : "grid-cols-1 md:grid-cols-3"
                )}
              >
                {result.creativeDirectorReport!.brandAnalyses.map((brand) => (
                  <Card key={brand.brandName} className="bg-muted/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gold">
                        {brand.brandName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Field
                        label={t("creativeAnalysis", "visualStyle")}
                        value={brand.visualStyle}
                      />
                      <Field
                        label={t("creativeAnalysis", "colorPalette")}
                        value={brand.colorPalette}
                      />
                      <Field
                        label={t("creativeAnalysis", "photographyStyle")}
                        value={brand.photographyStyle}
                      />
                      <Field
                        label={t("creativeAnalysis", "brandConsistency")}
                        value={brand.brandConsistency}
                      />
                      <Field
                        label={t("creativeAnalysis", "formatPreferences")}
                        value={brand.formatPreferences}
                      />
                      <Field
                        label={t("creativeAnalysis", "strengths")}
                        value={brand.strengths}
                        highlight="positive"
                      />
                      <Field
                        label={t("creativeAnalysis", "weaknesses")}
                        value={brand.weaknesses}
                        highlight="negative"
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <ComparisonCard
                label={t("creativeAnalysis", "comparison")}
                text={result.creativeDirectorReport!.comparison}
              />
              <ComparisonCard
                label={t("creativeAnalysis", "recommendations")}
                text={result.creativeDirectorReport!.recommendations}
              />
            </div>
          ) : (
            <AgentFailedMessage t={t} agent="creativeDirector" />
          )
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "positive" | "negative";
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </p>
      <p
        className={cn(
          "text-xs leading-relaxed",
          highlight === "positive" && "text-emerald-400",
          highlight === "negative" && "text-amber-400",
          !highlight && "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ComparisonCard({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-lg border border-gold/20 bg-gold/5 p-4">
      <p className="text-[10px] uppercase tracking-wider text-gold mb-2">
        {label}
      </p>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
        {text}
      </p>
    </div>
  );
}

function AgentFailedMessage({
  t,
  agent,
}: {
  t: (s: string, k: string) => string;
  agent: string;
}) {
  return (
    <div className="py-12 text-center space-y-2">
      <AlertCircle className="size-8 text-muted-foreground/50 mx-auto" />
      <p className="text-sm text-muted-foreground">
        {agent === "copywriter"
          ? t("creativeAnalysis", "copywriterFailed")
          : t("creativeAnalysis", "creativeDirectorFailed")}
      </p>
    </div>
  );
}
