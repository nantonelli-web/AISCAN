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
} from "@/types/perf";

/** Sum totals across rows, then derive ratio metrics from sums. This
 *  is statistically correct (weighted averages) — a row's CTR or CPM
 *  reported value is a per-row ratio that doesn't average linearly. */
export function aggregateKpis(rows: MetaPerfRow[]): MetaKpiAggregate {
  let amountSpent = 0;
  let impressions = 0;
  let reach = 0;
  let clicks = 0;
  let linkClicks = 0;
  let results = 0;
  let purchases = 0;
  let purchaseValue = 0;
  const campaigns = new Set<string>();
  const adSets = new Set<string>();
  const ads = new Set<string>();

  for (const r of rows) {
    amountSpent += Math.max(0, r.amount_spent);
    impressions += Math.max(0, r.impressions);
    reach = Math.max(reach, r.reach); // reach is unique users — sum non sense
    clicks += Math.max(0, r.clicks);
    linkClicks += Math.max(0, r.link_clicks);
    results += Math.max(0, r.results ?? 0);
    purchases += Math.max(0, r.purchases ?? 0);
    purchaseValue += Math.max(0, r.purchase_value ?? 0);
    if (r.campaign_name) campaigns.add(r.campaign_name);
    if (r.ad_set_name) adSets.add(r.ad_set_name);
    if (r.ad_name) ads.add(r.ad_name);
  }

  const ratio = (n: number, d: number): number | null =>
    d > 0 ? n / d : null;
  const ctr =
    impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null; // %
  const linkCtr =
    impressions > 0
      ? Math.round((linkClicks / impressions) * 10000) / 100
      : null;
  const cpm = impressions > 0 ? (amountSpent / impressions) * 1000 : null;
  const cpc = clicks > 0 ? amountSpent / clicks : null;
  const linkCpc = linkClicks > 0 ? amountSpent / linkClicks : null;
  const costPerResult = results > 0 ? amountSpent / results : null;
  const roas = amountSpent > 0 ? purchaseValue / amountSpent : null;
  const frequency = ratio(impressions, reach);

  return {
    rowCount: rows.length,
    amountSpent: Math.round(amountSpent * 100) / 100,
    impressions,
    reach,
    clicks,
    linkClicks,
    results: Math.round(results * 100) / 100,
    purchases: Math.round(purchases * 100) / 100,
    purchaseValue: Math.round(purchaseValue * 100) / 100,
    ctr,
    linkCtr,
    cpm: cpm == null ? null : Math.round(cpm * 100) / 100,
    cpc: cpc == null ? null : Math.round(cpc * 100) / 100,
    linkCpc: linkCpc == null ? null : Math.round(linkCpc * 100) / 100,
    costPerResult:
      costPerResult == null ? null : Math.round(costPerResult * 100) / 100,
    roas: roas == null ? null : Math.round(roas * 100) / 100,
    frequency:
      frequency == null ? null : Math.round(frequency * 100) / 100,
    uniqueCampaigns: campaigns.size,
    uniqueAdSets: adSets.size,
    uniqueAds: ads.size,
  };
}

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
