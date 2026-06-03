import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { parseMetaExport } from "@/lib/perf/meta-parser";
import {
  validateMetaParse,
  summariseMetaRows,
} from "@/lib/perf/meta-validator";
import { parseSnapchatExport } from "@/lib/perf/snapchat-parser";
import type { PerfDiagnostic } from "@/types/perf";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

const postSchema = z.object({
  client_id: z.string().uuid(),
  /** Brand a cui appartengono questi dati performance (un
   *  mait_competitors.id). Optional per supportare upload legacy
   *  pre-migration 0043. */
  brand_id: z.string().uuid().optional().nullable(),
  channel: z.enum(["meta", "google", "tiktok", "snapchat"]),
  /** Currency manuale, usato solo per channel=snapchat dove
   *  l'export non porta il codice currency nel header. */
  currency_override: z.string().min(3).max(8).optional().nullable(),
  file_path: z.string().min(1),
  file_name: z.string().min(1).max(300),
  file_format: z.enum(["csv", "xlsx"]),
  /** "append" mantiene gli upload precedenti; "replace" elimina
   *  gli import overlapping al periodo nuovo. */
  mode: z.enum(["append", "replace"]).default("append"),
  /** Se l'utente vuole forzare un period_from/period_to specifico
   *  (override della rilevazione automatica dal file). */
  period_from_override: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  period_to_override: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * POST /api/perf/imports
 * Body: see postSchema. Server downloads the previously-uploaded
 * file from Supabase Storage, parses it, runs validators, persists
 * rows into mait_perf_meta_rows (channel="meta" MVP), updates the
 * mait_perf_imports header with diagnostics + summary, and returns
 * { import_id, diagnostics, summary }.
 *
 * Channels other than "meta" return 400 in MVP.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { profile } = await getSessionUser();
  if (!profile.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (
    parsed.data.channel !== "meta" &&
    parsed.data.channel !== "snapchat"
  ) {
    return NextResponse.json(
      {
        error:
          "Channel not supported yet. Available: 'meta', 'snapchat'.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // 1. Download the file from Supabase Storage
  const downloadRes = await admin.storage
    .from("performance-imports")
    .download(parsed.data.file_path);
  if (downloadRes.error || !downloadRes.data) {
    logger.error(
      `download failed: ${downloadRes.error?.message}`,
      {
        channel: "perf/imports",
        event: "import.download_failed",
        workspaceId: profile.workspace_id,
        userId: user.id,
      },
      downloadRes.error,
    );
    return NextResponse.json(
      {
        error: `Could not retrieve uploaded file: ${downloadRes.error?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }
  const arrayBuffer = await downloadRes.data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 2. Parse + validate (branching su channel)
  const isSnap = parsed.data.channel === "snapchat";
  let metaParsed:
    | Awaited<ReturnType<typeof parseMetaExport>>
    | null = null;
  let snapParsed:
    | Awaited<ReturnType<typeof parseSnapchatExport>>
    | null = null;
  const diagnostics: PerfDiagnostic[] = [];
  if (isSnap) {
    snapParsed = await parseSnapchatExport(buffer, parsed.data.file_name);
    diagnostics.push(...snapParsed.diagnostics);
  } else {
    metaParsed = await parseMetaExport(buffer, parsed.data.file_name);
    diagnostics.push(
      ...metaParsed.diagnostics,
      ...validateMetaParse(metaParsed),
    );
  }
  const hasErrors = diagnostics.some((d) => d.severity === "error");
  const summary = isSnap
    ? {
        rowCount: snapParsed!.rows.length,
        totalSpend: snapParsed!.rows.reduce(
          (s, r) => s + (r.amount_spent || 0),
          0,
        ),
        totalImpressions: snapParsed!.rows.reduce(
          (s, r) => s + (r.paid_impressions || 0),
          0,
        ),
        uniqueCampaigns: new Set(
          snapParsed!.rows.map((r) => r.campaign_name).filter(Boolean),
        ).size,
      }
    : summariseMetaRows(metaParsed!.rows);
  const detectedPeriodFrom = isSnap
    ? snapParsed!.periodFrom
    : metaParsed!.periodFrom;
  const detectedPeriodTo = isSnap
    ? snapParsed!.periodTo
    : metaParsed!.periodTo;
  const detectedColumns = isSnap
    ? snapParsed!.detectedColumns
    : metaParsed!.detectedColumns;
  // Currency: Meta la deduce dall'header (es. "Amount spent (AED)"),
  // Snapchat richiede l'override manuale dell'utente.
  const detectedCurrency = isSnap
    ? (parsed.data.currency_override ?? null)
    : metaParsed!.currency;
  const periodFrom = parsed.data.period_from_override ?? detectedPeriodFrom;
  const periodTo = parsed.data.period_to_override ?? detectedPeriodTo;

  // If errors, persist a "failed" import header (so the user sees
  // it in their list with diagnostics) but do NOT write rows.
  if (hasErrors || !periodFrom || !periodTo) {
    const { data: failedRow } = await admin
      .from("mait_perf_imports")
      .insert({
        workspace_id: profile.workspace_id,
        client_id: parsed.data.client_id,
        brand_id: parsed.data.brand_id ?? null,
        channel: parsed.data.channel,
        period_from: periodFrom ?? "1970-01-01",
        period_to: periodTo ?? "1970-01-01",
        file_path: parsed.data.file_path,
        file_format: parsed.data.file_format,
        file_name: parsed.data.file_name,
        status: "failed",
        currency: detectedCurrency,
        row_count: 0,
        total_spend: 0,
        total_impressions: 0,
        diagnostics,
        raw_meta: { detectedColumns: detectedColumns },
        created_by: user.id,
      })
      .select("id")
      .single();
    return NextResponse.json(
      {
        ok: false,
        import_id: failedRow?.id ?? null,
        diagnostics,
        summary,
        period_from: periodFrom,
        period_to: periodTo,
        currency: detectedCurrency,
      },
      { status: 422 },
    );
  }

  // 3. Replace mode: soft-delete overlapping imports for same
  // client+channel. Cascade removes their rows. Skip if append.
  if (parsed.data.mode === "replace") {
    const { data: overlap } = await admin
      .from("mait_perf_imports")
      .select("id")
      .eq("workspace_id", profile.workspace_id)
      .eq("client_id", parsed.data.client_id)
      .eq("channel", parsed.data.channel)
      .eq("status", "validated")
      .or(
        `and(period_from.lte.${periodTo},period_to.gte.${periodFrom})`,
      );
    if (overlap && overlap.length > 0) {
      const ids = overlap.map((r) => r.id);
      await admin.from("mait_perf_imports").delete().in("id", ids);
    }
  }

  // 4. Insert the import header. Try with brand_id; fall back
  // without it if migration 0043 isn't applied yet.
  const baseHeader = {
    workspace_id: profile.workspace_id,
    client_id: parsed.data.client_id,
    channel: parsed.data.channel,
    period_from: periodFrom,
    period_to: periodTo,
    file_path: parsed.data.file_path,
    file_format: parsed.data.file_format,
    file_name: parsed.data.file_name,
    status: "validated",
    currency: detectedCurrency,
    row_count: summary.rowCount,
    total_spend: summary.totalSpend,
    total_impressions: summary.totalImpressions,
    diagnostics,
    raw_meta: { detectedColumns: detectedColumns },
    created_by: user.id,
    validated_at: new Date().toISOString(),
  };
  let imp: { id: string } | null = null;
  let impErr: { message: string } | null = null;
  {
    const first = await admin
      .from("mait_perf_imports")
      .insert({ ...baseHeader, brand_id: parsed.data.brand_id ?? null })
      .select("id")
      .single();
    if (first.data) {
      imp = first.data;
    } else if (
      first.error &&
      /\bbrand_id\b/.test(first.error.message ?? "") &&
      /(schema cache|column|does not exist)/i.test(first.error.message ?? "")
    ) {
      logger.warn("migration 0043 not applied — retrying without brand_id", {
        channel: "perf/imports",
        event: "import.migration_pending",
        workspaceId: profile.workspace_id,
        userId: user.id,
        migration: "0043",
      });
      diagnostics.push({
        severity: "warning",
        code: "migration_pending",
        message:
          "Migration 0043 non applicata: l'import non e' associato a un brand specifico. Applica la SQL nel Supabase SQL Editor per attivare la separazione per brand.",
      });
      const second = await admin
        .from("mait_perf_imports")
        .insert({ ...baseHeader, diagnostics })
        .select("id")
        .single();
      imp = second.data ?? null;
      impErr = second.error;
    } else {
      impErr = first.error;
    }
  }
  if (impErr || !imp) {
    logger.error(
      "insert header failed",
      {
        channel: "perf/imports",
        event: "import.header_insert_failed",
        workspaceId: profile.workspace_id,
        userId: user.id,
      },
      impErr,
    );
    return NextResponse.json(
      { error: `Insert failed: ${impErr?.message}` },
      { status: 500 },
    );
  }

  // 5. Bulk-insert rows in chunks (target table dipende dal channel)
  const CHUNK = 500;
  const targetTable = isSnap
    ? "mait_perf_snapchat_rows"
    : "mait_perf_meta_rows";
  const rowsForInsert = isSnap
    ? snapParsed!.rows.map((r) => ({
        workspace_id: profile.workspace_id,
        import_id: imp.id,
        client_id: parsed.data.client_id,
        date: r.date,
        week: r.week,
        campaign_name: r.campaign_name,
        campaign_id: r.campaign_id,
        ad_set_name: r.ad_set_name,
        ad_set_id: r.ad_set_id,
        ad_name: r.ad_name,
        ad_id: r.ad_id,
        creative_id: r.creative_id,
        amount_spent: r.amount_spent,
        paid_impressions: r.paid_impressions,
        clicks: r.clicks,
        landing_page_views: r.landing_page_views,
        adds_to_cart: r.adds_to_cart,
        purchases: r.purchases,
        purchase_value: r.purchase_value,
        creative_type: r.creative_type,
        creative_count: r.creative_count,
        raw_data: r.raw_data,
      }))
    : metaParsed!.rows.map((r) => ({
        workspace_id: profile.workspace_id,
        import_id: imp.id,
        client_id: parsed.data.client_id,
        date: r.date,
        week: r.week,
        campaign_name: r.campaign_name,
        campaign_id: r.campaign_id,
        ad_set_name: r.ad_set_name,
        ad_set_id: r.ad_set_id,
        ad_name: r.ad_name,
        ad_id: r.ad_id,
        objective: r.objective,
        buying_type: r.buying_type,
        amount_spent: r.amount_spent,
        impressions: r.impressions,
        reach: r.reach,
        frequency: r.frequency,
        clicks: r.clicks,
        link_clicks: r.link_clicks,
        unique_clicks: r.unique_clicks,
        unique_link_clicks: r.unique_link_clicks,
        ctr: r.ctr,
        link_ctr: r.link_ctr,
        cpm: r.cpm,
        cpc: r.cpc,
        link_cpc: r.link_cpc,
        results: r.results,
        result_indicator: r.result_indicator,
        cost_per_result: r.cost_per_result,
        purchase_roas: r.purchase_roas,
        purchases: r.purchases,
        purchase_value: r.purchase_value,
        quality_ranking: r.quality_ranking,
        engagement_rate_ranking: r.engagement_rate_ranking,
        conversion_rate_ranking: r.conversion_rate_ranking,
        creative_type: r.creative_type,
        creative_count: r.creative_count,
        raw_data: r.raw_data,
      }));
  // Detect if optional columns are present. If the first insert
  // fails with PGRST204 schema-cache miss for creative_* (mig 0041)
  // or week (mig 0042), strip those fields and retry. Diagnostics
  // get a warning so the user knows what migration to run.
  let stripCreativeFields = false;
  let stripWeekField = false;
  let warning0041Pushed = false;
  let warning0042Pushed = false;
  for (let i = 0; i < rowsForInsert.length; i += CHUNK) {
    const slice = rowsForInsert.slice(i, i + CHUNK);
    const payload = slice.map((row) => {
      const out = { ...row } as Record<string, unknown>;
      if (stripCreativeFields) {
        delete out.creative_type;
        delete out.creative_count;
      }
      if (stripWeekField) {
        delete out.week;
      }
      return out;
    });
    const { error } = await admin.from(targetTable).insert(payload);
    if (error) {
      const msg = error.message || "";
      const has = (re: RegExp) => re.test(msg);
      const schemaCacheMiss = has(/(schema cache|column|does not exist)/i);
      const isCreativeMissing =
        !stripCreativeFields &&
        schemaCacheMiss &&
        has(/creative_(type|count)/);
      const isWeekMissing =
        !stripWeekField && schemaCacheMiss && /\bweek\b/.test(msg);
      if (isCreativeMissing) {
        logger.warn("migration 0041 not applied — retry without creative_*", {
          channel: "perf/imports",
          event: "import.migration_pending",
          workspaceId: profile.workspace_id,
          userId: user.id,
          migration: "0041",
        });
        stripCreativeFields = true;
        if (!warning0041Pushed) {
          diagnostics.push({
            severity: "warning",
            code: "migration_pending",
            message:
              "Migration 0041 non applicata sul DB: creative_type / creative_count non salvati. Applica la SQL nel Supabase SQL Editor e ricarica il file per vederli.",
          });
          warning0041Pushed = true;
        }
        i -= CHUNK;
        continue;
      }
      if (isWeekMissing) {
        logger.warn("migration 0042 not applied — retry without week", {
          channel: "perf/imports",
          event: "import.migration_pending",
          workspaceId: profile.workspace_id,
          userId: user.id,
          migration: "0042",
        });
        stripWeekField = true;
        if (!warning0042Pushed) {
          diagnostics.push({
            severity: "warning",
            code: "migration_pending",
            message:
              "Migration 0042 non applicata sul DB: column 'week' non salvata. Il confronto week-vs-week leggera' Week da raw_data in fly. Applica la SQL per filter veloci.",
          });
          warning0042Pushed = true;
        }
        i -= CHUNK;
        continue;
      }
      logger.error(
        "insert rows failed",
        {
          channel: "perf/imports",
          event: "import.rows_insert_failed",
          workspaceId: profile.workspace_id,
          userId: user.id,
          importId: imp.id,
        },
        error,
      );
      // Best-effort: roll back header
      await admin.from("mait_perf_imports").delete().eq("id", imp.id);
      return NextResponse.json(
        { error: `Row insert failed: ${error.message}` },
        { status: 500 },
      );
    }
  }
  if (warning0041Pushed || warning0042Pushed) {
    await admin
      .from("mait_perf_imports")
      .update({ diagnostics })
      .eq("id", imp.id);
  }

  return NextResponse.json({
    ok: true,
    import_id: imp.id,
    diagnostics,
    summary,
    period_from: periodFrom,
    period_to: periodTo,
    currency: detectedCurrency,
  });
}

/**
 * GET /api/perf/imports
 * Query: client_id?, channel?
 * Returns list of imports for the current workspace.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { profile } = await getSessionUser();
  if (!profile.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  const brandId = url.searchParams.get("brand_id");
  const channel = url.searchParams.get("channel");

  // Try with brand_id in the SELECT first; fall back to the
  // legacy schema if the migration isn't applied yet.
  const fullCols =
    "id, workspace_id, client_id, brand_id, channel, period_from, period_to, status, currency, row_count, total_spend, total_impressions, file_name, created_at";
  const legacyCols =
    "id, workspace_id, client_id, channel, period_from, period_to, status, currency, row_count, total_spend, total_impressions, file_name, created_at";

  const runFull = async () => {
    let q = supabase
      .from("mait_perf_imports")
      .select(fullCols as never)
      .eq("workspace_id", profile.workspace_id!)
      .order("period_from", { ascending: false });
    if (clientId) q = q.eq("client_id", clientId);
    if (brandId) q = q.eq("brand_id", brandId);
    if (channel) q = q.eq("channel", channel);
    return q;
  };
  const runLegacy = async () => {
    let q = supabase
      .from("mait_perf_imports")
      .select(legacyCols as never)
      .eq("workspace_id", profile.workspace_id!)
      .order("period_from", { ascending: false });
    if (clientId) q = q.eq("client_id", clientId);
    if (channel) q = q.eq("channel", channel);
    return q;
  };

  let result: { data: unknown; error: { message: string } | null } =
    (await runFull()) as { data: unknown; error: { message: string } | null };
  if (
    result.error &&
    /\bbrand_id\b/.test(result.error.message ?? "")
  ) {
    result = (await runLegacy()) as {
      data: unknown;
      error: { message: string } | null;
    };
  }
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }
  return NextResponse.json({ imports: result.data ?? [] });
}
