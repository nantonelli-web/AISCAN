"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  Label as ReLabel,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Pencil,
  Save,
  X as XIcon,
  DollarSign,
  Eye,
  MousePointerClick,
  Users,
  Percent,
  Gauge,
  Repeat,
  ShoppingCart,
  Heart,
  Camera,
  UserPlus,
  CalendarRange,
  Globe2,
  Image as ImageIcon,
  Video,
  Layers,
  Activity,
  Target,
  Sparkles,
  CalendarDays,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { AnalysisCta } from "@/components/perf/analysis-cta";
import {
  AnalysisBlock,
  type SectionAnalysis,
} from "@/components/perf/analysis-block";
import type {
  PerfDashboardData,
  MetaKpiAggregate,
  CampaignTypeBreakdown,
  CampaignTypeAssignment,
} from "@/types/perf";
import type { CampaignType } from "@/lib/perf/campaign-decoder";
import {
  HorizontalBarChart,
} from "@/components/dashboard/benchmark-charts";

type ComparisonMode = "none" | "previous" | "week" | "yoy" | "custom";

const PIE_COLORS = [
  "#d9a82f",
  "#5b7ea3",
  "#6b8e6b",
  "#d97757",
  "#8a6bb0",
  "#94a3b8",
];

function formatNumber(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(n);
}

