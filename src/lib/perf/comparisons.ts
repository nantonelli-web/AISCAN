/**
 * Period-over-period comparison logic.
 *
 * Modi supportati:
 *  - "previous": il periodo immediatamente precedente con stessa
 *    durata (es. periodo corrente Apr 1-30 → confronto Mar 2-31).
 *  - "yoy" (Year over Year): stessa finestra 1 anno prima.
 *  - "custom": l'utente fornisce dateFrom/dateTo.
 *
 * Per ognuno carichiamo le righe matching da mait_perf_meta_rows
 * filtrando per (workspace, client, channel, date range). Le righe
 * possono provenire da QUALSIASI import — non solo dal "fratello"
 * dell'import corrente — perche' un range custom puo' attraversare
 * piu' import.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateKpis } from "./aggregate";
import type { MetaPerfRow, MetaKpiAggregate } from "@/types/perf";

export type ComparisonMode = "none" | "previous" | "yoy" | "custom";

export interface ComparisonResult {
  mode: ComparisonMode;
  label: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  aggregate: MetaKpiAggregate | null;
}

/** Add `days` (signed) to ISO date string, returning ISO date. */
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Subtract 1 year from ISO date. Maps Feb 29 → Feb 28 (no leap). */
function subYear(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/** Day count between two ISO dates (inclusive). */
function dayCount(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

interface CurrentPeriod {
  workspaceId: string;
  clientId: string;
  channel: "meta";
  periodFrom: string;
  periodTo: string;
}

/** Compute the (from, to) of the comparison window given the mode. */
export function comparisonWindow(
  current: CurrentPeriod,
  mode: ComparisonMode,
  customFrom?: string,
  customTo?: string,
): { from: string | null; to: string | null; label: string | null } {
  if (mode === "none") return { from: null, to: null, label: null };

  if (mode === "previous") {
    const days = dayCount(current.periodFrom, current.periodTo);
    const to = addDays(current.periodFrom, -1);
    const from = addDays(to, -(days - 1));
    return { from, to, label: `${from} → ${to}` };
  }

  if (mode === "yoy") {
    const from = subYear(current.periodFrom);
    const to = subYear(current.periodTo);
    return { from, to, label: `${from} → ${to}` };
  }

  // custom
  if (mode === "custom") {
    if (
      !customFrom ||
      !customTo ||
      !/^\d{4}-\d{2}-\d{2}$/.test(customFrom) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(customTo)
    ) {
      return { from: null, to: null, label: null };
    }
    return {
      from: customFrom,
      to: customTo,
      label: `${customFrom} → ${customTo}`,
    };
  }

  return { from: null, to: null, label: null };
}

/** Fetch and aggregate Meta rows for the given (client, channel, date range). */
export async function fetchAggregate(
  supabase: SupabaseClient,
  workspaceId: string,
  clientId: string,
  channel: "meta",
  from: string,
  to: string,
): Promise<MetaKpiAggregate | null> {
  // Channel currently supports only "meta"; argument typed for
  // future-proofing when we add Google/TikTok/Snapchat.
  if (channel !== "meta") return null;

  const PAGE = 1000;
  const SAFETY_CAP = 50_000;
  const rows: MetaPerfRow[] = [];
  for (let offset = 0; offset < SAFETY_CAP; offset += PAGE) {
    const { data, error } = await supabase
      .from("mait_perf_meta_rows")
      .select(
        "date, campaign_name, ad_set_name, ad_name, objective, amount_spent, impressions, reach, clicks, link_clicks, results, purchases, purchase_value, raw_data",
      )
      .eq("workspace_id", workspaceId)
      .eq("client_id", clientId)
      .gte("date", from)
      .lte("date", to)
      .range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    // Cast to MetaPerfRow — we don't read every field for aggregation,
    // but the aggregator only needs the fields we selected.
    rows.push(...(data as unknown as MetaPerfRow[]));
    if (data.length < PAGE) break;
  }

  if (rows.length === 0) return null;
  return aggregateKpis(rows);
}

export async function buildComparison(
  supabase: SupabaseClient,
  current: CurrentPeriod,
  mode: ComparisonMode,
  customFrom?: string,
  customTo?: string,
): Promise<ComparisonResult> {
  const win = comparisonWindow(current, mode, customFrom, customTo);
  if (mode === "none" || !win.from || !win.to) {
    return {
      mode,
      label: null,
      periodFrom: null,
      periodTo: null,
      aggregate: null,
    };
  }
  const aggregate = await fetchAggregate(
    supabase,
    current.workspaceId,
    current.clientId,
    current.channel,
    win.from,
    win.to,
  );
  return {
    mode,
    label: win.label,
    periodFrom: win.from,
    periodTo: win.to,
    aggregate,
  };
}
