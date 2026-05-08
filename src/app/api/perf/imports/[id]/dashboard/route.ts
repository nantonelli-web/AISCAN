import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
} from "@/lib/perf/aggregate";
import {
  buildComparison,
  type ComparisonMode,
} from "@/lib/perf/comparisons";
import type {
  PerfDashboardData,
  MetaPerfRow,
  MetaKpiAggregate,
} from "@/types/perf";

/**
 * GET /api/perf/imports/[id]/dashboard
 * Query params:
 *  - compare: none | previous | week | yoy | custom
 *  - compare_from / compare_to: ISO date (per "custom")
 *  - week_current / week_compare: token "week 14" (per "week")
 *
 * Calcola aggregati per il dashboard. Mode "week" filtra le rows
 * dell'import per le settimane esplicite scelte dall'utente.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const mode = (url.searchParams.get("compare") ?? "none") as ComparisonMode;
  const customFrom = url.searchParams.get("compare_from") ?? undefined;
  const customTo = url.searchParams.get("compare_to") ?? undefined;
  const weekCurrent = url.searchParams.get("week_current");
  const weekCompare = url.searchParams.get("week_compare");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  type ImpHeader = {
    id: string;
    workspace_id: string;
    client_id: string;
    channel: string;
    period_from: string;
    period_to: string;
    currency: string | null;
    status: string;
    campaign_type_overrides?: Record<string, string> | null;
  };
  let impData: ImpHeader | null = null;
  {
    const full = await supabase
      .from("mait_perf_imports")
      .select(
        "id, workspace_id, client_id, channel, period_from, period_to, currency, status, campaign_type_overrides",
      )
      .eq("id", id)
      .single();
    if (full.data) {
      impData = full.data as unknown as ImpHeader;
    } else if (
      full.error &&
      /campaign_type_overrides/.test(full.error.message ?? "")
    ) {
      const fallback = await supabase
        .from("mait_perf_imports")
        .select(
          "id, workspace_id, client_id, channel, period_from, period_to, currency, status",
        )
        .eq("id", id)
        .single();
      if (fallback.data) impData = fallback.data as unknown as ImpHeader;
    }
  }
  const imp = impData;
  if (!imp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (imp.status !== "validated") {
    return NextResponse.json(
      { error: `Import status is ${imp.status}, dashboard unavailable.` },
      { status: 422 },
    );
  }
  if (imp.channel !== "meta") {
    return NextResponse.json(
      { error: "Channel not supported in MVP" },
      { status: 400 },
    );
  }

  // Load all rows for the import. Try with creative columns + week;
  // fall back progressively if the migrations aren't applied.
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
    // Cast the `select` args to `never` to bypass Supabase's deep
    // generic when the column list is a runtime variable.
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

  // For files in legacy/noWeek mode, week column may not exist:
  // try to read it from raw_data so the dashboard still gets weeks.
  if (level !== "full") {
    for (const r of rows) {
      if (r.week == null) {
        const w = (r.raw_data as Record<string, unknown> | undefined)?.[
          "Week"
        ];
        r.week =
          w == null || String(w).trim() === ""
            ? null
            : String(w).trim().toLowerCase().replace(/\s+/g, " ");
      }
    }
  }

  // Pull overrides from header
  const overrides = (imp.campaign_type_overrides ?? {}) as Record<string, string>;

  // Filter rows for the current period when mode="week" + week_current
  const filterByWeek = (subset: MetaPerfRow[], week: string | null) =>
    week == null ? subset : subset.filter((r) => r.week === week);

  // Determine "current" rows for KPI/charts. Default: all import rows.
  // When mode="week" with week_current, we restrict the dashboard to
  // the rows of that single week.
  let currentRows: MetaPerfRow[] = rows;
  let weekCurrentEffective: string | null = null;
  if (mode === "week" && weekCurrent) {
    weekCurrentEffective = weekCurrent;
    currentRows = filterByWeek(rows, weekCurrent);
  }

  // Comparison aggregate
  let comparisonAggregate: MetaKpiAggregate | null = null;
  let comparisonLabel: string | null = null;
  let comparisonFrom: string | null = null;
  let comparisonTo: string | null = null;
  if (mode === "week" && weekCurrent && weekCompare) {
    const cmpRows = filterByWeek(rows, weekCompare);
    if (cmpRows.length > 0) {
      comparisonAggregate = aggregateKpis(cmpRows);
      comparisonLabel = `${weekCompare} vs ${weekCurrent}`;
    }
  } else if (mode !== "week") {
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
      customFrom,
      customTo,
    );
    comparisonAggregate = cmp.aggregate;
    comparisonLabel = cmp.label;
    comparisonFrom = cmp.periodFrom;
    comparisonTo = cmp.periodTo;
  }

  const creativeCount = aggregateCreativeCountByType(currentRows);

  const payload: PerfDashboardData = {
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
  };

  return NextResponse.json(payload);
}
