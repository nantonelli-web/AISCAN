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
} from "@/lib/perf/aggregate";
import {
  buildComparison,
  type ComparisonMode,
} from "@/lib/perf/comparisons";
import type {
  PerfDashboardData,
  MetaPerfRow,
} from "@/types/perf";

/**
 * GET /api/perf/imports/[id]/dashboard
 * Query: compare=none|previous|yoy|custom, compare_from, compare_to
 *
 * Calcola tutti gli aggregati per il dashboard di un singolo import.
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the import header. Include the new campaign_type_overrides
  // column when present; if migration 0041 isn't applied yet,
  // PostgREST returns a schema-cache error → retry without that
  // column so the dashboard still loads (overrides default to {}).
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

  // Load all rows for the import. Try with creative columns; if
  // they don't exist in the DB (migration 0041 not applied), fall
  // back to the legacy schema selection.
  const PAGE = 1000;
  const SAFETY_CAP = 50_000;
  const rows: MetaPerfRow[] = [];
  const fullCols =
    "date, campaign_name, ad_set_name, ad_name, objective, amount_spent, impressions, reach, frequency, clicks, link_clicks, unique_clicks, unique_link_clicks, ctr, link_ctr, cpm, cpc, link_cpc, results, result_indicator, cost_per_result, purchase_roas, purchases, purchase_value, creative_type, creative_count, raw_data";
  const legacyCols =
    "date, campaign_name, ad_set_name, ad_name, objective, amount_spent, impressions, reach, frequency, clicks, link_clicks, unique_clicks, unique_link_clicks, ctr, link_ctr, cpm, cpc, link_cpc, results, result_indicator, cost_per_result, purchase_roas, purchases, purchase_value, raw_data";
  let useLegacy = false;
  for (let offset = 0; offset < SAFETY_CAP; offset += PAGE) {
    const cols = useLegacy ? legacyCols : fullCols;
    const { data, error } = await supabase
      .from("mait_perf_meta_rows")
      .select(cols)
      .eq("import_id", id)
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (
        !useLegacy &&
        /creative_(type|count)/.test(error.message ?? "")
      ) {
        useLegacy = true;
        offset -= PAGE; // retry the same window
        continue;
      }
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as MetaPerfRow[]));
    if (data.length < PAGE) break;
  }

  // Pull overrides from header
  const overrides = (imp.campaign_type_overrides ?? {}) as Record<string, string>;

  // Comparison aggregate
  const comparison = await buildComparison(
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

  const payload: PerfDashboardData = {
    importId: id,
    clientId: imp.client_id,
    channel: "meta",
    periodFrom: imp.period_from,
    periodTo: imp.period_to,
    currency: imp.currency,
    current: aggregateKpis(rows),
    comparison: {
      mode: comparison.mode,
      label: comparison.label,
      periodFrom: comparison.periodFrom,
      periodTo: comparison.periodTo,
      aggregate: comparison.aggregate,
    },
    timeSeries: aggregateTimeSeries(rows),
    topByCampaignSpend: topCampaigns(rows, "spend"),
    topByCampaignRoas: topCampaigns(rows, "roas"),
    objectiveMix: objectiveMix(rows),
    creativeTypeMix: aggregateCreativeTypeMix(rows),
    creativeCountByType: aggregateCreativeCountByType(rows),
    campaignTypes: aggregateCampaignTypes(rows, overrides),
    campaignTypeAssignments: buildCampaignTypeAssignments(rows, overrides),
  };

  return NextResponse.json(payload);
}
