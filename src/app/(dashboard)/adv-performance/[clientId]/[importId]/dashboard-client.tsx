"use client";

import { useEffect, useState, useMemo } from "react";
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
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import type {
  PerfDashboardData,
  MetaKpiAggregate,
} from "@/types/perf";
import {
  HorizontalBarChart,
} from "@/components/dashboard/benchmark-charts";

type ComparisonMode = "none" | "previous" | "yoy" | "custom";

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
  // Per metriche dove "alto = peggio" (CPM, CPC, CPA): invertiamo
  // il signal del delta cosi una crescita del CPM appare come
  // delta negativo (worsened) nella UI.
  const d = deltaPct(curr, prev);
  return d == null ? null : -d;
}

function KpiCard({
  label,
  value,
  delta,
  invertColors = false,
  currency,
  isMoney = false,
  isPercent = false,
}: {
  label: string;
  value: number | null;
  delta: number | null;
  invertColors?: boolean;
  currency?: string | null;
  isMoney?: boolean;
  isPercent?: boolean;
}) {
  const display =
    value == null
      ? "—"
      : isMoney
        ? formatMoney(value, currency ?? null)
        : isPercent
          ? `${formatNumber(value)}%`
          : formatNumber(value);
  const deltaIsPositive = delta != null && delta > 0;
  const deltaIsNegative = delta != null && delta < 0;
  // For "lower is better" (CPM, CPC, CPA), color by inverted sign.
  const goodColor = invertColors ? "text-red-400" : "text-emerald-400";
  const badColor = invertColors ? "text-emerald-400" : "text-red-400";
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums">{display}</p>
        {delta != null && (
          <p
            className={`text-[11px] tabular-nums inline-flex items-center gap-0.5 ${
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
      clicks: null,
      ctr: null,
      cpm: null,
      cpc: null,
      results: null,
      costPerResult: null,
      roas: null,
      frequency: null,
    };
  }
  return {
    amountSpent: deltaPct(current.amountSpent, prev.amountSpent),
    impressions: deltaPct(current.impressions, prev.impressions),
    reach: deltaPct(current.reach, prev.reach),
    clicks: deltaPct(current.clicks, prev.clicks),
    ctr: deltaPct(current.ctr, prev.ctr),
    cpm: deltaPctInverse(current.cpm, prev.cpm),
    cpc: deltaPctInverse(current.cpc, prev.cpc),
    results: deltaPct(current.results, prev.results),
    costPerResult: deltaPctInverse(
      current.costPerResult,
      prev.costPerResult,
    ),
    roas: deltaPct(current.roas, prev.roas),
    frequency: deltaPct(current.frequency, prev.frequency),
  };
}

export function DashboardClient({ importId }: { importId: string }) {
  const { t } = useT();
  const [mode, setMode] = useState<ComparisonMode>("none");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<PerfDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("compare", mode);
    if (mode === "custom" && customFrom && customTo) {
      params.set("compare_from", customFrom);
      params.set("compare_to", customTo);
    }
    setLoading(true);
    setError(null);
    fetch(`/api/perf/imports/${importId}/dashboard?${params.toString()}`, {
      cache: "no-store",
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) {
          setError(j.error ?? "Failed to load dashboard");
        } else {
          setData(j as PerfDashboardData);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [importId, mode, customFrom, customTo]);

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
        <CardContent className="py-12 text-center text-sm text-red-400">
          {error}
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const k = data.current;

  return (
    <div className="space-y-6">
      {/* Comparison switcher */}
      <Card className="print:hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t("advPerformance", "comparisonNone").toUpperCase()}
            </span>
            <button
              type="button"
              onClick={() => setMode("none")}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                mode === "none"
                  ? "bg-gold/15 text-gold border-gold/30"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {t("advPerformance", "comparisonNone")}
            </button>
            <button
              type="button"
              onClick={() => setMode("previous")}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                mode === "previous"
                  ? "bg-gold/15 text-gold border-gold/30"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {t("advPerformance", "comparisonPrevious")}
            </button>
            <button
              type="button"
              onClick={() => setMode("yoy")}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                mode === "yoy"
                  ? "bg-gold/15 text-gold border-gold/30"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {t("advPerformance", "comparisonYoy")}
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                mode === "custom"
                  ? "bg-gold/15 text-gold border-gold/30"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {t("advPerformance", "comparisonCustom")}
            </button>
            {mode === "custom" && (
              <div className="flex items-center gap-2 ml-2">
                <Label htmlFor="cf" className="text-[10px]">
                  from
                </Label>
                <Input
                  id="cf"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 text-xs w-[140px]"
                />
                <Label htmlFor="ct" className="text-[10px]">
                  to
                </Label>
                <Input
                  id="ct"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 text-xs w-[140px]"
                />
              </div>
            )}
            {mode !== "none" && data.comparison.label && (
              <Badge variant="outline" className="text-[10px] ml-auto">
                {data.comparison.label}
              </Badge>
            )}
          </div>
          {mode !== "none" && !data.comparison.aggregate && (
            <p className="text-[11px] text-amber-400">
              {t("advPerformance", "noComparisonData")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-5">
        <KpiCard
          label={t("advPerformance", "kpiSpend")}
          value={k.amountSpent}
          delta={deltas?.amountSpent ?? null}
          isMoney
          currency={data.currency}
        />
        <KpiCard
          label={t("advPerformance", "kpiImpressions")}
          value={k.impressions}
          delta={deltas?.impressions ?? null}
        />
        <KpiCard
          label={t("advPerformance", "kpiClicks")}
          value={k.clicks}
          delta={deltas?.clicks ?? null}
        />
        <KpiCard
          label={t("advPerformance", "kpiReach")}
          value={k.reach}
          delta={deltas?.reach ?? null}
        />
        <KpiCard
          label={t("advPerformance", "kpiCtr")}
          value={k.ctr}
          delta={deltas?.ctr ?? null}
          isPercent
        />
        <KpiCard
          label={t("advPerformance", "kpiCpm")}
          value={k.cpm}
          delta={deltas?.cpm ?? null}
          invertColors
          isMoney
          currency={data.currency}
        />
        <KpiCard
          label={t("advPerformance", "kpiCpc")}
          value={k.cpc}
          delta={deltas?.cpc ?? null}
          invertColors
          isMoney
          currency={data.currency}
        />
        <KpiCard
          label={t("advPerformance", "kpiResults")}
          value={k.results}
          delta={deltas?.results ?? null}
        />
        <KpiCard
          label={t("advPerformance", "kpiCpa")}
          value={k.costPerResult}
          delta={deltas?.costPerResult ?? null}
          invertColors
          isMoney
          currency={data.currency}
        />
        <KpiCard
          label={t("advPerformance", "kpiRoas")}
          value={k.roas}
          delta={deltas?.roas ?? null}
        />
      </div>

      {/* Time series */}
      {data.timeSeries.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              {t("advPerformance", "timeSeriesTitle")}
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart
                data={data.timeSeries}
                margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10 }}
                  width={50}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  width={60}
                />
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
          </CardContent>
        </Card>
      )}

      {/* Top campaigns */}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.topByCampaignSpend.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                {t("advPerformance", "topCampaignsBySpend")}
              </h3>
              <HorizontalBarChart
                data={data.topByCampaignSpend.map((c) => ({
                  name: c.campaign_name,
                  spend: c.spend,
                }))}
                dataKey="spend"
                label={t("advPerformance", "kpiSpend")}
                color="#d9a82f"
              />
            </CardContent>
          </Card>
        )}
        {data.topByCampaignRoas.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                {t("advPerformance", "topCampaignsByRoas")}
              </h3>
              <HorizontalBarChart
                data={data.topByCampaignRoas.map((c) => ({
                  name: c.campaign_name,
                  roas: c.roas ?? 0,
                }))}
                dataKey="roas"
                label={t("advPerformance", "kpiRoas")}
                color="#6b8e6b"
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Objective mix */}
      {data.objectiveMix.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              {t("advPerformance", "objectiveMix")}
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={data.objectiveMix}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry) => entry.name}
                >
                  {data.objectiveMix.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
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
      )}
    </div>
  );
}
