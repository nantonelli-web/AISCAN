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
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Pencil,
  Save,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
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
      effectiveClicks: null,
      effectiveCtr: null,
      cpm: null,
      effectiveCpc: null,
      roas: null,
      frequency: null,
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
              onClick={() => setMode("week")}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                mode === "week"
                  ? "bg-gold/15 text-gold border-gold/30"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {t("advPerformance", "comparisonWeek")}
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

      {/* KPI cards — niente "Risultati" generico (ogni campagna
          ha il proprio risultato per type, vedi sezione sotto). */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-4">
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
          value={k.effectiveClicks}
          delta={deltas?.effectiveClicks ?? null}
        />
        <KpiCard
          label={t("advPerformance", "kpiReach")}
          value={k.reach}
          delta={deltas?.reach ?? null}
        />
        <KpiCard
          label={t("advPerformance", "kpiCtr")}
          value={k.effectiveCtr}
          delta={deltas?.effectiveCtr ?? null}
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
          value={k.effectiveCpc}
          delta={deltas?.effectiveCpc ?? null}
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

      {/* Campaign types — risultati e CPR diversificati per type
          decodificata dal nome campagna. Pannello sempre presente
          quando ci sono campagne (anche solo UNKNOWN). Ha la UI
          di override per correggere la decodifica. */}
      {data.campaignTypes.length > 0 && (
        <CampaignTypesPanel
          importId={importId}
          breakdown={data.campaignTypes}
          assignments={data.campaignTypeAssignments}
          currency={data.currency}
          onOverridesSaved={() => {
            // Re-fetch dashboard data after override save.
            // Trigger a query string change to bust the useEffect.
            window.location.reload();
          }}
        />
      )}

      {/* Creative type mix — solo se l'export ha le custom column
          creative_type / creative_count. */}
      {(data.creativeTypeMix.length > 0 ||
        data.creativeCountByType.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.creativeTypeMix.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                  {t("advPerformance", "creativeTypeMix")}
                </h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={data.creativeTypeMix}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => entry.name}
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
          )}
          {data.creativeCountByType.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                  {t("advPerformance", "creativeCountByType")}
                </h3>
                <div className="space-y-2 pt-1">
                  {data.creativeCountByType.map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="capitalize">{c.name}</span>
                      <span className="text-2xl font-semibold tabular-nums">
                        {c.count}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Objective mix — mostrato SOLO se l'export Meta ha la
          colonna Objective popolata. Molti file (es. quelli
          custom) non l'hanno → pannello nascosto invece di
          mostrare un pie vuoto. */}
      {data.objectiveMix.length > 0 &&
        data.objectiveMix.some((o) => o.name && o.name !== "—") && (
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
        )}
    </div>
  );
}

/* ─── Campaign Types panel ───────────────────────────────────
 * Mostra il breakdown KPI per tipologia di campagna decodificata
 * dal nome (VC / ATC / PUR / ...). Ogni riga = una type, con
 * spend / impressions / N campagne / N risultati / CPR specifico.
 *
 * Ha un bottone "Edit mapping" che apre una modal dove l'utente
 * vede l'auto-decodifica per ogni campagna e puo' overridarla
 * scegliendo da una dropdown o segnando "Unknown". Salva in
 * mait_perf_imports.campaign_type_overrides via PATCH.
 */
function CampaignTypesPanel({
  importId,
  breakdown,
  assignments,
  currency,
  onOverridesSaved,
}: {
  importId: string;
  breakdown: CampaignTypeBreakdown[];
  assignments: CampaignTypeAssignment[];
  currency: string | null;
  onOverridesSaved: () => void;
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

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              {t("advPerformance", "campaignTypesTitle")}
            </h3>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t("advPerformance", "campaignTypesDescription")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            className="gap-1.5 print:hidden"
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {breakdown.map((b) => (
                <tr key={b.code}>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={b.code === "UNKNOWN" ? "outline" : "gold"}
                        className="text-[10px]"
                      >
                        {b.code}
                      </Badge>
                      <span className="text-foreground">{b.label}</span>
                    </div>
                  </td>
                  <td className="text-right tabular-nums">
                    {b.campaignCount}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatMoney(b.spend, currency)}
                  </td>
                  <td className="text-right tabular-nums">
                    {b.resultCount > 0
                      ? formatNumber(b.resultCount)
                      : "—"}
                  </td>
                  <td className="text-right tabular-nums">
                    {b.cpr != null ? formatMoney(b.cpr, currency) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
