/**
 * KPI aggregation primitives shared between the dashboard endpoint
 * and the comparison logic. Take a list of normalised Meta rows and
 * produce typed aggregates: totals, derived metrics, time-series
 * buckets, top-campaigns slices, objective mix.
 */

import type {
  MetaPerfRow,
  MetaKpiAggregate,
  MetaTimeSeriesPoint,
  MetaCampaignAggregate,
  CampaignTypeBreakdown,
  CampaignTypeAssignment,
  CountryBreakdown,
} from "@/types/perf";
import {
  decodeCampaignType,
  resolveCampaignType,
  type CampaignType,
} from "./campaign-decoder";
import {
  decodeCountriesFromNames,
  countryLabel,
} from "./country-decoder";

/** Read a numeric value from row.raw_data tolerating IT/EN locale
 *  and currency symbols. Used for engagement metrics that aren't
 *  in the normalised schema. */
function readRawNumber(row: MetaPerfRow, key: string): number {
  const v = row.raw_data?.[key];
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.max(0, v) : 0;
  const s = String(v).trim();
  if (!s) return 0;
  // Detect locale on the fly (IT uses "1.234,56", EN "1,234.56")
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let cleaned = s.replace(/[€$£¥%\s]/g, "");
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const after = s.length - 1 - lastComma;
    cleaned =
      after === 3 && s.length > 4
        ? cleaned.replace(/,/g, "")
        : cleaned.replace(",", ".");
  }
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Sum totals across rows, then derive ratio metrics from sums. This
 *  is statistically correct (weighted averages) — a row's CTR or CPM
 *  reported value is a per-row ratio that doesn't average linearly. */
