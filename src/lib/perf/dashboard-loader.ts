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
  if (imp.channel !== "meta" && imp.channel !== "snapchat") return null;

  // Rows: branching su channel. Per Meta carichiamo dalla tabella
  // dedicata; per Snapchat dalla nuova mait_perf_snapchat_rows e
  // mappiamo i campi al MetaPerfRow shape per riusare aggregator.
  const PAGE = 1000;
  const SAFETY_CAP = 50_000;
  const rows: MetaPerfRow[] = [];
  if (imp.channel === "snapchat") {
    type SnapDbRow = {
      date: string | null;
      week: string | null;
      campaign_name: string | null;
      campaign_id: string | null;
      ad_set_name: string | null;
      ad_set_id: string | null;
      ad_name: string | null;
      ad_id: string | null;
      creative_id: string | null;
      amount_spent: number | null;
      paid_impressions: number | null;
      clicks: number | null;
      landing_page_views: number | null;
      adds_to_cart: number | null;
      purchases: number | null;
      purchase_value: number | null;
      creative_type: string | null;
      creative_count: number | null;
      raw_data: Record<string, unknown> | null;
    };
    for (let offset = 0; offset < SAFETY_CAP; offset += PAGE) {
      const { data, error } = await supabase
        .from("mait_perf_snapchat_rows")
        .select("*")
        .eq("import_id", id)
        .range(offset, offset + PAGE - 1);
      if (error || !data || data.length === 0) break;
      const snapRows = data as unknown as SnapDbRow[];
      for (const sr of snapRows) {
        // Mappa al MetaPerfRow shape. I campi non disponibili
        // (reach, frequency, ctr/cpm/cpc, ranking) sono null/0.
        // raw_data viene arricchito coi field Snapchat per
        // l'aggregator delle campaign types (es. ATC eventField =
        // raw:Adds to cart).
        const enrichedRaw = { ...(sr.raw_data ?? {}) };
        enrichedRaw["Adds to cart"] = sr.adds_to_cart ?? 0;
        enrichedRaw["Landing page views"] = sr.landing_page_views ?? 0;
        rows.push({
          date: sr.date ?? "1970-01-01",
          week: sr.week,
          campaign_name: sr.campaign_name,
          campaign_id: sr.campaign_id,
          ad_set_name: sr.ad_set_name,
          ad_set_id: sr.ad_set_id,
          ad_name: sr.ad_name,
          ad_id: sr.ad_id,
          objective: null,
          buying_type: null,
          amount_spent: sr.amount_spent ?? 0,
          impressions: sr.paid_impressions ?? 0,
          reach: 0,
          frequency: null,
          clicks: sr.clicks ?? 0,
          link_clicks: sr.clicks ?? 0,
          unique_clicks: 0,
          unique_link_clicks: 0,
          ctr: null,
          link_ctr: null,
          cpm: null,
          cpc: null,
          link_cpc: null,
          results: null,
          result_indicator: null,
          cost_per_result: null,
          purchase_roas: null,
          purchases: sr.purchases ?? 0,
          purchase_value: sr.purchase_value ?? 0,
          quality_ranking: null,
          engagement_rate_ranking: null,
          conversion_rate_ranking: null,
          creative_type: sr.creative_type,
          creative_count: sr.creative_count,
          raw_data: enrichedRaw,
        });
      }
      if (snapRows.length < PAGE) break;
    }
  } else {
    // Meta — fallback progressivo per migrations 0041/0042
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
  } else if (
    mode !== "week" &&
    mode !== "none" &&
    imp.channel === "meta"
  ) {
    // buildComparison oggi supporta solo Meta (multi-import history
    // del singolo client). Snapchat per ora resta limitato a "none"
    // o "week" (intra-file).
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
    channel: imp.channel as "meta" | "snapchat",
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