function formatMoney(n: number, currency: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${n.toLocaleString()} ${currency}`;
    }
  }
  return n.toLocaleString();
}

function deltaPct(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function deltaPctInverse(curr: number | null, prev: number | null): number | null {
  const d = deltaPct(curr, prev);
  return d == null ? null : -d;
}

type AccentTone = "gold" | "blue" | "green" | "purple" | "rose" | "amber" | "slate";

const TONES: Record<AccentTone, { ring: string; bg: string; text: string }> = {
  gold: { ring: "ring-amber-500/20", bg: "bg-amber-500/10", text: "text-amber-500" },
  blue: { ring: "ring-sky-500/20", bg: "bg-sky-500/10", text: "text-sky-500" },
  green: { ring: "ring-emerald-500/20", bg: "bg-emerald-500/10", text: "text-emerald-500" },
  purple: { ring: "ring-violet-500/20", bg: "bg-violet-500/10", text: "text-violet-500" },
  rose: { ring: "ring-rose-500/20", bg: "bg-rose-500/10", text: "text-rose-500" },
  amber: { ring: "ring-orange-500/20", bg: "bg-orange-500/10", text: "text-orange-500" },
  slate: { ring: "ring-slate-500/20", bg: "bg-slate-500/10", text: "text-slate-500" },
};

function KpiCard({
  label,
  value,
  delta,
  invertColors = false,
  currency,
  isMoney = false,
  isPercent = false,
  hint,
  icon: Icon = Activity,
  tone = "slate",
  forceTwoDecimals = false,
  hideIfZero = false,
}: {
  label: string;
  value: number | null;
  delta: number | null;
  invertColors?: boolean;
  currency?: string | null;
  isMoney?: boolean;
  isPercent?: boolean;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: AccentTone;
  forceTwoDecimals?: boolean;
  /** Se true, la card non viene renderizzata quando il valore e'
   *  null o 0. Utile per KPI accessori (engagement, IG follow,
   *  ricavi) dove '0' significa 'non rilevante' invece di 'errore'. */
  hideIfZero?: boolean;
}) {
  if (hideIfZero && (value == null || value === 0)) return null;
  const fmt = (n: number) =>
    forceTwoDecimals
      ? new Intl.NumberFormat("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n)
      : formatNumber(n);
  const display =
    value == null
      ? "—"
      : isMoney
        ? formatMoney(value, currency ?? null)
        : isPercent
          ? `${fmt(value)}%`
          : fmt(value);
  const deltaIsPositive = delta != null && delta > 0;
  const deltaIsNegative = delta != null && delta < 0;
  const goodColor = invertColors ? "text-rose-400" : "text-emerald-400";
  const badColor = invertColors ? "text-emerald-400" : "text-rose-400";
  const t = TONES[tone];
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {label}
          </p>
          <div className={`size-7 rounded-md grid place-items-center ${t.bg} ${t.text}`}>
            <Icon className="size-3.5" />
          </div>
        </div>
        <p className="text-2xl font-semibold tabular-nums leading-tight">
          {display}
        </p>
        <div className="flex items-center justify-between gap-2 min-h-[18px]">
          {delta != null ? (
            <p
              className={`text-[11px] tabular-nums inline-flex items-center gap-0.5 font-medium ${
                deltaIsPositive
                  ? goodColor
                  : deltaIsNegative
                    ? badColor
                    : "text-muted-foreground"
              }`}
            >
              {deltaIsPositive ? (
                <TrendingUp className="size-3" />
              ) : deltaIsNegative ? (
                <TrendingDown className="size-3" />
              ) : (
                <Minus className="size-3" />
              )}
              {delta > 0 ? "+" : ""}
              {formatNumber(Math.round(delta * 10) / 10)}%
            </p>
          ) : (
            <span />
          )}
        </div>
        {hint && (
          <p className="text-[10.5px] text-muted-foreground leading-snug pt-1 border-t border-border/40">
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function buildDeltaMap(
  current: MetaKpiAggregate,
  prev: MetaKpiAggregate | null,
): Record<string, number | null> {
  if (!prev) {
    return {
      amountSpent: null,
      impressions: null,
      reach: null,
      effectiveClicks: null,
      effectiveCtr: null,
      cpm: null,
      effectiveCpc: null,
      roas: null,
      frequency: null,
      purchases: null,
      purchaseValue: null,
      costPerPurchase: null,
      postEngagements: null,
      instagramProfileVisits: null,
      instagramFollows: null,
    };
  }
  return {
    amountSpent: deltaPct(current.amountSpent, prev.amountSpent),
    impressions: deltaPct(current.impressions, prev.impressions),
    reach: deltaPct(current.reach, prev.reach),
    effectiveClicks: deltaPct(current.effectiveClicks, prev.effectiveClicks),
    effectiveCtr: deltaPct(current.effectiveCtr, prev.effectiveCtr),
    cpm: deltaPctInverse(current.cpm, prev.cpm),
    effectiveCpc: deltaPctInverse(current.effectiveCpc, prev.effectiveCpc),
    roas: deltaPct(current.roas, prev.roas),
    frequency: deltaPct(current.frequency, prev.frequency),
    purchases: deltaPct(current.purchases, prev.purchases),
    purchaseValue: deltaPct(current.purchaseValue, prev.purchaseValue),
    costPerPurchase: deltaPctInverse(
      current.costPerPurchase,
      prev.costPerPurchase,
    ),
    postEngagements: deltaPct(current.postEngagements, prev.postEngagements),
    instagramProfileVisits: deltaPct(
      current.instagramProfileVisits,
      prev.instagramProfileVisits,
    ),
    instagramFollows: deltaPct(
      current.instagramFollows,
      prev.instagramFollows,
    ),
  };
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  tone = "slate",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  tone?: AccentTone;
}) {
  const t = TONES[tone];
  return (
    <div className="flex items-start gap-3">
      <div className={`size-9 rounded-lg grid place-items-center ${t.bg} ${t.text}`}>
        <Icon className="size-4" />
      </div>
      <div className="space-y-0.5 flex-1 min-w-0">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h3>
        {description && (
          <p className="text-[11.5px] text-muted-foreground leading-snug">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export function DashboardClient({ importId }: { importId: string }) {
  const { t } = useT();
  const [mode, setMode] = useState<ComparisonMode>("none");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [weekCurrent, setWeekCurrent] = useState("");
  const [weekCompare, setWeekCompare] = useState("");
  const [data, setData] = useState<PerfDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, SectionAnalysis>>({});
  /** true se l'utente vede analisi salvate in una lingua diversa da
   *  quella corrente (es. UI in EN ma rows solo in IT). L'UI mostra
   *  un hint che invita a rigenerare per tradurre. */
  const [analysesCrossLocale, setAnalysesCrossLocale] = useState(false);

  // Helper per mappare lo stato comparison nei params (sia per
  // dashboard fetch sia per il CTA analysis che vuole essere
  // coerente con quello che l'utente sta vedendo).
  const compareParams = useMemo(() => {
    const p: Record<string, string> = { compare: mode };
    if (mode === "custom" && customFrom && customTo) {
      p.compare_from = customFrom;
      p.compare_to = customTo;
    }
    if (mode === "week" && weekCurrent && weekCompare) {
      p.week_current = weekCurrent;
      p.week_compare = weekCompare;
    }
    return p;
  }, [mode, customFrom, customTo, weekCurrent, weekCompare]);

  // Carica le analisi salvate ogni volta che cambia l'import.
  const loadAnalyses = async () => {
    try {
      const r = await fetch(`/api/perf/imports/${importId}/analysis`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const j = (await r.json()) as {
        analyses?: SectionAnalysis[];
        cross_locale?: boolean;
      };
      const map: Record<string, SectionAnalysis> = {};
      for (const a of j.analyses ?? []) map[a.section] = a;
      setAnalyses(map);
      setAnalysesCrossLocale(Boolean(j.cross_locale));
    } catch {
      /* ignored */
    }
  };
  useEffect(() => {
    loadAnalyses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId]);

  // Auto-translate al cambio lingua. Quando le analisi visualizzate
  // sono fallback cross-locale (l'utente ha cambiato lingua ma per
  // questa lingua non esistono ancora righe), facciamo
  // automaticamente la traduzione cosi' all'utente non serve
  // cliccare un bottone aggiuntivo. Una sola volta per (importId,
  // locale): dopo, le analisi nella locale corrente esistono nel DB
  // e cross_locale torna false.
  const autoTranslateAttempted = useRef<Set<string>>(new Set());
  const [autoTranslating, setAutoTranslating] = useState(false);
  useEffect(() => {
    if (!analysesCrossLocale) return;
    if (Object.keys(analyses).length === 0) return;
    const key = `${importId}`;
    if (autoTranslateAttempted.current.has(key)) return;
    autoTranslateAttempted.current.add(key);

    let cancelled = false;
    setAutoTranslating(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/perf/imports/${importId}/analysis`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: "translate",
              force_overwrite_edited: false,
            }),
          },
        );
        if (cancelled) return;
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status !== 402) {
            console.warn(
              "[adv-performance] auto-translate failed:",
              j.error ?? res.status,
            );
          }
          return;
        }
        await loadAnalyses();
      } catch (e) {
        console.warn("[adv-performance] auto-translate exception:", e);
      } finally {
        if (!cancelled) setAutoTranslating(false);
      }
    })();
    return () => {
      cancelled = true;
      setAutoTranslating(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysesCrossLocale, importId]);

  const updateAnalysis = (next: SectionAnalysis | null) => {
    if (!next) return;
    setAnalyses((prev) => ({ ...prev, [next.section]: next }));
  };

  const hasAnyAnalysis = Object.keys(analyses).length > 0;

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("compare", mode);
    if (mode === "custom" && customFrom && customTo) {
      params.set("compare_from", customFrom);
      params.set("compare_to", customTo);
    }
    if (mode === "week" && weekCurrent && weekCompare) {
      params.set("week_current", weekCurrent);
      params.set("week_compare", weekCompare);
    }
    // Debounce 150ms cosi i cambi consecutivi (es. utente che apre
    // un select e seleziona dopo 50ms) non triggherano 2 fetch.
    // Non-blocking: setLoading=true ma data rimane mostrato finche'
    // arriva la risposta nuova, evitando lo "schermo bianco".
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetch(`/api/perf/imports/${importId}/dashboard?${params.toString()}`, {
        cache: "no-store",
        signal: ctrl.signal,
      })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (!ok) {
            setError(j.error ?? "Failed to load dashboard");
          } else {
            const d = j as PerfDashboardData;
            setData(d);
            if (
              d.weeks.length >= 2 &&
              mode === "week" &&
              (!weekCurrent || !weekCompare)
            ) {
              setWeekCurrent((cur) => cur || d.weeks[d.weeks.length - 1]);
              setWeekCompare((cmp) => cmp || d.weeks[d.weeks.length - 2]);
            }
          }
        })
        .catch((e) => {
          if (e instanceof Error && e.name === "AbortError") return;
          setError(e instanceof Error ? e.message : "Error");
        })
        .finally(() => setLoading(false));
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [importId, mode, customFrom, customTo, weekCurrent, weekCompare]);

  const deltas = useMemo(() => {
    if (!data) return null;
    return buildDeltaMap(data.current, data.comparison.aggregate);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="grid place-items-center py-16 text-sm text-muted-foreground gap-2">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-rose-400">
          {error}
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const k = data.current;

  const showPurchases = k.purchases > 0;
  const showEngagement =
    k.postEngagements > 0 ||
    k.instagramProfileVisits > 0 ||
    k.instagramFollows > 0;
  const hasRoasData =
    data.topByCampaignRoas.some((c) => (c.roas ?? 0) > 0) || (k.roas ?? 0) > 0;

  // Country totals for percentages
  const countriesTotalSpend = data.countries.reduce((s, c) => s + c.spend, 0);
  const countriesTotalImp = data.countries.reduce((s, c) => s + c.impressions, 0);
  const countriesTotalClicks = data.countries.reduce((s, c) => s + c.clicks, 0);
  const countriesTotalPurch = data.countries.reduce(
    (s, c) => s + c.purchases,
    0,
  );
  const showCountryPurchases = countriesTotalPurch > 0;

  return (
    <div className="space-y-6 relative">
      {loading && (
        <div className="fixed top-4 right-4 z-40 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/95 backdrop-blur border border-border shadow-md text-xs text-muted-foreground print:hidden">
          <Loader2 className="size-3.5 animate-spin text-amber-500" />
          Aggiornamento dati…
        </div>
      )}
      {autoTranslating && !loading && (
        <div className="fixed top-4 right-4 z-40 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/95 backdrop-blur border border-violet-500/30 shadow-md text-xs text-violet-700 dark:text-violet-400 print:hidden">
          <Loader2 className="size-3.5 animate-spin text-violet-500" />
          Traduzione analisi nella lingua attiva…
        </div>
      )}

      {/* AI analysis CTA — top */}
      <AnalysisCta
        importId={importId}
        hasAnalyses={hasAnyAnalysis}
        position="top"
        onGenerated={loadAnalyses}
        compareParams={compareParams}
        crossLocale={analysesCrossLocale}
      />

      {/* Comparison switcher */}
      <Card className="print:hidden">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-lg grid place-items-center bg-amber-500/10 text-amber-500">
              <CalendarRange className="size-4" />
            </div>
            <div className="space-y-0.5 flex-1 min-w-0">
              <h3 className="text-sm font-semibold uppercase tracking-wider">
                {t("advPerformance", "comparisonNone")}
              </h3>
              <p className="text-[11.5px] text-muted-foreground leading-snug">
                {t("advPerformance", "weekPickHint")}
              </p>
            </div>
            {data.comparison.label && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {data.comparison.label}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-1">
            {(
              [
                { id: "none", label: t("advPerformance", "comparisonNone"), icon: XIcon },
                { id: "week", label: t("advPerformance", "comparisonWeek"), icon: CalendarDays },
                { id: "custom", label: t("advPerformance", "comparisonCustom"), icon: CalendarRange },
              ] as { id: ComparisonMode; label: string; icon: React.ComponentType<{ className?: string }> }[]
            ).map((opt) => {
              const Icon = opt.icon;
              const active = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode(opt.id)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors inline-flex items-center gap-1.5 ${
                    active
                      ? "bg-gold/15 text-gold border-gold/30 font-medium"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {mode === "custom" && (
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/50 mt-1">
              <Label htmlFor="cf" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                from
              </Label>
              <Input
                id="cf"
                type="date"
                min={data.dataMinDate ?? undefined}
                max={data.dataMaxDate ?? undefined}
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 text-xs w-[160px]"
              />
              <Label htmlFor="ct" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                to
              </Label>
              <Input
                id="ct"
                type="date"
                min={data.dataMinDate ?? undefined}
                max={data.dataMaxDate ?? undefined}
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 text-xs w-[160px]"
              />
              {data.dataMinDate && data.dataMaxDate && (
                <span className="text-[10.5px] text-muted-foreground italic">
                  ({data.dataMinDate} → {data.dataMaxDate})
                </span>
              )}
            </div>
          )}

          {mode === "week" && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              {data.weeks.length === 0 ? (
                <p className="text-[11px] text-amber-400 inline-flex items-center gap-1">
                  <HelpCircle className="size-3.5" />
                  {t("advPerformance", "weeksUnavailable")}
                </p>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t("advPerformance", "weekCurrent")}
                    </Label>
                    <select
                      value={weekCurrent}
                      onChange={(e) => setWeekCurrent(e.target.value)}
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      <option value="">—</option>
                      {data.weeks.map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-muted-foreground text-xs">vs</span>
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t("advPerformance", "weekCompare")}
                    </Label>
                    <select
                      value={weekCompare}
                      onChange={(e) => setWeekCompare(e.target.value)}
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      <option value="">—</option>
                      {data.weeks
                        .filter((w) => w !== weekCurrent)
                        .map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "custom" && !data.comparison.aggregate && (
            <p className="text-[11px] text-amber-400">
              {t("advPerformance", "noComparisonData")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* KPI overview section */}
      <section className="space-y-3">
        <SectionHeader
          icon={Activity}
          tone="gold"
          title={t("advPerformance", "overviewSectionTitle")}
          description={t("advPerformance", "overviewSectionDescription")}
        />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-4">
          <KpiCard
            label={t("advPerformance", "kpiSpend")}
            value={k.amountSpent}
            delta={deltas?.amountSpent ?? null}
            isMoney
            currency={data.currency}
            hint={t("advPerformance", "kpiSpendHint")}
            icon={DollarSign}
            tone="gold"
          />
          <KpiCard
            label={t("advPerformance", "kpiImpressions")}
            value={k.impressions}
            delta={deltas?.impressions ?? null}
            hint={t("advPerformance", "kpiImpressionsHint")}
            icon={Eye}
            tone="blue"
          />
          <KpiCard
            label={t("advPerformance", "kpiClicks")}
            value={k.effectiveClicks}
            delta={deltas?.effectiveClicks ?? null}
            hint={t("advPerformance", "kpiClicksHint")}
            icon={MousePointerClick}
            tone="blue"
          />
          <KpiCard
            label={t("advPerformance", "kpiReach")}
            value={k.reach}
            delta={deltas?.reach ?? null}
            hint={t("advPerformance", "kpiReachHint")}
            icon={Users}
            tone="purple"
            hideIfZero
          />
          <KpiCard
            label={t("advPerformance", "kpiCtr")}
            value={k.effectiveCtr}
            delta={deltas?.effectiveCtr ?? null}
            isPercent
            hint={t("advPerformance", "kpiCtrHint")}
            icon={Percent}
            tone="green"
          />
          <KpiCard
            label={t("advPerformance", "kpiCpm")}
            value={k.cpm}
            delta={deltas?.cpm ?? null}
            invertColors
            isMoney
            currency={data.currency}
            hint={t("advPerformance", "kpiCpmHint")}
            icon={Gauge}
            tone="amber"
          />
          <KpiCard
            label={t("advPerformance", "kpiCpc")}
            value={k.effectiveCpc}
            delta={deltas?.effectiveCpc ?? null}
            invertColors
            isMoney
            currency={data.currency}
            hint={t("advPerformance", "kpiCpcHint")}
            icon={Gauge}
            tone="amber"
          />
          <KpiCard
            label={t("advPerformance", "kpiFrequency")}
            value={k.frequency}
            delta={deltas?.frequency ?? null}
            hint={t("advPerformance", "kpiFrequencyHint")}
            icon={Repeat}
            tone="purple"
            hideIfZero
          />
        </div>
        <AnalysisBlock
          importId={importId}
          section="overview"
          analysis={analyses.overview ?? null}
          onUpdated={updateAnalysis}
        />
      </section>

      {/* Purchases & ROI */}
      {showPurchases && (
        <section className="space-y-3">
          <SectionHeader
            icon={ShoppingCart}
            tone="green"
            title={t("advPerformance", "purchasesSectionTitle")}
            description={t("advPerformance", "purchasesSectionDescription")}
          />
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t("advPerformance", "kpiPurchases")}
              value={k.purchases}
              delta={deltas?.purchases ?? null}
              hint={t("advPerformance", "kpiPurchasesHint")}
              icon={ShoppingCart}
              tone="green"
            />
            <KpiCard
              label={t("advPerformance", "kpiPurchaseValue")}
              value={k.purchaseValue}
              delta={deltas?.purchaseValue ?? null}
              isMoney
              currency={data.currency}
              hint={t("advPerformance", "kpiPurchaseValueHint")}
              icon={DollarSign}
              tone="green"
              hideIfZero
            />
            <KpiCard
              label={t("advPerformance", "kpiCostPerPurchase")}
              value={k.costPerPurchase}
              delta={deltas?.costPerPurchase ?? null}
              invertColors
              isMoney
              currency={data.currency}
              hint={t("advPerformance", "kpiCostPerPurchaseHint")}
              icon={Gauge}
              tone="amber"
            />
            {/* ROAS visibile sempre quando ci sono purchases. Se
                manca il purchase value (k.roas == null) mostriamo 0
                cosi il numero appare 0.00 e l'utente capisce che
                il file non aveva tracking conversion value. */}
            <KpiCard
              label={t("advPerformance", "kpiRoas")}
              value={k.roas ?? 0}
              delta={deltas?.roas ?? null}
              hint={t("advPerformance", "kpiRoasHint")}
              icon={Target}
              tone="green"
              forceTwoDecimals
            />
          </div>
          <AnalysisBlock
            importId={importId}
            section="purchases"
            analysis={analyses.purchases ?? null}
            onUpdated={updateAnalysis}
          />
        </section>
      )}

      {/* Engagement & Social */}
      {showEngagement && (
        <section className="space-y-3">
          <SectionHeader
            icon={Heart}
            tone="rose"
            title={t("advPerformance", "engagementSectionTitle")}
            description={t("advPerformance", "engagementSectionDescription")}
          />
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <KpiCard
              label={t("advPerformance", "kpiPostEngagements")}
              value={k.postEngagements}
              delta={deltas?.postEngagements ?? null}
              hint={t("advPerformance", "kpiPostEngagementsHint")}
              icon={Heart}
              tone="rose"
              hideIfZero
            />
            <KpiCard
              label={t("advPerformance", "kpiInstagramVisits")}
              value={k.instagramProfileVisits}
              delta={deltas?.instagramProfileVisits ?? null}
              hint={t("advPerformance", "kpiInstagramVisitsHint")}
              icon={Camera}
              tone="purple"
              hideIfZero
            />
            <KpiCard
              label={t("advPerformance", "kpiInstagramFollows")}
              value={k.instagramFollows}
              delta={deltas?.instagramFollows ?? null}
              hint={t("advPerformance", "kpiInstagramFollowsHint")}
              icon={UserPlus}
              tone="rose"
              hideIfZero
            />
          </div>
          <AnalysisBlock
            importId={importId}
            section="engagement"
            analysis={analyses.engagement ?? null}
            onUpdated={updateAnalysis}
          />
        </section>
      )}

      {/* Time series */}
      {data.timeSeries.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <SectionHeader
              icon={Sparkles}
              tone="gold"
              title={t(
                "advPerformance",
                data.weeks.length > 0
                  ? "timeSeriesTitleWeekly"
                  : "timeSeriesTitle",
              )}
              description={t(
                "advPerformance",
                data.weeks.length > 0
                  ? "timeSeriesDescriptionWeekly"
                  : "timeSeriesDescription",
              )}
            />
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={data.timeSeries}
                margin={{ left: 20, right: 24, top: 12, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10 }}
                  width={70}
                >
                  <ReLabel
                    angle={-90}
                    position="insideLeft"
                    style={{
                      textAnchor: "middle",
                      fontSize: 11,
                      fill: "#d9a82f",
                      fontWeight: 600,
                    }}
                    value={`${t("advPerformance", "timeSeriesYLeftLabel")}${data.currency ? ` (${data.currency})` : ""}`}
                  />
                </YAxis>
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  width={70}
                >
                  <ReLabel
                    angle={-90}
                    position="insideRight"
                    style={{
                      textAnchor: "middle",
                      fontSize: 11,
                      fill: "#5b7ea3",
                      fontWeight: 600,
                    }}
                    value={t("advPerformance", "timeSeriesYRightLabel")}
                  />
                </YAxis>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  yAxisId="left"
                  dataKey="spend"
                  fill="#d9a82f"
                  name={t("advPerformance", "kpiSpend")}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="impressions"
                  stroke="#5b7ea3"
                  strokeWidth={2}
                  dot={false}
                  name={t("advPerformance", "kpiImpressions")}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <AnalysisBlock
              importId={importId}
              section="timeSeries"
              analysis={analyses.timeSeries ?? null}
              onUpdated={updateAnalysis}
            />
          </CardContent>
        </Card>
      )}

      {/* TOP CAMPAGNE — NASCOSTE TEMPORANEAMENTE (2026-05-10).
          Codice + dati lato API + analisi AI section "topCampaigns"
          tutto preservato. Per riattivare: rimuovi questo blocco
          commentato e ripristina il JSX qui sotto.
          Vedi memory: feedback_top_campagne_hidden.md
          ────────────────────────────────────────────────────────
          {data.topByCampaignResults.length > 0 && (
            <section className="space-y-3">
              <div className={`grid gap-4 ${hasRoasData ? "lg:grid-cols-2" : ""}`}>
                <Card>
                  <CardContent className="p-5 space-y-3">
                    <SectionHeader
                      icon={Target}
                      tone="green"
                      title={t("advPerformance", "topCampaignsByResults")}
                    />
                    <HorizontalBarChart
                      data={data.topByCampaignResults.map((c) => ({
                        name: c.campaign_name,
                        results: c.results,
                      }))}
                      dataKey="results"
                      label={t("advPerformance", "ctResults")}
                      color="#6b8e6b"
                    />
                  </CardContent>
                </Card>
                {hasRoasData && data.topByCampaignRoas.length > 0 && (
                  <Card>
                    <CardContent className="p-5 space-y-3">
                      <SectionHeader
                        icon={DollarSign}
                        tone="gold"
                        title={t("advPerformance", "topCampaignsByRoas")}
                      />
                      <HorizontalBarChart
                        data={data.topByCampaignRoas.map((c) => ({
                          name: c.campaign_name,
                          roas: c.roas ?? 0,
                        }))}
                        dataKey="roas"
                        label={t("advPerformance", "kpiRoas")}
                        color="#d9a82f"
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
              <AnalysisBlock
                importId={importId}
                section="topCampaigns"
                analysis={analyses.topCampaigns ?? null}
                onUpdated={updateAnalysis}
              />
            </section>
          )}
      */}

      {/* Country breakdown */}
      {data.countries.length > 0 &&
        !(
          data.countries.length === 1 && data.countries[0].code === "UNKNOWN"
        ) && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <SectionHeader
                icon={Globe2}
                tone="blue"
                title={t("advPerformance", "countriesTitle")}
                description={t("advPerformance", "countriesDescription")}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 font-semibold">
                        {t("advPerformance", "countryCol")}
                      </th>
                      <th className="text-right py-2 font-semibold">
                        {t("advPerformance", "ctCampaigns")}
                      </th>
                      <th className="text-right py-2 font-semibold">
                        {t("advPerformance", "kpiSpend")}
                      </th>
                      <th className="text-right py-2 font-semibold">
                        {t("advPerformance", "kpiImpressions")}
                      </th>
                      <th className="text-right py-2 font-semibold">
                        {t("advPerformance", "kpiClicks")}
                      </th>
                      {showCountryPurchases && (
                        <th className="text-right py-2 font-semibold">
                          {t("advPerformance", "kpiPurchases")}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.countries.map((c) => {
                      const spendShare =
                        countriesTotalSpend > 0
                          ? (c.spend / countriesTotalSpend) * 100
                          : 0;
                      const impShare =
                        countriesTotalImp > 0
                          ? (c.impressions / countriesTotalImp) * 100
                          : 0;
                      const clickShare =
                        countriesTotalClicks > 0
                          ? (c.clicks / countriesTotalClicks) * 100
                          : 0;
                      const purchShare =
                        countriesTotalPurch > 0
                          ? (c.purchases / countriesTotalPurch) * 100
                          : 0;
                      return (
                        <tr key={c.code} className="hover:bg-muted/30">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={c.code === "UNKNOWN" ? "outline" : "gold"}
                                className="text-[10px]"
                              >
                                {c.code}
                              </Badge>
                              <span className="text-foreground font-medium">
                                {c.label}
                              </span>
                            </div>
                          </td>
                          <td className="text-right tabular-nums">
                            {c.campaignCount}
                          </td>
                          <td className="text-right tabular-nums">
                            <div className="font-medium">
                              {formatMoney(c.spend, data.currency)}
                            </div>
                            <div className="text-[10.5px] text-muted-foreground">
                              {formatNumber(Math.round(spendShare * 10) / 10)}%
                            </div>
                          </td>
                          <td className="text-right tabular-nums">
                            <div className="font-medium">
                              {formatNumber(c.impressions)}
                            </div>
                            <div className="text-[10.5px] text-muted-foreground">
                              {formatNumber(Math.round(impShare * 10) / 10)}%
                            </div>
                          </td>
                          <td className="text-right tabular-nums">
                            <div className="font-medium">
                              {formatNumber(c.clicks)}
                            </div>
                            <div className="text-[10.5px] text-muted-foreground">
                              {formatNumber(Math.round(clickShare * 10) / 10)}%
                            </div>
                          </td>
                          {showCountryPurchases && (
                            <td className="text-right tabular-nums">
                              {c.purchases > 0 ? (
                                <>
                                  <div className="font-semibold text-emerald-500">
                                    {formatNumber(
                                      Math.round(c.purchases * 10) / 10,
                                    )}
                                  </div>
                                  <div className="text-[10.5px] text-muted-foreground">
                                    {formatNumber(
                                      Math.round(purchShare * 10) / 10,
                                    )}
                                    %
                                  </div>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <AnalysisBlock
                importId={importId}
                section="countries"
                analysis={analyses.countries ?? null}
                onUpdated={updateAnalysis}
              />
            </CardContent>
          </Card>
        )}

      {/* Campaign types */}
      {data.campaignTypes.length > 0 && (
        <CampaignTypesPanel
          importId={importId}
          breakdown={data.campaignTypes}
          assignments={data.campaignTypeAssignments}
          currency={data.currency}
          analysis={analyses.campaignTypes ?? null}
          onAnalysisUpdated={updateAnalysis}
          onOverridesSaved={() => {
            window.location.reload();
          }}
        />
      )}

      {/* Creative type mix: pie spesa + tabella click/CTR per type */}
      {data.creativeTypeMix.length > 0 && (
        <section className="space-y-3">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <Card>
              <CardContent className="p-5 space-y-4">
                <SectionHeader
                  icon={Layers}
                  tone="purple"
                  title={t("advPerformance", "creativeTypeMix")}
                />
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={data.creativeTypeMix}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => {
                        const e = entry as { name?: string; percent?: number };
                        const pct =
                          e.percent != null ? (e.percent * 100).toFixed(1) : "0";
                        return `${e.name ?? ""} ${pct}%`;
                      }}
                    >
                      {data.creativeTypeMix.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) =>
                        typeof value === "number"
                          ? formatMoney(value, data.currency)
                          : String(value ?? "")
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 space-y-4">
                <SectionHeader
                  icon={MousePointerClick}
                  tone="blue"
                  title={t("advPerformance", "creativeClicksTitle")}
                  description={t(
                    "advPerformance",
                    "creativeClicksDescription",
                  )}
                />
                {(() => {
                  const showPurch = data.creativeTypeMix.some(
                    (c) => c.purchases > 0,
                  );
                  const totClicks = data.creativeTypeMix.reduce(
                    (s, c) => s + c.clicks,
                    0,
                  );
                  const totImpressions = data.creativeTypeMix.reduce(
                    (s, c) => s + c.impressions,
                    0,
                  );
                  const totPurchases = data.creativeTypeMix.reduce(
                    (s, c) => s + c.purchases,
                    0,
                  );
                  const pct = (part: number, tot: number) =>
                    tot > 0 ? `${((part / tot) * 100).toFixed(1)}%` : "—";
                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                            <th className="text-left py-2 font-semibold">
                              Tipo
                            </th>
                            <th className="text-right py-2 font-semibold">
                              Click
                            </th>
                            <th className="text-right py-2 font-semibold">
                              Impression
                            </th>
                            <th className="text-right py-2 font-semibold">
                              CTR
                            </th>
                            {showPurch && (
                              <th className="text-right py-2 font-semibold">
                                Acquisti
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.creativeTypeMix.map((c, i) => (
                            <tr key={c.name} className="hover:bg-muted/30">
                              <td className="py-2.5">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="size-2.5 rounded-sm shrink-0"
                                    style={{
                                      backgroundColor: `#${PIE_COLORS[i % PIE_COLORS.length]}`,
                                    }}
                                    aria-hidden
                                  />
                                  <span className="capitalize font-medium">
                                    {c.name}
                                  </span>
                                </div>
                              </td>
                              <td className="text-right tabular-nums font-medium">
                                <div>{formatNumber(c.clicks)}</div>
                                <div className="text-[11px] text-muted-foreground font-normal">
                                  {pct(c.clicks, totClicks)}
                                </div>
                              </td>
                              <td className="text-right tabular-nums text-muted-foreground">
                                <div>{formatNumber(c.impressions)}</div>
                                <div className="text-[11px]">
                                  {pct(c.impressions, totImpressions)}
                                </div>
                              </td>
                              <td className="text-right tabular-nums">
                                {c.ctr != null
                                  ? `${formatNumber(c.ctr)}%`
                                  : "—"}
                              </td>
                              {showPurch && (
                                <td className="text-right tabular-nums">
                                  {c.purchases > 0 ? (
                                    <>
                                      <div className="text-emerald-500 font-semibold">
                                        {formatNumber(c.purchases)}
                                      </div>
                                      <div className="text-[11px] text-muted-foreground font-normal">
                                        {pct(c.purchases, totPurchases)}
                                      </div>
                                    </>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
          <AnalysisBlock
            importId={importId}
            section="creatives"
            analysis={analyses.creatives ?? null}
            onUpdated={updateAnalysis}
          />
        </section>
      )}

      {/* Performance per ad_name (singola creativita') */}
      {data.adNameMix.length > 0 && (
        <section className="space-y-3">
          <Card>
            <CardContent className="p-5 space-y-4">
              <SectionHeader
                icon={ImageIcon}
                tone="purple"
                title={t("advPerformance", "adNameMixTitle")}
                description={t("advPerformance", "adNameMixDescription")}
              />
              {(() => {
                const showPurch = data.adNameMix.some((c) => c.purchases > 0);
                const totSpend = data.adNameMix.reduce(
                  (s, c) => s + c.value,
                  0,
                );
                const totClicks = data.adNameMix.reduce(
                  (s, c) => s + c.clicks,
                  0,
                );
                const totImpressions = data.adNameMix.reduce(
                  (s, c) => s + c.impressions,
                  0,
                );
                const totPurchases = data.adNameMix.reduce(
                  (s, c) => s + c.purchases,
                  0,
                );
                const pct = (part: number, tot: number) =>
                  tot > 0 ? `${((part / tot) * 100).toFixed(1)}%` : "—";
                return (
                  <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                          <th className="text-left py-2 px-3 font-semibold">
                            Ad name
                          </th>
                          <th className="text-right py-2 px-3 font-semibold">
                            Spesa
                          </th>
                          <th className="text-right py-2 px-3 font-semibold">
                            Click
                          </th>
                          <th className="text-right py-2 px-3 font-semibold">
                            Impression
                          </th>
                          <th className="text-right py-2 px-3 font-semibold">
                            CTR
                          </th>
                          {showPurch && (
                            <th className="text-right py-2 px-3 font-semibold">
                              Acquisti
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.adNameMix.map((c) => (
                          <tr key={c.name} className="hover:bg-muted/30">
                            <td
                              className="py-2.5 px-3 font-medium break-all"
                              title={c.name}
                            >
                              {c.name}
                            </td>
                            <td className="text-right tabular-nums px-3 font-medium">
                              <div>{formatMoney(c.value, data.currency)}</div>
                              <div className="text-[11px] text-muted-foreground font-normal">
                                {pct(c.value, totSpend)}
                              </div>
                            </td>
                            <td className="text-right tabular-nums px-3">
                              <div>{formatNumber(c.clicks)}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {pct(c.clicks, totClicks)}
                              </div>
                            </td>
                            <td className="text-right tabular-nums px-3 text-muted-foreground">
                              <div>{formatNumber(c.impressions)}</div>
                              <div className="text-[11px]">
                                {pct(c.impressions, totImpressions)}
                              </div>
                            </td>
                            <td className="text-right tabular-nums px-3">
                              {c.ctr != null ? `${formatNumber(c.ctr)}%` : "—"}
                            </td>
                            {showPurch && (
                              <td className="text-right tabular-nums px-3">
                                {c.purchases > 0 ? (
                                  <>
                                    <div className="text-emerald-500 font-semibold">
                                      {formatNumber(c.purchases)}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground font-normal">
                                      {pct(c.purchases, totPurchases)}
                                    </div>
                                  </>
                                ) : (
                                  "—"
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
          <AnalysisBlock
            importId={importId}
            section="adNames"
            analysis={analyses.adNames ?? null}
            onUpdated={updateAnalysis}
          />
        </section>
      )}

      {/* Objective mix */}
      {data.objectiveMix.length > 0 &&
        data.objectiveMix.some((o) => o.name && o.name !== "—") && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <SectionHeader
                icon={Target}
                tone="blue"
                title={t("advPerformance", "objectiveMix")}
              />
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data.objectiveMix}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(entry) => {
                      const e = entry as { name?: string; percent?: number };
                      const pct =
                        e.percent != null ? (e.percent * 100).toFixed(1) : "0";
                      return `${e.name ?? ""} ${pct}%`;
                    }}
                  >
                    {data.objectiveMix.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) =>
                      typeof value === "number"
                        ? formatMoney(value, data.currency)
                        : String(value ?? "")
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
              <AnalysisBlock
                importId={importId}
                section="objective"
                analysis={analyses.objective ?? null}
                onUpdated={updateAnalysis}
              />
            </CardContent>
          </Card>
        )}

      {/* AI analysis CTA — bottom (rigenera) */}
      <AnalysisCta
        importId={importId}
        hasAnalyses={hasAnyAnalysis}
        position="bottom"
        onGenerated={loadAnalyses}
        compareParams={compareParams}
        crossLocale={analysesCrossLocale}
      />
    </div>
  );
}

/* ─── Creative Asset Card ────────────────────────────────────
 * Grid visivo con icone + numero + label esplicito della
 * finestra. Per ogni tipo (image / video / carousel / ecc) un
 * tile colorato con icona pertinente.
 */
function CreativeAssetCard({
  items,
  label,
}: {
  items: { name: string; count: number }[];
  label: string;
}) {
  const { t } = useT();
  const iconFor = (name: string) => {
    const n = name.toLowerCase();
    if (/video|reel/.test(n)) return Video;
    if (/carousel|collection/.test(n)) return Layers;
    return ImageIcon;
  };
  const toneFor = (name: string): AccentTone => {
    const n = name.toLowerCase();
    if (/video|reel/.test(n)) return "rose";
    if (/carousel|collection/.test(n)) return "purple";
    return "blue";
  };
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <SectionHeader
          icon={Layers}
          tone="purple"
          title={t("advPerformance", "creativeCountByType")}
          description={t("advPerformance", "creativeCountByTypeHint")}
        />
        <div className="flex items-center gap-2 text-[10.5px]">
          <span className="uppercase tracking-wider text-muted-foreground">
            {t("advPerformance", "creativeCountWindowLabel")}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {label}
          </Badge>
        </div>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {items.map((c) => {
            const Icon = iconFor(c.name);
            const tone = toneFor(c.name);
            const T = TONES[tone];
            return (
              <div
                key={c.name}
                className={`rounded-lg border border-border p-4 flex items-center gap-3 ${T.bg} bg-opacity-30`}
              >
                <div className={`size-10 rounded-md grid place-items-center ${T.bg} ${T.text} shrink-0`}>
                  <Icon className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground capitalize">
                    {c.name}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums leading-tight">
                    {formatNumber(c.count)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {t("advPerformance", "creativeCountAvgWeeks")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignTypesPanel({
  importId,
  breakdown,
  assignments,
  currency,
  onOverridesSaved,
  analysis,
  onAnalysisUpdated,
}: {
  importId: string;
  breakdown: CampaignTypeBreakdown[];
  assignments: CampaignTypeAssignment[];
  currency: string | null;
  onOverridesSaved: () => void;
  analysis: SectionAnalysis | null;
  onAnalysisUpdated: (next: SectionAnalysis | null) => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [knownTypes, setKnownTypes] = useState<CampaignType[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const a of assignments) {
      if (a.overrideCode) m[a.campaignName] = a.overrideCode;
    }
    return m;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    fetch("/api/perf/campaign-types")
      .then((r) => r.json())
      .then((j) => setKnownTypes(j.types ?? []))
      .catch(() => {});
  }, [editing]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/perf/imports/${importId}/campaign-types`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ overrides }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "Save failed");
        return;
      }
      toast.success(t("advPerformance", "campaignTypesSaved"));
      setEditing(false);
      onOverridesSaved();
    } finally {
      setSaving(false);
    }
  }

  const undecoded = assignments.filter(
    (a) => !a.decodedCode && !a.overrideCode,
  ).length;

  const hasAnyPurchases = breakdown.some((b) => b.purchases > 0);
  const totalSpend = breakdown.reduce((s, b) => s + b.spend, 0);
  const totalResults = breakdown.reduce((s, b) => s + b.resultCount, 0);
  const totalPurch = breakdown.reduce((s, b) => s + b.purchases, 0);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon={Layers}
            tone="amber"
            title={t("advPerformance", "campaignTypesTitle")}
            description={t("advPerformance", "campaignTypesDescription")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            className="gap-1.5 print:hidden shrink-0"
          >
            <Pencil className="size-3.5" />
            {t("advPerformance", "editMapping")}
            {undecoded > 0 && (
              <Badge
                variant="outline"
                className="ml-1 text-[9px] py-0 px-1.5 text-amber-400 border-amber-400/40"
              >
                {undecoded}
              </Badge>
            )}
          </Button>
        </div>

        {hasAnyPurchases && (
          <div className="rounded-md border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground inline-flex gap-2 items-start">
            <HelpCircle className="size-3.5 mt-0.5 shrink-0 text-amber-500" />
            <span>{t("advPerformance", "ctPurchasesHint")}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left py-2 font-semibold">
                  {t("advPerformance", "ctType")}
                </th>
                <th className="text-right py-2 font-semibold">
                  {t("advPerformance", "ctCampaigns")}
                </th>
                <th className="text-right py-2 font-semibold">
                  {t("advPerformance", "ctSpend")}
                </th>
                <th className="text-right py-2 font-semibold">
                  {t("advPerformance", "ctResults")}
                </th>
                <th className="text-right py-2 font-semibold">
                  {t("advPerformance", "ctCpr")}
                </th>
                {hasAnyPurchases && (
                  <th className="text-right py-2 font-semibold">
                    {t("advPerformance", "ctPurchases")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {breakdown.map((b) => {
                const spendPct =
                  totalSpend > 0 ? (b.spend / totalSpend) * 100 : 0;
                const resPct =
                  totalResults > 0 ? (b.resultCount / totalResults) * 100 : 0;
                const purchPct =
                  totalPurch > 0 ? (b.purchases / totalPurch) * 100 : 0;
                return (
                  <tr key={b.code} className="hover:bg-muted/30">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={b.code === "UNKNOWN" ? "outline" : "gold"}
                          className="text-[10px]"
                        >
                          {b.code}
                        </Badge>
                        <span className="text-foreground font-medium">{b.label}</span>
                      </div>
                    </td>
                    <td className="text-right tabular-nums">
                      {b.campaignCount}
                    </td>
                    <td className="text-right tabular-nums">
                      <div className="font-medium">
                        {formatMoney(b.spend, currency)}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground">
                        {formatNumber(Math.round(spendPct * 10) / 10)}%
                      </div>
                    </td>
                    <td className="text-right tabular-nums">
                      {b.resultCount > 0 ? (
                        <>
                          <div className="font-medium">
                            {formatNumber(b.resultCount)}
                          </div>
                          <div className="text-[10.5px] text-muted-foreground">
                            {formatNumber(Math.round(resPct * 10) / 10)}%
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      {b.cpr != null ? formatMoney(b.cpr, currency) : "—"}
                    </td>
                    {hasAnyPurchases && (
                      <td className="text-right tabular-nums">
                        {b.purchases > 0 ? (
                          <>
                            <div className="font-semibold text-emerald-500">
                              {formatNumber(b.purchases)}
                            </div>
                            <div className="text-[10.5px] text-muted-foreground">
                              {formatNumber(Math.round(purchPct * 10) / 10)}%
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <AnalysisBlock
          importId={importId}
          section="campaignTypes"
          analysis={analysis}
          onUpdated={onAnalysisUpdated}
        />

        {editing && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 print:hidden">
            <Card className="w-full max-w-3xl max-h-[85vh] overflow-y-auto">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">
                      {t("advPerformance", "editMapping")}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("advPerformance", "editMappingHint")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="size-8 rounded-md grid place-items-center text-muted-foreground hover:bg-muted"
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2">
                        {t("advPerformance", "campaignName")}
                      </th>
                      <th className="text-left py-2">
                        {t("advPerformance", "decodedAs")}
                      </th>
                      <th className="text-left py-2">
                        {t("advPerformance", "overrideTo")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {assignments.map((a) => {
                      const value =
                        overrides[a.campaignName] ??
                        a.overrideCode ??
                        a.decodedCode ??
                        "";
                      return (
                        <tr key={a.campaignName}>
                          <td className="py-2 pr-3">
                            <span className="text-xs font-medium break-all">
                              {a.campaignName}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {a.decodedCode ? (
                              <Badge
                                variant="outline"
                                className="text-[10px]"
                              >
                                {a.decodedCode} · {a.decodedLabel}
                              </Badge>
                            ) : (
                              <span className="text-xs text-amber-400">
                                {t("advPerformance", "notDecoded")}
                              </span>
                            )}
                          </td>
                          <td className="py-2">
                            <select
                              value={value}
                              onChange={(e) => {
                                const v = e.target.value;
                                setOverrides((prev) => {
                                  const next = { ...prev };
                                  if (v === "" || v === a.decodedCode) {
                                    delete next[a.campaignName];
                                  } else {
                                    next[a.campaignName] = v;
                                  }
                                  return next;
                                });
                              }}
                              className="flex h-8 rounded-md border border-border bg-muted px-2 text-xs"
                            >
                              <option value="">
                                — {t("advPerformance", "notDecoded")} —
                              </option>
                              {knownTypes.map((kt) => (
                                <option key={kt.code} value={kt.code}>
                                  {kt.code} · {kt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(false)}
                  >
                    {t("advPerformance", "uploadCancel")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={save}
                    disabled={saving}
                    className="gap-1.5"
                  >
                    {saving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    {t("advPerformance", "saveOverrides")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
