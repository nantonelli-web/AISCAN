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
 * AI Compare report — TOPIC-FIRST horizontal layout.
 *
 * Earlier iterations (v1 wall-of-text, v2 tinted bg, v3
 * border-left-4) all kept a brand-first column layout where
 * each brand was a vertical stack of topics. The user
 * flagged 2026-05-04 evening:
 *
 *   "dividi i topics in box divisi tra loro da una riga in
 *    modo che si eviti questo effetto di movimento tra una
 *    colonna e l'altra che fa venire il mal di mare. La
 *    parte punti di forza e di debolezza identificala meglio
 *    e separala dalle altre sopra. Evita i colori accesi."
 *
 * v4 (this file):
 *
 *   • Topic-first grid. Each topic (tone, palette, ecc.)
 *     becomes a self-contained row inside one big Card. Inside
 *     the row, brands are columns. Reading left-to-right within
 *     a row is one topic only — eliminates the column-shift
 *     "seasickness" because every topic resets the baseline.
 *   • Topics separated by a horizontal divider (divide-y on
 *     the parent CardContent).
 *   • Strengths + Weaknesses pulled out of the topical grid
 *     into a dedicated section card below. Per-brand evaluation
 *     in muted-bordered tiles, with a small icon dot in soft
 *     emerald/amber (no bright borders, no full bg tints).
 *   • Brand column headers in muted-gold uppercase eyebrow,
 *     not full gold cards.
 */

type EvalBrand = { name: string; strengths: unknown; weaknesses: unknown };

type TopicCell =
  | { kind: "text"; value: string }
  | { kind: "tags"; tags: string[] };

