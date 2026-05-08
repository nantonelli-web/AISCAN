/**
 * Validation rules per gli output del meta-parser. Restituisce
 * diagnostics aggiuntivi (oltre quelli gia' emessi dal parser).
 *
 * Le regole sono progressive:
 * - error → blocca il save (l'utente deve ri-uppare)
 * - warning → mostra ma permette il save
 * - info → puro signal contestuale
 */

import type {
  MetaPerfRow,
  PerfDiagnostic,
  MetaParseResult,
} from "@/types/perf";

const METRIC_TOLERANCE = 0.05; // 5% tolerance for derived metric checks

export function validateMetaParse(parsed: MetaParseResult): PerfDiagnostic[] {
  const diagnostics: PerfDiagnostic[] = [];
  const { rows, periodFrom, periodTo } = parsed;

  if (rows.length === 0) return diagnostics;

  // ── Date coverage gaps ──
  if (periodFrom && periodTo) {
    const dateSet = new Set(rows.map((r) => r.date));
    const cur = new Date(periodFrom + "T00:00:00Z");
    const end = new Date(periodTo + "T00:00:00Z");
    const missing: string[] = [];
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      if (!dateSet.has(iso)) missing.push(iso);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    if (missing.length > 0 && missing.length <= 30) {
      diagnostics.push({
        severity: "warning",
        code: "date_gaps",
        message: `${missing.length} day(s) without data within ${periodFrom}..${periodTo}.`,
        context: { missing: missing.slice(0, 10), totalMissing: missing.length },
      });
    } else if (missing.length > 30) {
      diagnostics.push({
        severity: "warning",
        code: "date_sparse",
        message: `Coverage is sparse (${missing.length} days without data in the reported period). Possible reason: file scoped only to active campaigns; OK to proceed if intentional.`,
      });
    }
  }

  // ── Negative metrics (Meta sometimes returns -1 for unavailable) ──
  let negativeCount = 0;
  for (const r of rows) {
    if (r.amount_spent < 0 || r.impressions < 0 || r.clicks < 0) {
      negativeCount++;
    }
  }
  if (negativeCount > 0) {
    diagnostics.push({
      severity: "warning",
      code: "negative_metrics",
      message: `${negativeCount} row(s) have negative metrics. They will be treated as zero.`,
      context: { count: negativeCount },
    });
  }

  // ── Metric consistency check (sampled to keep it fast) ──
  const sample = rows.slice(0, Math.min(rows.length, 50));
  let inconsistentCtr = 0;
  let inconsistentCpm = 0;
  for (const r of sample) {
    if (r.impressions > 0 && r.ctr != null) {
      const computed = (r.clicks / r.impressions) * 100;
      const reported = r.ctr;
      if (
        reported > 0 &&
        Math.abs(reported - computed) / reported > METRIC_TOLERANCE
      ) {
        inconsistentCtr++;
      }
    }
    if (r.impressions > 0 && r.cpm != null && r.amount_spent > 0) {
      const computed = (r.amount_spent / r.impressions) * 1000;
      const reported = r.cpm;
      if (
        reported > 0 &&
        Math.abs(reported - computed) / reported > METRIC_TOLERANCE
      ) {
        inconsistentCpm++;
      }
    }
  }
  if (inconsistentCtr > sample.length * 0.2) {
    diagnostics.push({
      severity: "warning",
      code: "ctr_inconsistent",
      message: `Reported CTR doesn't match clicks/impressions on ${inconsistentCtr}/${sample.length} sampled rows. The export might use a different click definition than expected (e.g. unique vs total).`,
    });
  }
  if (inconsistentCpm > sample.length * 0.2) {
    diagnostics.push({
      severity: "warning",
      code: "cpm_inconsistent",
      message: `Reported CPM doesn't match spend/impressions on ${inconsistentCpm}/${sample.length} sampled rows. Possible currency mismatch in the file.`,
    });
  }

  // ── Duplicate (date, campaign, ad_set, ad) tuples ──
  const dupeKeySet = new Set<string>();
  let dupeCount = 0;
  for (const r of rows) {
    const k = `${r.date}|${r.campaign_name ?? ""}|${r.ad_set_name ?? ""}|${r.ad_name ?? ""}`;
    if (dupeKeySet.has(k)) dupeCount++;
    else dupeKeySet.add(k);
  }
  if (dupeCount > 0) {
    diagnostics.push({
      severity: "warning",
      code: "duplicates",
      message: `${dupeCount} duplicate (date, campaign, ad_set, ad) row(s) detected. They will be saved as-is — your KPIs may be over-counted if the duplicates are not intentional.`,
      context: { count: dupeCount },
    });
  }

  // ── Result indicator distribution (info) ──
  const indicatorCounts = new Map<string, number>();
  let indicatorTotal = 0;
  for (const r of rows) {
    if (r.result_indicator) {
      indicatorCounts.set(
        r.result_indicator,
        (indicatorCounts.get(r.result_indicator) ?? 0) + 1,
      );
      indicatorTotal++;
    }
  }
  if (indicatorCounts.size > 1 && indicatorTotal > 0) {
    const top = [...indicatorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => ({
        indicator: k,
        share: Math.round((v / indicatorTotal) * 100),
      }));
    diagnostics.push({
      severity: "info",
      code: "result_indicator_mix",
      message: `Multiple result indicators present: ${top.map((t) => `${t.indicator} (${t.share}%)`).join(", ")}. Cost-per-result aggregation across mixed indicators is approximate.`,
      context: { distribution: top },
    });
  }

  return diagnostics;
}

/** Compute summary stats from parsed rows for the diagnostic preview. */
export function summariseMetaRows(rows: MetaPerfRow[]): {
  rowCount: number;
  totalSpend: number;
  totalImpressions: number;
  uniqueCampaigns: number;
} {
  const campaigns = new Set<string>();
  let totalSpend = 0;
  let totalImpressions = 0;
  for (const r of rows) {
    if (r.campaign_name) campaigns.add(r.campaign_name);
    totalSpend += Math.max(0, r.amount_spent);
    totalImpressions += Math.max(0, r.impressions);
  }
  return {
    rowCount: rows.length,
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalImpressions,
    uniqueCampaigns: campaigns.size,
  };
}