export function aggregateKpis(rows: MetaPerfRow[]): MetaKpiAggregate {
  let amountSpent = 0;
  let impressions = 0;
  let sumReach = 0;
  let clicks = 0;
  let linkClicks = 0;
  let results = 0;
  let purchases = 0;
  let purchaseValue = 0;
  let postEngagements = 0;
  let igProfileVisits = 0;
  let igFollows = 0;
  const campaigns = new Set<string>();
  const adSets = new Set<string>();
  const ads = new Set<string>();
  // Settimane distinte presenti nei dati (per calcolare reach
  // medio settimanale). Se l'export e' giornaliero (no week) la
  // grouping fallback usa il count distinto delle date — meno
  // accurato ma evita di dividere per 1 e mostrare il sum totale.
  const weeksSet = new Set<string>();
  const datesSet = new Set<string>();

  for (const r of rows) {
    amountSpent += Math.max(0, r.amount_spent);
    impressions += Math.max(0, r.impressions);
    // Reach: aggregazione "raw" (somma per ad set × settimana).
    // Lo display mostra la **media settimanale** (sumReach /
    // numero settimane) per dare un valore conservativo invece
    // del totale cumulato che sovrastima molto. La frequency
    // resta calcolata su sumReach (matematicamente equivalente
    // a avg_imp / avg_reach, ma piu' robusto numericamente).
    sumReach += Math.max(0, r.reach);
    if (r.week) weeksSet.add(r.week);
    if (r.date) datesSet.add(r.date);
    clicks += Math.max(0, r.clicks);
    linkClicks += Math.max(0, r.link_clicks);
    results += Math.max(0, r.results ?? 0);
    purchases += Math.max(0, r.purchases ?? 0);
    purchaseValue += Math.max(0, r.purchase_value ?? 0);
    postEngagements += readRawNumber(r, "Post engagements");
    igProfileVisits += readRawNumber(r, "Instagram profile visits");
    igFollows += readRawNumber(r, "Instagram follows");
    if (r.campaign_name) campaigns.add(r.campaign_name);
    if (r.ad_set_name) adSets.add(r.ad_set_name);
    if (r.ad_name) ads.add(r.ad_name);
  }

  // Reach DISPLAY: torniamo al valore sum (= impressions /
  // frequency, matematicamente equivalente). Wording chiaro
  // nella hint che e' il reach cumulato sul periodo, non un
  // unique-users esatto. Voids = 1 se nWeeks vuoto per evitare
  // div-by-zero in calcoli che dipendessero ancora dalle weeks.
  void weeksSet;
  void datesSet;
  const reach = sumReach;

  const ratio = (n: number, d: number): number | null =>
    d > 0 ? n / d : null;
  const ctr =
    impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null; // %
  const linkCtr =
    impressions > 0
      ? Math.round((linkClicks / impressions) * 10000) / 100
      : null;
  // Effective clicks: prefer "Clicks (all)" (clicks > 0) but fall
  // back to link_clicks when the export doesn't have all-clicks
  // (typical Meta UI export case). Same approach for CPC/CTR
  // derivati. Verificato 2026-05-08 che i file Meta col solo
  // Link clicks non avevano nessuna metrica click visualizzata.
  const effectiveClicks = clicks > 0 ? clicks : linkClicks;
  const effectiveCtr =
    impressions > 0
      ? Math.round((effectiveClicks / impressions) * 10000) / 100
      : null;
  const cpm = impressions > 0 ? (amountSpent / impressions) * 1000 : null;
  const cpc = clicks > 0 ? amountSpent / clicks : null;
  const linkCpc = linkClicks > 0 ? amountSpent / linkClicks : null;
  const effectiveCpc =
    effectiveClicks > 0 ? amountSpent / effectiveClicks : null;
  const costPerResult = results > 0 ? amountSpent / results : null;
  const roas = amountSpent > 0 && purchaseValue > 0 ? purchaseValue / amountSpent : null;
  // Frequency: usa sumReach (totale raw) e impressions totali —
  // matematicamente equivalente a (avg_imp / avg_reach), valore
  // robusto della frequenza media nel periodo. Numericamente NON
  // corrisponde a "impressions / reach" della UI (perche' reach
  // mostrato e' la media settimanale), ma e' la metrica
  // statistica corretta della frequenza media.
  const frequency = ratio(impressions, sumReach);
  const costPerPurchase = purchases > 0 ? amountSpent / purchases : null;

  return {
    rowCount: rows.length,
    amountSpent: Math.round(amountSpent * 100) / 100,
    impressions,
    reach,
    clicks,
    linkClicks,
    effectiveClicks,
    results: Math.round(results * 100) / 100,
    purchases: Math.round(purchases * 100) / 100,
    purchaseValue: Math.round(purchaseValue * 100) / 100,
    postEngagements: Math.round(postEngagements),
    instagramProfileVisits: Math.round(igProfileVisits),
    instagramFollows: Math.round(igFollows),
    ctr,
    linkCtr,
    effectiveCtr,
    cpm: cpm == null ? null : Math.round(cpm * 100) / 100,
    cpc: cpc == null ? null : Math.round(cpc * 100) / 100,
    linkCpc: linkCpc == null ? null : Math.round(linkCpc * 100) / 100,
    effectiveCpc:
      effectiveCpc == null ? null : Math.round(effectiveCpc * 100) / 100,
    costPerResult:
      costPerResult == null ? null : Math.round(costPerResult * 100) / 100,
    roas: roas == null ? null : Math.round(roas * 100) / 100,
    frequency:
      frequency == null ? null : Math.round(frequency * 100) / 100,
    costPerPurchase:
      costPerPurchase == null ? null : Math.round(costPerPurchase * 100) / 100,
    uniqueCampaigns: campaigns.size,
    uniqueAdSets: adSets.size,
    uniqueAds: ads.size,
  };
}

/** Read an event value for a row given a CampaignType.eventField.
 *  Supports "raw:Foo" notation that reads from row.raw_data[Foo]. */
function readEventCount(row: MetaPerfRow, field: string): number {
  if (field.startsWith("raw:")) {
    const key = field.slice(4);
    const v = row.raw_data?.[key];
    if (typeof v === "number") return Math.max(0, v);
    if (typeof v === "string") {
      const n = Number.parseFloat(v.replace(/[^\d.,-]/g, "").replace(",", "."));
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }
    return 0;
  }
  if (field === "purchases") return Math.max(0, row.purchases ?? 0);
  if (field === "purchase_value") return Math.max(0, row.purchase_value ?? 0);
  if (field === "results") return Math.max(0, row.results ?? 0);
  if (field === "link_clicks") return Math.max(0, row.link_clicks);
  if (field === "reach") return Math.max(0, row.reach);
  return 0;
}

/** Per-campaign-type aggregate. Group rows by decoded (or
 *  override-d) campaign type, then sum spend + per-type event
 *  count, derive CPR. Campaigns che non si decodificano
 *  finiscono in "UNKNOWN". */