interface TopicRow {
  icon: LucideIcon;
  label: string;
  cells: TopicCell[];
}

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

    const brandsArr = report.brandAnalyses;
    const brandNames = brandsArr.map((b) => b.brandName);

    const topics: TopicRow[] = [
      {
        icon: Mic2,
        label: t("creativeAnalysis", "toneOfVoice"),
        cells: brandsArr.map((b) => ({ kind: "text", value: coerce(b.toneOfVoice) })),
      },
      {
        icon: PenLine,
        label: t("creativeAnalysis", "copyStyle"),
        cells: brandsArr.map((b) => ({ kind: "text", value: coerce(b.copyStyle) })),
      },
      {
        icon: Heart,
        label: t("creativeAnalysis", "emotionalTriggers"),
        cells: brandsArr.map((b) => ({
          kind: "tags",
          tags: Array.isArray(b.emotionalTriggers) ? b.emotionalTriggers : [],
        })),
      },
      {
        icon: MousePointerClick,
        label: t("creativeAnalysis", "ctaPatterns"),
        cells: brandsArr.map((b) => ({ kind: "text", value: coerce(b.ctaPatterns) })),
      },
    ];

    const evalBrands: EvalBrand[] = brandsArr.map((b) => ({
      name: b.brandName,
      strengths: b.strengths,
      weaknesses: b.weaknesses,
    }));

    return (
      <div className="space-y-6">
        <TopicGrid brandNames={brandNames} topics={topics} />
        <StrengthsWeaknessesSection
          brands={evalBrands}
          tStrengths={t("creativeAnalysis", "strengths")}
          tWeaknesses={t("creativeAnalysis", "weaknesses")}
          tHeading={t("creativeAnalysis", "evaluationHeading")}
        />
        <HighlightCard
          icon={Scale}
          label={t("creativeAnalysis", "comparison")}
          text={report.comparison}
          brandNames={brandNames}
        />
        <HighlightCard
          icon={Lightbulb}
          label={t("creativeAnalysis", "recommendations")}
          text={report.recommendations}
          brandNames={brandNames}
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

  const brandsArr = report.brandAnalyses;
  const brandNames = brandsArr.map((b) => b.brandName);

  const topics: TopicRow[] = [
    {
      icon: Palette,
      label: t("creativeAnalysis", "visualStyle"),
      cells: brandsArr.map((b) => ({ kind: "text", value: coerce(b.visualStyle) })),
    },
    {
      icon: Palette,
      label: t("creativeAnalysis", "colorPalette"),
      cells: brandsArr.map((b) => ({ kind: "text", value: coerce(b.colorPalette) })),
    },
    {
      icon: Camera,
      label: t("creativeAnalysis", "photographyStyle"),
      cells: brandsArr.map((b) => ({ kind: "text", value: coerce(b.photographyStyle) })),
    },
    {
      icon: Compass,
      label: t("creativeAnalysis", "brandConsistency"),
      cells: brandsArr.map((b) => ({ kind: "text", value: coerce(b.brandConsistency) })),
    },
    {
      icon: Shapes,
      label: t("creativeAnalysis", "formatPreferences"),
      cells: brandsArr.map((b) => ({ kind: "text", value: coerce(b.formatPreferences) })),
    },
  ];

  const evalBrands: EvalBrand[] = brandsArr.map((b) => ({
    name: b.brandName,
    strengths: b.strengths,
    weaknesses: b.weaknesses,
  }));

  return (
    <div className="space-y-6">
      <TopicGrid brandNames={brandNames} topics={topics} />
      <StrengthsWeaknessesSection
        brands={evalBrands}
        tStrengths={t("creativeAnalysis", "strengths")}
        tWeaknesses={t("creativeAnalysis", "weaknesses")}
        tHeading={t("creativeAnalysis", "evaluationHeading")}
      />
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
 * One topic = one row inside a single Card; rows are
 * separated by `divide-y` so the visual rhythm is "topic
 * stripe → divider → next topic stripe". Inside each row,
 * brand columns sit side-by-side under a small uppercase
 * brand label.
 */
function TopicGrid({
  brandNames,
  topics,
}: {
  brandNames: string[];
  topics: TopicRow[];
}) {
  const cols =
    brandNames.length === 2
      ? "grid-cols-1 md:grid-cols-2"
      : "grid-cols-1 md:grid-cols-3";
  return (
    <Card>
      <CardContent className="p-0 divide-y divide-border">
        {topics.map((topic) => {
          const Icon = topic.icon;
          return (
            <div key={topic.label} className="p-5 space-y-3">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="size-4 text-muted-foreground" />
                <span>{topic.label}</span>
              </div>
              <div className={cn("grid gap-x-6 gap-y-4", cols)}>
                {brandNames.map((name, idx) => {
                  const cell = topic.cells[idx];
                  return (
                    <div key={name} className="space-y-1.5">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-gold/90">
                        {name}
                      </p>
                      {cell?.kind === "tags" ? (
                        cell.tags.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">—</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {cell.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="muted"
                                className="text-[11px]"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )
                      ) : cell?.value ? (
                        <p className="text-sm leading-relaxed text-foreground">
                          {cell.value}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">—</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * Punti di forza + deboli — dedicated section under the
 * topical grid. Per-brand tile with a `bg-muted/20` border
 * (NO bright emerald/amber borders or pastel bg tints — user
 * flagged those twice). Each evaluation has a small circular
 * icon badge in soft emerald-100 / amber-100 carrying the
 * semantic; the body text is plain text-foreground for full
 * readability across themes.
 */
function StrengthsWeaknessesSection({
  brands,
  tStrengths,
  tWeaknesses,
  tHeading,
}: {
  brands: EvalBrand[];
  tStrengths: string;
  tWeaknesses: string;
  tHeading: string;
}) {
  const cols =
    brands.length === 2
      ? "grid-cols-1 md:grid-cols-2"
      : "grid-cols-1 md:grid-cols-3";
  return (
    <Card>
      <CardHeader className="pb-3 border-b border-border">
        <CardTitle className="text-sm inline-flex items-center gap-2">
          <Scale className="size-4 text-muted-foreground" />
          {tHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <div className={cn("grid gap-5", cols)}>
          {brands.map((b) => (
            <div
              key={b.name}
              className="space-y-4 border border-border rounded-md p-4 bg-muted/20"
            >
              <p className="text-[11px] uppercase tracking-wider font-semibold text-gold/90">
                {b.name}
              </p>
              <EvalBlock
                icon={Sparkles}
                label={tStrengths}
                tone="up"
                value={b.strengths}
              />
              <div className="h-px bg-border" />
              <EvalBlock
                icon={ShieldAlert}
                label={tWeaknesses}
                tone="down"
                value={b.weaknesses}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EvalBlock({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone: "up" | "down";
  value: unknown;
}) {
  const text = coerce(value);
  if (!text) return null;
  return (
    <div className="space-y-1.5">
      <p className="inline-flex items-center gap-2 text-xs font-semibold text-foreground">
        <span
          className={cn(
            "inline-flex items-center justify-center size-5 rounded-full shrink-0",
            tone === "up"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
          )}
        >
          <Icon className="size-3" />
        </span>
        {label}
      </p>
      <p className="text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  );
}

function coerce(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value).slice(0, 400);
}

/**
 * Detect "BRAND_NAME - …" / "BRAND_NAME:" sub-sections in a long
 * text and split it into per-brand chunks. Returns null when the
 * text doesn't seem brand-keyed (e.g. a flat narrative comparison),
 * so the caller falls back to a plain rendering.
 *
 * Why: the recommendations / comparison text from the LLM is
 * almost always structured as "BRAND A - … \n\n BRAND B - …",
 * but rendered as one flat <p> the brand names disappear into a
 * wall of text (user feedback 2026-05-04: "ricchissimo di testo,
 * leggibilità scarsa, i nomi dei brand sono quasi invisibili").
 *
 * Detection rules:
 *   - the match must START a line (line break or string start),
 *     to avoid catching cross-references inside paragraphs.
 *   - allowed separators after the brand name: " - ", " — ", " : "
 *     (whitespace optional). The model typically uses " - ".
 *   - case-insensitive match of the actual brand name.
 *   - we keep ONLY the first occurrence per brand — if the same
 *     name appears later in another brand's body, that's a
 *     reference, not a new section.
 *   - all configured brands must produce at least one match,
 *     otherwise the text is flat narrative and we return null.
 */
function splitByBrand(
  text: string,
  brandNames: string[],
): Array<{ name: string; body: string }> | null {
  if (brandNames.length < 2) return null;
  type M = { name: string; headerStart: number; headerEnd: number };
  const allMatches: M[] = [];
  for (const name of brandNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // (?:^|\n) anchors to line start. The capture absorbs the
    // brand text + optional separator so headerEnd lands at the
    // start of the body. Leading whitespace inside the line is
    // tolerated.
    const re = new RegExp(
      `(?:^|\\n)[ \\t]*(${escaped})[ \\t]*(?:[-—:]+)?[ \\t]*`,
      "gi",
    );
    const found: M[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // Don't double-count zero-width matches.
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const headerStart = m.index + (text[m.index] === "\n" ? 1 : 0);
      found.push({ name, headerStart, headerEnd: re.lastIndex });
    }
    if (found.length === 0) return null; // brand never starts a line → fallback
    allMatches.push(...found);
  }
  allMatches.sort((a, b) => a.headerStart - b.headerStart);
  // Keep only the first occurrence per brand (subsequent ones are
  // references inside another brand's section).
  const firsts: M[] = [];
  const seen = new Set<string>();
  for (const m of allMatches) {
    if (seen.has(m.name)) continue;
    seen.add(m.name);
    firsts.push(m);
  }
  if (firsts.length !== brandNames.length) return null;
  // Re-sort the firsts (already sorted but defensive — the iteration
  // order above could otherwise be misleading after dedup).
  firsts.sort((a, b) => a.headerStart - b.headerStart);
  const sections: Array<{ name: string; body: string }> = [];
  for (let i = 0; i < firsts.length; i++) {
    const cur = firsts[i];
    const next = firsts[i + 1];
    const body = text
      .slice(cur.headerEnd, next ? next.headerStart : undefined)
      .trim();
    sections.push({ name: cur.name, body });
  }
  return sections;
}

/**
 * Long-form section card. When the text contains per-brand
 * keyed sub-sections (the LLM almost always does this for
 * comparison + recommendations), splitByBrand picks them up
 * and we render one tile per brand with a strong gold header.
 * Otherwise we render the text flat. Either way the caller
 * passes the same props so we keep brand-name awareness even
 * for sections that turn out to be flat.
 */
function HighlightCard({
  icon: Icon,
  label,
  text,
  brandNames,
}: {
  icon: LucideIcon;
  label: string;
  text: unknown;
  brandNames?: string[];
}) {
  const safe =
    typeof text === "string"
      ? text
      : text == null
        ? ""
        : JSON.stringify(text).slice(0, 1600);
  if (!safe) return null;
  const sections = brandNames ? splitByBrand(safe, brandNames) : null;
  return (
    <Card>
      <CardHeader className="pb-3 border-b border-border">
        <CardTitle className="text-sm inline-flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {label}
        </CardTitle>
      </CardHeader>
      {sections ? (
        <CardContent className="p-0 divide-y divide-border">
          {sections.map((s) => (
            <div key={s.name} className="p-5 space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wider text-gold">
                {s.name}
              </p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                {s.body}
              </p>
            </div>
          ))}
        </CardContent>
      ) : (
        <CardContent className="p-5">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
            {safe}
          </p>
        </CardContent>
      )}
    </Card>
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
