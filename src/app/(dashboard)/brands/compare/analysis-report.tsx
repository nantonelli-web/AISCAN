"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Mic2,
  PenLine,
  Heart,
  MousePointerClick,
  Sparkles,
  ShieldAlert,
  Palette,
  Camera,
  Shapes,
  Compass,
  Scale,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { CreativeAnalysisResult } from "@/lib/ai/creative-analysis";

/**
 * AI Compare report renderer — copywriter + creative-director
 * agent output. Redesigned 2026-05-04 after user feedback:
 *
 *   "La parte di analisi AI (testo e immagini) è illegibile.
 *    Una valanga di testo scritto piccolo, senza un'icona a
 *    spezzare, i titoli di ogni paragrafo sono piccoli e di
 *    colore chiaro, hai usato anche un verde chiaro per una
 *    sezione specifica e non si legge quasi niente."
 *
 * Changes:
 *   - body text was text-xs (12px) → now text-sm (14px)
 *     leading-relaxed, with a base text-foreground colour.
 *   - field labels were text-[10px] uppercase muted → now
 *     text-xs font-semibold + a per-field icon, all in the
 *     foreground colour. Each field has an evocative lucide
 *     icon (Mic2 for tone-of-voice, Heart for emotional
 *     triggers, etc.) to break the wall of paragraphs.
 *   - the unreadable emerald-600 on muted bg for "strengths"
 *     was replaced with a tinted block (bg-emerald-50/60 with
 *     emerald-700 dark text) so it stays semantic but readable.
 *     "Weaknesses" mirrors with amber.
 *   - per-brand cards now use a stronger header (text-base
 *     font-semibold gold) so the brand name actually frames
 *     the section instead of disappearing.
 */

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
    if (!Array.isArray(report.brandAnalyses)) {
      return <AgentFailed text={t("creativeAnalysis", "copywriterFailed")} />;
    }
    if (report.brandAnalyses.length === 0) {
      return <SkippedAnalysisCard message={String(report.comparison ?? "")} />;
    }
    return (
      <div className="space-y-5">
        <div
          className={cn(
            "grid gap-4",
            report.brandAnalyses.length === 2
              ? "grid-cols-1 md:grid-cols-2"
              : "grid-cols-1 md:grid-cols-3",
          )}
        >
          {report.brandAnalyses.map((brand) => (
            <Card key={brand.brandName} className="bg-card">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-base font-semibold text-gold">
                  {brand.brandName}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <Field
                  icon={Mic2}
                  label={t("creativeAnalysis", "toneOfVoice")}
                  value={brand.toneOfVoice}
                />
                <Field
                  icon={PenLine}
                  label={t("creativeAnalysis", "copyStyle")}
                  value={brand.copyStyle}
                />
                {brand.emotionalTriggers?.length > 0 && (
                  <div className="space-y-1.5">
                    <FieldLabel
                      icon={Heart}
                      label={t("creativeAnalysis", "emotionalTriggers")}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {brand.emotionalTriggers.map((trigger) => (
                        <Badge key={trigger} variant="gold">
                          {trigger}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <Field
                  icon={MousePointerClick}
                  label={t("creativeAnalysis", "ctaPatterns")}
                  value={brand.ctaPatterns}
                />
                <Field
                  icon={Sparkles}
                  label={t("creativeAnalysis", "strengths")}
                  value={brand.strengths}
                  highlight="positive"
                />
                <Field
                  icon={ShieldAlert}
                  label={t("creativeAnalysis", "weaknesses")}
                  value={brand.weaknesses}
                  highlight="negative"
                />
              </CardContent>
            </Card>
          ))}
        </div>
        <HighlightCard
          icon={Scale}
          label={t("creativeAnalysis", "comparison")}
          text={report.comparison}
        />
        <HighlightCard
          icon={Lightbulb}
          label={t("creativeAnalysis", "recommendations")}
          text={report.recommendations}
        />
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
  if (report.brandAnalyses.length === 0) {
    return <SkippedAnalysisCard message={String(report.comparison ?? "")} />;
  }
  return (
    <div className="space-y-5">
      <div
        className={cn(
          "grid gap-4",
          report.brandAnalyses.length === 2
            ? "grid-cols-1 md:grid-cols-2"
            : "grid-cols-1 md:grid-cols-3",
        )}
      >
        {report.brandAnalyses.map((brand) => (
          <Card key={brand.brandName} className="bg-card">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-base font-semibold text-gold">
                {brand.brandName}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <Field
                icon={Palette}
                label={t("creativeAnalysis", "visualStyle")}
                value={brand.visualStyle}
              />
              <Field
                icon={Palette}
                label={t("creativeAnalysis", "colorPalette")}
                value={brand.colorPalette}
              />
              <Field
                icon={Camera}
                label={t("creativeAnalysis", "photographyStyle")}
                value={brand.photographyStyle}
              />
              <Field
                icon={Compass}
                label={t("creativeAnalysis", "brandConsistency")}
                value={brand.brandConsistency}
              />
              <Field
                icon={Shapes}
                label={t("creativeAnalysis", "formatPreferences")}
                value={brand.formatPreferences}
              />
              <Field
                icon={Sparkles}
                label={t("creativeAnalysis", "strengths")}
                value={brand.strengths}
                highlight="positive"
              />
              <Field
                icon={ShieldAlert}
                label={t("creativeAnalysis", "weaknesses")}
                value={brand.weaknesses}
                highlight="negative"
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <HighlightCard
        icon={Scale}
        label={t("creativeAnalysis", "comparison")}
        text={report.comparison}
      />
      <HighlightCard
        icon={Lightbulb}
        label={t("creativeAnalysis", "recommendations")}
        text={report.recommendations}
      />
    </div>
  );
}

/**
 * Per-field block. The `highlight` prop turns the field into a
 * tinted callout block — used for strengths (emerald) and
 * weaknesses (amber). Without the tint, both blended into the
 * surrounding paragraphs and the previous emerald-600-on-muted
 * was so low-contrast the user flagged it as unreadable.
 */
function Field({
  icon,
  label,
  value,
  highlight,
}: {
  icon: LucideIcon;
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
  if (highlight) {
    return (
      <div
        className={cn(
          "rounded-md border p-3 space-y-1.5",
          highlight === "positive"
            ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/40"
            : "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/40",
        )}
      >
        <FieldLabel
          icon={icon}
          label={label}
          tone={highlight === "positive" ? "emerald" : "amber"}
        />
        <p
          className={cn(
            "text-sm leading-relaxed",
            highlight === "positive"
              ? "text-emerald-900 dark:text-emerald-100"
              : "text-amber-900 dark:text-amber-100",
          )}
        >
          {text}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <FieldLabel icon={icon} label={label} />
      <p className="text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  );
}

function FieldLabel({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone?: "emerald" | "amber";
}) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
        tone === "emerald" && "text-emerald-700 dark:text-emerald-400",
        tone === "amber" && "text-amber-700 dark:text-amber-400",
        !tone && "text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </p>
  );
}

function HighlightCard({
  icon: Icon,
  label,
  text,
}: {
  icon: LucideIcon;
  label: string;
  text: unknown;
}) {
  const safe =
    typeof text === "string"
      ? text
      : text == null
        ? ""
        : JSON.stringify(text).slice(0, 800);
  if (!safe) return null;
  return (
    <div className="rounded-lg border border-gold/30 bg-gold/5 p-5 space-y-2.5">
      <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gold">
        <Icon className="size-4" />
        {label}
      </p>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
        {safe}
      </p>
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
