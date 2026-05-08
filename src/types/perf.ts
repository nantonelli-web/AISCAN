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
  /** Week token estratto dalla column "Week" (es. "week 14"). Null
   *  se l'export e' giornaliero. Usato per filter+confronti
   *  week-vs-week. */
  week: string | null;
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

  /** Custom columns (optional). image / video / carousel / ecc. */
  creative_type: string | null;
  /** Numero di creativita' associate al row (ad set / campaign). */
  creative_count: number | null;

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
  /** Clicks (all). 0 se l'export non lo include — molti file
   *  Meta hanno solo Link clicks. */
  clicks: number;
  linkClicks: number;
  /** "Effective" clicks: max(clicks, linkClicks). Usato dal
   *  dashboard come KPI principale "Clicks" quando il file ha
   *  solo link_clicks senza clicks (all). */
  effectiveClicks: number;
  results: number;
  purchases: number;
  purchaseValue: number;
  /** Engagement metrics estratte dal raw_data (Meta colonne
   *  opzionali "Post engagements", "Instagram profile visits",
   *  "Instagram follows"). 0 se l'export non le include. */
  postEngagements: number;
  instagramProfileVisits: number;
  instagramFollows: number;
  // Derivati
  ctr: number | null; // clicks/impressions × 100
  linkCtr: number | null;
  /** "Effective" CTR: usa effectiveClicks. */
  effectiveCtr: number | null;
  cpm: number | null; // spend/impressions × 1000
  cpc: number | null; // spend/clicks
  linkCpc: number | null;
  /** "Effective" CPC: spend/effectiveClicks. */
  effectiveCpc: number | null;
  costPerResult: number | null; // spend/results
  roas: number | null; // purchaseValue / spend
  frequency: number | null; // impressions/reach
  /** Cost per Purchase = spend / purchases. Null se purchases=0. */
  costPerPurchase: number | null;
  uniqueCampaigns: number;
  uniqueAdSets: number;
  uniqueAds: number;
}

/** Per-campaign-type aggregate (es. tutte le campaign con type
 *  ATC raggruppate). */
export interface CampaignTypeBreakdown {
  /** Sigla normalizzata (UPPERCASE) o "UNKNOWN" se non decoded. */
  code: string;
  label: string;
  /** Numero di campagne distinte con questa type. */
  campaignCount: number;
  spend: number;
  impressions: number;
  /** "Eventi" risultato per la specifica type (es. ATC count
   *  per ATC, View Content count per VC, Purchases per PUR). */
  resultCount: number;
  /** Cost-per-result type-specifico = spend / resultCount. */
  cpr: number | null;
  /** Numero acquisti registrati su questo gruppo di campagne —
   *  indipendentemente dal tipo decodificato. Permette di vedere
   *  dove cadono realmente gli acquisti se per esempio una ATC
   *  finisce per portare anche purchases. */
  purchases: number;
  /** Nomi delle campagne in questa categoria, per la UI di
   *  override. */
  campaignNames: string[];
}

/** Riga della UI di override: mappa campaign_name → type_code,
 *  con la possibilita' di confermare/correggere la decodifica. */
export interface CampaignTypeAssignment {
  campaignName: string;
  decodedCode: string | null;
  decodedLabel: string | null;
  /** Override applicato (se diverso dal decoded). */
  overrideCode: string | null;
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

/** Aggregato per paese (estratto da campaign_name / ad_set_name
 *  via country-decoder). */
export interface CountryBreakdown {
  /** ISO-2-like code (KSA, UAE, IT, US, ecc) o "MULTI" per campagne
   *  che targetizzano piu' paesi (KSA-UAE / KSA+UAE) o "UNKNOWN"
   *  quando nessun paese e' decodificato. */
  code: string;
  label: string;
  spend: number;
  impressions: number;
  clicks: number;
  /** Acquisti registrati su questo paese (split pro-rata se la
   *  campagna targetizza piu' paesi). */
  purchases: number;
  campaignCount: number;
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
    mode: "none" | "previous" | "week" | "yoy" | "custom";
    label: string | null;
    periodFrom: string | null;
    periodTo: string | null;
    aggregate: MetaKpiAggregate | null;
  };
  timeSeries: MetaTimeSeriesPoint[];
  topByCampaignSpend: MetaCampaignAggregate[];
  topByCampaignRoas: MetaCampaignAggregate[];
  /** Spend share per Meta objective (può essere vuoto se l'export
   *  non ha la colonna Objective — dashboard nasconde il pannello). */
  objectiveMix: { name: string; value: number }[];
  /** Spend share per creative type (image / video / carousel / ...).
   *  Può essere vuoto se l'export non ha la colonna creative_type. */
  creativeTypeMix: { name: string; value: number }[];
  /** Numero asset per creative type (riferito alla week piu' recente
   *  o, se l'export non ha le week, dedup per ad_name). Evita di
   *  gonfiare il count quando le creativita' si ripetono week per
   *  week. */
  creativeCountByType: { name: string; count: number }[];
  /** Etichetta del periodo a cui si riferisce creativeCountByType
   *  (es. "week 18" o "totale dedup"), per chiarezza nella UI. */
  creativeCountLabel: string;
  /** Per-type breakdown computed via campaign-decoder + overrides. */
  campaignTypes: CampaignTypeBreakdown[];
  /** Assignments per la UI di override. Tutte le campagne uniche
   *  del file con la decodifica auto + eventuale override. */
  campaignTypeAssignments: CampaignTypeAssignment[];
  /** Country breakdown estratto dai nomi campagna / ad set. */
  countries: CountryBreakdown[];
  /** Lista delle settimane presenti nel file (dalla column "Week").
   *  Vuota se l'export e' giornaliero. Ordinata cronologicamente. */
  weeks: string[];
  /** Quando il dashboard e' filtrato per una specifica week (mode
   *  comparison "week"), questo identifica la week corrente
   *  visualizzata. */
  weekCurrent: string | null;
  /** Bounds delle date effettivamente presenti nelle righe del
   *  file. Limitano il range del date picker custom: l'utente puo'
   *  scegliere date solo dentro questa finestra (no senso usare
   *  range fuori dal file). */
  dataMinDate: string | null;
  dataMaxDate: string | null;
}

/** Riga della lista import shown sul client detail page. */
export interface PerfImportListItem {
  id: string;
  workspace_id: string;
  client_id: string;
  /** Brand a cui appartengono questi dati performance. Nullable
   *  per backward compat (import caricati prima della migration
   *  0043 non hanno il brand). */
  brand_id: string | null;
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
