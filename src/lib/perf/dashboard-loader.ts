/**
 * Carica e aggrega il payload completo del dashboard Adv
 * Performance per un import. Usato sia dal route /dashboard
 * (per il rendering UI) sia dal route /analysis (per costruire
 * il prompt AI). Centralizzare evita la deriva fra i due flussi.
 *
 * Gestisce i fallback per migrations 0041/0042/0043 non
 * applicate (creative_*, week, brand_id).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateKpis,
  aggregateTimeSeries,
  topCampaigns,
  objectiveMix,
  aggregateCampaignTypes,
  buildCampaignTypeAssignments,
  aggregateCreativeTypeMix,
  aggregateCreativeCountByType,
  aggregateCountryBreakdown,
  listWeeks,
} from "./aggregate";
import { buildComparison, type ComparisonMode } from "./comparisons";
import type {
  PerfDashboardData,
  MetaPerfRow,
  MetaKpiAggregate,
} from "@/types/perf";

interface ImpHeader {
  id: string;
  workspace_id: string;
  client_id: string;
  channel: string;
  period_from: string;
  period_to: string;
  currency: string | null;
  status: string;
  campaign_type_overrides?: Record<string, string> | null;
}

export interface LoadDashboardOptions {
  importId: string;
  mode?: ComparisonMode;
  customFrom?: string;
  customTo?: string;
  weekCurrent?: string | null;
  weekCompare?: string | null;
}

export async function loadDashboardData(
  supabase: SupabaseClient,
  opts: LoadDashboardOptions,
): Promise<{ data: PerfDashboardData; imp: ImpHeader } | null> {
  const id = opts.importId;
  const mode = opts.mode ?? "none";

  // Header (with fallback se mig 0041 non applicata)
  let imp: ImpHeader | null = null;
  {
    const full = await supabase
      .from("mait_perf_imports")
      .select(
        "id, workspace_id, client_id, channel, period_from, period_to, currency, status, campaign_type_overrides",
      )
      .eq("id", id)
      .single();
    if (full.data) {
      imp = full.data as unknown as ImpHeader;
    } else if (
      full.error &&
      /campaign_type_overrides/.test(full.error.message ?? "")
    ) {
      const fb = await supabase
        .from("mait_perf_imports")
        .select(
          "id, workspace_id, client_id, channel, period_from, period_to, currency, status",
        )
        .eq("id", id)
        .single();
      if (fb.data) imp = fb.data as unknown as ImpHeader;
    }
  }
  if (!imp) return null;
  if (imp.status !== "validated") return null;
  if (imp.channel !== "meta") return null;

  // Rows (fallback progressivo per migrations 0041/0042)
  const PAGE = 1000;
  const SAFETY_CAP = 50_000;
  const rows: MetaPerfRow[] = [];
  const fullCols =
    "date, week, campaign_name, ad_set_name, ad_name, objective, amount_spent, impressions, reach, frequency, clicks, link_clicks, unique_clicks, unique_link_clicks, ctr, link_ctr, cpm, cpc, link_cpc, results, result_indicator, cost_per_result, purchase_roas, purchases, purchase_value, creative_type, creative_count, raw_data";
  const noWeekCols =
    "date, campaign_name, ad_set_name, ad_name, objective, amount_spent, impressions, reach, frequency, clicks, link_clicks, unique_clicks, unique_link_clicks, ctr, link_ctr, cpm, cpc, link_cpc, results, result_indicator, cost_per_result, purchase_roas, purchases, purchase_value, creative_type, creative_count, raw_data";
  const legacyCols =
    "date, campaign_name, ad_set_name, ad_name, objective, amount_spent, impressions, reach, frequency, clicks, link_clicks, unique_clicks, unique_link_clicks, ctr, link_ctr, cpm, cpc, link_cpc, results, result_indicator, cost_per_result, purchase_roas, purchases, purchase_value, raw_data";
  let level: "full" | "noWeek" | "legacy" = "full";
  for (let offset = 0; offset < SAFETY_CAP; offset += PAGE) {
    const cols =
      level === "full" ? fullCols : level === "noWeek" ? noWeekCols : legacyCols;
    const { data, error } = await supabase
      .from("mait_perf_meta_rows")
      .select(cols as never)
      .eq("import_id", id)
      .range(offset, offset + PAGE - 1);
    if (error) {
      const msg = error.message ?? "";
      if (level === "full" && /\bweek\b/i.test(msg)) {
        level = "noWeek";
        offset -= PAGE;
        continue;
      }
      if (level !== "legacy" && /creative_(type|count)/.test(msg)) {
        level = "legacy";
        offset -= PAGE;
        continue;
      }
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as MetaPerfRow[]));
    if (data.length < PAGE) break;
  }

  // Backfill week da raw_data
  for (const r of rows) {
    if (r.week == null) {
      const w = (r.raw_data as Record<string, unknown> | undefined)?.["Week"];
      r.week =
        w == null || String(w).trim() === ""
          ? null
          : String(w).trim().toLowerCase().replace(/\s+/g, " ");
    }
  }

  const overrides = (imp.campaign_type_overrides ?? {}) as Record<
    string,
    string
  >;

  // Filtering per week
  const filterByWeek = (subset: MetaPerfRow[], week: string | null) =>
    week == null ? subset : subset.filter((r) => r.week === week);
  let currentRows: MetaPerfRow[] = rows;
  let weekCurrentEffective: string | null = null;
  if (mode === "week" && opts.weekCurrent) {
    weekCurrentEffective = opts.weekCurrent;
    currentRows = filterByWeek(rows, opts.weekCurrent);
  }

  // Comparison
  let comparisonAggregate: MetaKpiAggregate | null = null;
  let comparisonLabel: string | null = null;
  let comparisonFrom: string | null = null;
  let comparisonTo: string | null = null;
  if (mode === "week" && opts.weekCurrent && opts.weekCompare) {
    const cmpRows = filterByWeek(rows, opts.weekCompare);
    if (cmpRows.length > 0) {
      comparisonAggregate = aggregateKpis(cmpRows);
      comparisonLabel = `${opts.weekCompare} vs ${opts.weekCurrent}`;
    }
  } else if (mode !== "week" && mode !== "none") {
    const cmp = await buildComparison(
      supabase,
      {
        workspaceId: imp.workspace_id,
        clientId: imp.client_id,
        channel: "meta",
        periodFrom: imp.period_from,
        periodTo: imp.period_to,
      },
      mode,
      opts.customFrom,
      opts.customTo,
    );
    comparisonAggregate = cmp.aggregate;
    comparisonLabel = cmp.label;
    comparisonFrom = cmp.periodFrom;
    comparisonTo = cmp.periodTo;
  }

  const creativeCount = aggregateCreativeCountByType(currentRows);

  let dataMinDate: string | null = null;
  let dataMaxDate: string | null = null;
  for (const r of rows) {
    if (!r.date) continue;
    if (dataMinDate == null || r.date < dataMinDate) dataMinDate = r.date;
    if (dataMaxDate == null || r.date > dataMaxDate) dataMaxDate = r.date;
  }

  const data: PerfDashboardData = {
    importId: id,
    clientId: imp.client_id,
    channel: "meta",
    periodFrom: imp.period_from,
    periodTo: imp.period_to,
    currency: imp.currency,
    current: aggregateKpis(currentRows),
    comparison: {
      mode,
      label: comparisonLabel,
      periodFrom: comparisonFrom,
      periodTo: comparisonTo,
      aggregate: comparisonAggregate,
    },
    timeSeries: aggregateTimeSeries(currentRows),
    topByCampaignSpend: topCampaigns(currentRows, "spend"),
    topByCampaignRoas: topCampaigns(currentRows, "roas"),
    objectiveMix: objectiveMix(currentRows),
    creativeTypeMix: aggregateCreativeTypeMix(currentRows),
    creativeCountByType: creativeCount.items,
    creativeCountLabel: creativeCount.label,
    campaignTypes: aggregateCampaignTypes(currentRows, overrides),
    campaignTypeAssignments: buildCampaignTypeAssignments(rows, overrides),
    countries: aggregateCountryBreakdown(currentRows),
    weeks: listWeeks(rows),
    weekCurrent: weekCurrentEffective,
    dataMinDate,
    dataMaxDate,
  };

  return { data, imp };
}