export function aggregateCampaignTypes(
  rows: MetaPerfRow[],
  overrides: Record<string, string> = {},
): CampaignTypeBreakdown[] {
  type Bucket = {
    code: string;
    label: string;
    eventField: string | null;
    spend: number;
    impressions: number;
    resultCount: number;
    purchases: number;
    campaigns: Set<string>;
  };
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const t = resolveCampaignType(r.campaign_name, overrides);
    const code = t?.code ?? "UNKNOWN";
    const label = t?.label ?? "Unknown / non decoded";
    const field = t?.eventField ?? null;
    const b = buckets.get(code) ?? {
      code,
      label,
      eventField: field,
      spend: 0,
      impressions: 0,
      resultCount: 0,
      purchases: 0,
      campaigns: new Set<string>(),
    };
    b.spend += Math.max(0, r.amount_spent);
    b.impressions += Math.max(0, r.impressions);
    if (field) b.resultCount += readEventCount(r, field);
    b.purchases += Math.max(0, r.purchases ?? 0);
    if (r.campaign_name) b.campaigns.add(r.campaign_name);
    buckets.set(code, b);
  }
  return [...buckets.values()]
    .map((b) => ({
      code: b.code,
      label: b.label,
      campaignCount: b.campaigns.size,
      spend: Math.round(b.spend * 100) / 100,
      impressions: b.impressions,
      resultCount: Math.round(b.resultCount * 100) / 100,
      cpr:
        b.resultCount > 0
          ? Math.round((b.spend / b.resultCount) * 100) / 100
          : null,
      purchases: Math.round(b.purchases * 100) / 100,
      campaignNames: [...b.campaigns].sort(),
    }))
    .sort((a, b) => b.spend - a.spend);
}

/** Build the campaign-type-assignments list (per la UI override).
 *  Una riga per ogni campagna unica nel file: nome, decodifica auto,
 *  override (se settato). */
export function buildCampaignTypeAssignments(
  rows: MetaPerfRow[],
  overrides: Record<string, string> = {},
): CampaignTypeAssignment[] {
  const seen = new Map<string, CampaignTypeAssignment>();
  for (const r of rows) {
    const name = r.campaign_name;
    if (!name || seen.has(name)) continue;
    const decoded = decodeCampaignType(name);
    seen.set(name, {
      campaignName: name,
      decodedCode: decoded?.code ?? null,
      decodedLabel: decoded?.label ?? null,
      overrideCode: overrides[name] ?? null,
    });
  }
  return [...seen.values()].sort((a, b) =>
    a.campaignName.localeCompare(b.campaignName),
  );
}

