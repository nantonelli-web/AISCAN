/**
 * Types per il modulo Adv Performance (first-party campaign data).
 * Migration 0040 — feature 2026-05-08.
 */

export type PerfChannel = "meta" | "google" | "tiktok" | "snapchat";
export type PerfImportStatus = "parsing" | "validated" | "failed";
export type PerfFileFormat = "csv" | "xlsx";

/** Diagnostic finding from parser+validator (ordered by severity). */
export interface PerfDiagnostic {
  severity: "info" | "warning" | "error";
  /** Stable code (es. "missing_column", "metric_consistency", "date_gap") */
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

/** Meta export normalised row (mait_perf_meta_rows). */
export interface MetaPerfRow {
  date: string; // ISO date (YYYY-MM-DD)
  campaign_name: string | null;
  campaign_id: string | null;
  ad_set_name: string | null;
  ad_set_id: string | null;
  ad_name: string | null;
  ad_id: string | null;
  objective: string | null;
  buying_type: string | null;

  amount_spent: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  link_clicks: number;
  unique_clicks: number;
  unique_link_clicks: number;

  ctr: number | null;
  link_ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  link_cpc: number | null;

  results: number | null;
  result_indicator: string | null;
  cost_per_result: number | null;
  purchase_roas: number | null;
  purchases: number | null;
  purchase_value: number | null;

  quality_ranking: string | null;
  engagement_rate_ranking: string | null;
  conversion_rate_ranking: string | null;

  raw_data: Record<string, unknown>;
}

/** Output del parser. */
export interface MetaParseResult {
  rows: MetaPerfRow[];
  /** Map of detected source column name → normalised key. Salvato
   *  in mait_perf_imports.raw_meta per debug e mostrato nella
   *  diagnostic UI. */
  detectedColumns: Record<string, string>;
  periodFrom: string | null;
  periodTo: string | null;
  currency: string | null;
  diagnostics: PerfDiagnostic[];
}

/** Aggregato KPI per un set di righe (singolo periodo o range). */
export interface MetaKpiAggregate {
  rowCount: number;
  amountSpent: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  results: number;
  purchases: number;
  purchaseValue: number;
  // Derivati
  ctr: number | null; // clicks/impressions × 100
  linkCtr: number | null;
  cpm: number | null; // spend/impressions × 1000
  cpc: number | null; // spend/clicks
  linkCpc: number | null;
  costPerResult: number | null; // spend/results
  roas: number | null; // purchaseValue / spend
  frequency: number | null; // impressions/reach
  uniqueCampaigns: number;
  uniqueAdSets: number;
  uniqueAds: number;
}

/** Time series bucket (per giorno). */
export interface MetaTimeSeriesPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
}

/** Top campaign aggregate (per spend or per ROAS). */
export interface MetaCampaignAggregate {
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  roas: number | null;
}

/** DTO restituito da /api/perf/imports/[id]/dashboard. */
export interface PerfDashboardData {
  importId: string;
  clientId: string;
  channel: PerfChannel;
  periodFrom: string;
  periodTo: string;
  currency: string | null;
  current: MetaKpiAggregate;
  comparison: {
    mode: "none" | "previous" | "yoy" | "custom";
    label: string | null;
    periodFrom: string | null;
    periodTo: string | null;
    aggregate: MetaKpiAggregate | null;
  };
  timeSeries: MetaTimeSeriesPoint[];
  topByCampaignSpend: MetaCampaignAggregate[];
  topByCampaignRoas: MetaCampaignAggregate[];
  objectiveMix: { name: string; value: number }[]; // value = spend
}

/** Riga della lista import shown sul client detail page. */
export interface PerfImportListItem {
  id: string;
  workspace_id: string;
  client_id: string;
  channel: PerfChannel;
  period_from: string;
  period_to: string;
  status: PerfImportStatus;
  currency: string | null;
  row_count: number;
  total_spend: number;
  total_impressions: number;
  file_name: string | null;
  created_at: string;
}
