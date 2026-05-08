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
import type { PerfDiagnostic } from "@/types/perf";

export const maxDuration = 60;

const postSchema = z.object({
  client_id: z.string().uuid(),
  channel: z.enum(["meta", "google", "tiktok", "snapchat"]),
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

  if (parsed.data.channel !== "meta") {
    return NextResponse.json(
      {
        error:
          "Channel not supported yet. Only 'meta' is available in this release.",
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
    console.error(
      `[perf/imports] download failed: ${downloadRes.error?.message}`,
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

  // 2. Parse + validate
  const parsedFile = await parseMetaExport(buffer, parsed.data.file_name);
  const validatorDiagnostics = validateMetaParse(parsedFile);
  const diagnostics: PerfDiagnostic[] = [
    ...parsedFile.diagnostics,
    ...validatorDiagnostics,
  ];
  const hasErrors = diagnostics.some((d) => d.severity === "error");
  const summary = summariseMetaRows(parsedFile.rows);
  const periodFrom =
    parsed.data.period_from_override ?? parsedFile.periodFrom;
  const periodTo = parsed.data.period_to_override ?? parsedFile.periodTo;

  // If errors, persist a "failed" import header (so the user sees
  // it in their list with diagnostics) but do NOT write rows.
  if (hasErrors || !periodFrom || !periodTo) {
    const { data: failedRow } = await admin
      .from("mait_perf_imports")
      .insert({
        workspace_id: profile.workspace_id,
        client_id: parsed.data.client_id,
        channel: parsed.data.channel,
        period_from: periodFrom ?? "1970-01-01",
        period_to: periodTo ?? "1970-01-01",
        file_path: parsed.data.file_path,
        file_format: parsed.data.file_format,
        file_name: parsed.data.file_name,
        status: "failed",
        currency: parsedFile.currency,
        row_count: 0,
        total_spend: 0,
        total_impressions: 0,
        diagnostics,
        raw_meta: { detectedColumns: parsedFile.detectedColumns },
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
        currency: parsedFile.currency,
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

  // 4. Insert the import header
  const { data: imp, error: impErr } = await admin
    .from("mait_perf_imports")
    .insert({
      workspace_id: profile.workspace_id,
      client_id: parsed.data.client_id,
      channel: parsed.data.channel,
      period_from: periodFrom,
      period_to: periodTo,
      file_path: parsed.data.file_path,
      file_format: parsed.data.file_format,
      file_name: parsed.data.file_name,
      status: "validated",
      currency: parsedFile.currency,
      row_count: summary.rowCount,
      total_spend: summary.totalSpend,
      total_impressions: summary.totalImpressions,
      diagnostics,
      raw_meta: { detectedColumns: parsedFile.detectedColumns },
      created_by: user.id,
      validated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (impErr || !imp) {
    console.error("[perf/imports] insert header failed:", impErr);
    return NextResponse.json(
      { error: `Insert failed: ${impErr?.message}` },
      { status: 500 },
    );
  }

  // 5. Bulk-insert rows in chunks
  const CHUNK = 500;
  const rowsForInsert = parsedFile.rows.map((r) => ({
    workspace_id: profile.workspace_id,
    import_id: imp.id,
    client_id: parsed.data.client_id,
    date: r.date,
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
  // Detect if migration 0041 columns are present. If the first
  // insert fails with PGRST204 schema-cache miss for creative_*,
  // we strip those fields and retry without them — so an upload
  // does not block when the DB hasn't been migrated yet. The
  // header diagnostics get a warning so the user knows the data
  // is partial.
  let stripCreativeFields = false;
  let migrationWarningPushed = false;
  for (let i = 0; i < rowsForInsert.length; i += CHUNK) {
    const slice = rowsForInsert.slice(i, i + CHUNK);
    const payload = stripCreativeFields
      ? slice.map(
          ({ creative_type: _ct, creative_count: _cc, ...rest }) => rest,
        )
      : slice;
    const { error } = await admin.from("mait_perf_meta_rows").insert(payload);
    if (error) {
      const msg = error.message || "";
      const isMigrationMissing =
        !stripCreativeFields &&
        /creative_(type|count)/.test(msg) &&
        /(schema cache|column|does not exist)/i.test(msg);
      if (isMigrationMissing) {
        console.warn(
          "[perf/imports] migration 0041 not applied — retrying without creative_type/creative_count",
        );
        stripCreativeFields = true;
        if (!migrationWarningPushed) {
          diagnostics.push({
            severity: "warning",
            code: "migration_pending",
            message:
              "Migration 0041 non applicata sul DB: creative_type / creative_count non salvati. Applica la SQL nel Supabase SQL Editor e ricarica il file per vederli.",
          });
          migrationWarningPushed = true;
        }
        i -= CHUNK; // re-process this chunk without the fields
        continue;
      }
      console.error("[perf/imports] insert rows failed:", error);
      // Best-effort: roll back header
      await admin.from("mait_perf_imports").delete().eq("id", imp.id);
      return NextResponse.json(
        { error: `Row insert failed: ${error.message}` },
        { status: 500 },
      );
    }
  }
  if (migrationWarningPushed) {
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
    currency: parsedFile.currency,
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
  const channel = url.searchParams.get("channel");

  let q = supabase
    .from("mait_perf_imports")
    .select(
      "id, workspace_id, client_id, channel, period_from, period_to, status, currency, row_count, total_spend, total_impressions, file_name, created_at",
    )
    .eq("workspace_id", profile.workspace_id)
    .order("period_from", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId);
  if (channel) q = q.eq("channel", channel);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ imports: data ?? [] });
}