/** Spend share + click + CTR + acquisti per creative type. */
export function aggregateCreativeTypeMix(
  rows: MetaPerfRow[],
): {
  name: string;
  value: number;
  clicks: number;
  impressions: number;
  ctr: number | null;
  purchases: number;
}[] {
  type Acc = {
    value: number;
    clicks: number;
    impressions: number;
    purchases: number;
  };
  const map = new Map<string, Acc>();
  for (const r of rows) {
    if (!r.creative_type) continue;
    const acc = map.get(r.creative_type) ?? {
      value: 0,
      clicks: 0,
      impressions: 0,
      purchases: 0,
    };
    acc.value += Math.max(0, r.amount_spent);
    acc.clicks += r.clicks > 0 ? r.clicks : Math.max(0, r.link_clicks);
    acc.impressions += Math.max(0, r.impressions);
    acc.purchases += Math.max(0, r.purchases ?? 0);
    map.set(r.creative_type, acc);
  }
  return [...map.entries()]
    .map(([name, a]) => ({
      name,
      value: Math.round(a.value * 100) / 100,
      clicks: a.clicks,
      impressions: a.impressions,
      ctr:
        a.impressions > 0
          ? Math.round((a.clicks / a.impressions) * 10000) / 100
          : null,
      purchases: Math.round(a.purchases * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Numero asset per creative type. Logica:
 *  - se l'export ha le settimane (column "Week" popolata), conta
 *    le righe per (week, type), poi fa la **media** tra le
 *    settimane. Cosi' se un brand fa rotation di ~17 image / ~10
 *    video ogni settimana, il valore mostrato riflette il volume
 *    medio di asset attivi per finestra di reporting (non il
 *    volume del file moltiplicato per il numero di settimane);
 *  - se l'export e' giornaliero (no week), dedup per
 *    (creative_type, ad_name, ad_set_name, campaign_name).
 *
 *  Ritorna anche un label esplicito della finestra usata per la UI.
 */
export function aggregateCreativeCountByType(rows: MetaPerfRow[]): {
  items: { name: string; count: number }[];
  label: string;
} {
  const weeksWithData = new Set<string>();
  for (const r of rows) {
    if (r.week) weeksWithData.add(r.week);
  }

  if (weeksWithData.size > 0) {
    // Per ogni (week, creative_type) sommiamo creative_count, poi
    // mediamo per type sulle N settimane.
    type Pair = { week: string; type: string };
    const byPair = new Map<string, number>();
    for (const r of rows) {
      if (!r.week || !r.creative_type || r.creative_count == null) continue;
      const k = `${r.week}|${r.creative_type}`;
      byPair.set(k, (byPair.get(k) ?? 0) + (r.creative_count ?? 0));
    }
    const sumByType = new Map<string, number>();
    const weeksByType = new Map<string, Set<string>>();
    for (const [pairKey, value] of byPair) {
      const [week, type] = pairKey.split("|") as [Pair["week"], Pair["type"]];
      sumByType.set(type, (sumByType.get(type) ?? 0) + value);
      const ws = weeksByType.get(type) ?? new Set<string>();
      ws.add(week);
      weeksByType.set(type, ws);
    }
    const totalWeeks = weeksWithData.size;
    return {
      items: [...sumByType.entries()]
        .map(([name, sum]) => ({
          name,
          // Media: sum / nWeeks (usiamo totalWeeks invece di
          // weeksByType[type].size cosi' un type assente in alcune
          // settimane "diluisce" la media correttamente).
          count: Math.round((sum / totalWeeks) * 10) / 10,
        }))
        .sort((a, b) => b.count - a.count),
      label: `media su ${totalWeeks} settiman${totalWeeks === 1 ? "a" : "e"}`,
    };
  }

  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.creative_type || r.creative_count == null) continue;
    const dedupKey = `${r.creative_type}|${r.ad_name ?? ""}|${r.ad_set_name ?? ""}|${r.campaign_name ?? ""}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    counts.set(
      r.creative_type,
      (counts.get(r.creative_type) ?? 0) + (r.creative_count ?? 0),
    );
  }
  return {
    items: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    label: "totale dedup",
  };
}

/** Lista weeks distinte presenti nelle rows, ordinate
 *  cronologicamente (per il dropdown del confronto week). */
export function listWeeks(rows: MetaPerfRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.week) set.add(r.week);
  }
  return [...set].sort((a, b) => {
    const na = Number(a.replace(/\D+/g, "")) || 0;
    const nb = Number(b.replace(/\D+/g, "")) || 0;
    return na - nb;
  });
}

/** Country breakdown — split spend pro-rata quando una campagna
 *  targetizza piu' paesi (es. KSA-UAE → 50% KSA, 50% UAE). */
export function aggregateCountryBreakdown(
  rows: MetaPerfRow[],
): CountryBreakdown[] {
  type Bucket = {
    code: string;
    label: string;
    spend: number;
    impressions: number;
    clicks: number;
    purchases: number;
    campaigns: Set<string>;
  };
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const codes = decodeCountriesFromNames(r.campaign_name, r.ad_set_name);
    const share = 1 / codes.length;
    for (const c of codes) {
      const b = buckets.get(c) ?? {
        code: c,
        label: countryLabel(c),
        spend: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        campaigns: new Set<string>(),
      };
      b.spend += Math.max(0, r.amount_spent) * share;
      b.impressions += Math.max(0, r.impressions) * share;
      b.clicks +=
        (r.clicks > 0 ? r.clicks : Math.max(0, r.link_clicks)) * share;
      b.purchases += Math.max(0, r.purchases ?? 0) * share;
      if (r.campaign_name) b.campaigns.add(r.campaign_name);
      buckets.set(c, b);
    }
  }
  return [...buckets.values()]
    .map((b) => ({
      code: b.code,
      label: b.label,
      spend: Math.round(b.spend * 100) / 100,
      impressions: Math.round(b.impressions),
      clicks: Math.round(b.clicks),
      purchases: Math.round(b.purchases * 100) / 100,
      campaignCount: b.campaigns.size,
    }))
    .sort((a, b) => b.spend - a.spend);
}

// Re-export type for convenience in route handler.
export type { CampaignType };

/** Bucket rows by date, sum spend/impressions/clicks/results. */
export function aggregateTimeSeries(rows: MetaPerfRow[]): MetaTimeSeriesPoint[] {
  const map = new Map<string, MetaTimeSeriesPoint>();
  for (const r of rows) {
    const cur = map.get(r.date) ?? {
      date: r.date,
      spend: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
    };
    cur.spend += Math.max(0, r.amount_spent);
    cur.impressions += Math.max(0, r.impressions);
    cur.clicks += Math.max(0, r.clicks);
    cur.results += Math.max(0, r.results ?? 0);
    map.set(r.date, cur);
  }
  // Round spend after summing
  for (const v of map.values()) {
    v.spend = Math.round(v.spend * 100) / 100;
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Top N campaigns by spend or by ROAS. */
export function topCampaigns(
  rows: MetaPerfRow[],
  by: "spend" | "roas",
  n = 10,
): MetaCampaignAggregate[] {
  const map = new Map<string, MetaCampaignAggregate & { _purchaseValue: number }>();
  for (const r of rows) {
    const name = r.campaign_name ?? "—";
    const cur =
      map.get(name) ??
      ({
        campaign_name: name,
        spend: 0,
        impressions: 0,
        clicks: 0,
        results: 0,
        roas: null,
        _purchaseValue: 0,
      } as MetaCampaignAggregate & { _purchaseValue: number });
    cur.spend += Math.max(0, r.amount_spent);
    cur.impressions += Math.max(0, r.impressions);
    cur.clicks += Math.max(0, r.clicks);
    cur.results += Math.max(0, r.results ?? 0);
    cur._purchaseValue += Math.max(0, r.purchase_value ?? 0);
    map.set(name, cur);
  }
  const arr = [...map.values()].map((c) => ({
    campaign_name: c.campaign_name,
    spend: Math.round(c.spend * 100) / 100,
    impressions: c.impressions,
    clicks: c.clicks,
    results: Math.round(c.results * 100) / 100,
    roas:
      c.spend > 0
        ? Math.round((c._purchaseValue / c.spend) * 100) / 100
        : null,
  }));
  if (by === "spend") {
    return arr.sort((a, b) => b.spend - a.spend).slice(0, n);
  }
  return arr
    .filter((c) => c.roas != null)
    .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
    .slice(0, n);
}

/** Top campagne ordinate per RISULTATI type-specifici (es. ATC →
 *  Adds to cart, VC → Content views, PURCH → purchases). Usa il
 *  campaign-decoder per scegliere il giusto eventField, riusando
 *  le overrides. Per le campagne non decodificate ricade su
 *  `r.results` se presente, altrimenti effectiveClicks. */
export function topCampaignsByResults(
  rows: MetaPerfRow[],
  overrides: Record<string, string> = {},
  n = 10,
): (MetaCampaignAggregate & { resultLabel: string })[] {
  type Acc = MetaCampaignAggregate & {
    _purchaseValue: number;
    eventField: string | null;
    resultLabel: string;
  };
  const map = new Map<string, Acc>();
  for (const r of rows) {
    const name = r.campaign_name ?? "—";
    const t = resolveCampaignType(r.campaign_name, overrides);
    let acc = map.get(name);
    if (!acc) {
      acc = {
        campaign_name: name,
        spend: 0,
        impressions: 0,
        clicks: 0,
        results: 0,
        roas: null,
        _purchaseValue: 0,
        eventField: t?.eventField ?? null,
        resultLabel: t?.label ?? "Risultati",
      };
      map.set(name, acc);
    }
    acc.spend += Math.max(0, r.amount_spent);
    acc.impressions += Math.max(0, r.impressions);
    acc.clicks += Math.max(0, r.clicks);
    acc._purchaseValue += Math.max(0, r.purchase_value ?? 0);
    if (acc.eventField) {
      acc.results += readEventCount(r, acc.eventField);
    } else if (r.results != null) {
      acc.results += Math.max(0, r.results);
    } else {
      // Fallback: link clicks come proxy ("traffic" implicito)
      acc.results += Math.max(0, r.link_clicks);
    }
  }
  return [...map.values()]
    .map((c) => ({
      campaign_name: c.campaign_name,
      spend: Math.round(c.spend * 100) / 100,
      impressions: c.impressions,
      clicks: c.clicks,
      results: Math.round(c.results * 100) / 100,
      roas:
        c.spend > 0
          ? Math.round((c._purchaseValue / c.spend) * 100) / 100
          : null,
      resultLabel: c.resultLabel,
    }))
    .filter((c) => c.results > 0)
    .sort((a, b) => b.results - a.results)
    .slice(0, n);
}

/** Spend share by objective (for the pie chart). */
export function objectiveMix(
  rows: MetaPerfRow[],
): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const obj = r.objective ?? "—";
    map.set(obj, (map.get(obj) ?? 0) + Math.max(0, r.amount_spent));
  }
  return [...map.entries()]
    .map(([name, value]) => ({
      name,
      value: Math.round(value * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value);
}
