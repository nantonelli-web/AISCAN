import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  startGoogleAdsScan,
  cleanAdvertiserDomain,
} from "@/lib/apify/google-ads-service";
import {
  BATCH_MAX,
  checkDailyCostCap,
  chargeBatchCredits,
  filterEligibleBrands,
  refundOneBatchCredit,
  CONCURRENCY_CAP_PER_WORKSPACE,
  type SkipReason,
} from "@/lib/apify/batch-safety";
import { logger } from "@/lib/logger";

/**
 * POST /api/apify/scan-google/batch { competitor_ids: [...], max_items? }
 *
 * Lancia in parallelo uno scan Google Ads su una lista di brand
 * (max 10 per chiamata). Restituisce un batch_id e un riepilogo
 * di quali job sono partiti vs quali sono stati skippati (e perche').
 *
 * SAFETY CONTROLS (importanti per evitare di bruciare crediti in
 * loop o per errori utente):
 *
 * 1. Batch size cap: max 10 brand per chiamata. Oltre 10 → 400.
 * 2. Daily cost cap workspace: se sum(cost_cu) negli ultimi 24h supera
 *    APIFY_DAILY_COST_CAP_USD (default $50), refusa con 429. Cap
 *    soft: si puo' alzare via env var.
 * 3. Per-brand cooldown 6h: se un brand e' stato scansionato
 *    (succeeded/partial) negli ultimi 6h, lo SKIPpiamo con reason
 *    "recent_scan". Non blocca tutto il batch.
 * 4. Concurrency cap: max 8 scan Google contemporanei per workspace
 *    (incluse quelle gia' running). Se ce ne sono gia' troppe, il
 *    batch parte solo con quelli che entrano nel cap.
 * 5. Credits: charge precoce 2*N crediti. Se non bastano → 402.
 *    I crediti dei brand skippati vengono rifondati subito.
 * 6. Niente auto-retry: se uno scan fallisce, l'utente vede l'errore
 *    e decide. Mai retry automatico.
 */
export const maxDuration = 60;

const schema = z.object({
  competitor_ids: z.array(z.string().uuid()).min(1).max(BATCH_MAX),
  max_items: z.number().int().min(1).max(1000).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: `Invalid payload (max ${BATCH_MAX} competitor_ids per batch)`,
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }
  if (parsed.data.competitor_ids.length > BATCH_MAX) {
    return NextResponse.json(
      { error: `Batch troppo grande: max ${BATCH_MAX} brand per richiesta` },
      { status: 400 },
    );
  }

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json(
      {
        error:
          "APIFY_API_TOKEN non configurato. Aggiungilo nelle Environment Variables di Vercel e ridepiega.",
      },
      { status: 503 },
    );
  }
  {
    const missing: string[] = [];
    if (!process.env.APIFY_WEBHOOK_SECRET) missing.push("APIFY_WEBHOOK_SECRET");
    if (!process.env.NEXT_PUBLIC_APP_URL) missing.push("NEXT_PUBLIC_APP_URL");
    if (missing.length > 0) {
      logger.error(
        `webhook env vars mancanti su questa function: ${missing.join(", ")}`,
        {
          channel: "scan-google/batch",
          event: "batch.config_missing",
          userId: user.id,
          missing,
        },
      );
      return NextResponse.json(
        {
          error: `Webhook config mancante: ${missing.join(", ")}. Verifica che siano settate in Vercel per l'ambiente corrente (Production e Preview) e fai un redeploy.`,
          missing,
        },
        { status: 503 },
      );
    }
  }

  const admin = createAdminClient();

  // 1. Workspace ownership: get the user's workspace and ALL competitors
  //    in one shot, scoped to that workspace.
  const { data: userRow } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }
  const workspaceId = userRow.workspace_id as string;

  const { data: competitors } = await admin
    .from("mait_competitors")
    .select(
      "id, workspace_id, page_name, google_advertiser_id, google_domain, country",
    )
    .in("id", parsed.data.competitor_ids)
    .eq("workspace_id", workspaceId);

  type Comp = {
    id: string;
    workspace_id: string;
    page_name: string | null;
    google_advertiser_id: string | null;
    google_domain: string | null;
    country: string | null;
  };
  const compList = (competitors ?? []) as Comp[];

  if (compList.length === 0) {
    return NextResponse.json(
      { error: "Nessun brand valido trovato nel workspace" },
      { status: 404 },
    );
  }

  // 2. SAFETY: daily cost cap del workspace (helper centralizzato).
  const costCheck = await checkDailyCostCap(workspaceId, admin);
  if (!costCheck.ok) {
    return NextResponse.json(
      {
        error: `Hai raggiunto il limite di spesa giornaliero ($${costCheck.cap.toFixed(2)}). Spesa nelle ultime 24h: $${costCheck.spent.toFixed(2)}. Riprova domani o alza APIFY_DAILY_COST_CAP_USD.`,
        daily_cap_usd: costCheck.cap,
        daily_spent_usd: costCheck.spent,
      },
      { status: 429 },
    );
  }
  logger.debug(
    `daily cost check OK: spent=$${costCheck.spent.toFixed(3)}/${costCheck.cap}`,
    {
      channel: "scan-google/batch",
      event: "batch.cost_check_ok",
      workspaceId,
      userId: user.id,
    },
  );

  // 3+4. SAFETY: concurrency cap + cooldown via helper unificato.
  // Filtra eligible vs skipped. hasChannelConfig: brand ha
  // google_advertiser_id O google_domain.
  const filterResult = await filterEligibleBrands({
    brands: compList,
    workspaceId,
    source: "google",
    admin,
    hasChannelConfig: (c) =>
      !!c.google_advertiser_id || !!c.google_domain,
  });
  const headroom = filterResult.headroom;
  if (headroom === 0) {
    return NextResponse.json(
      {
        error: `Hai gia' ${CONCURRENCY_CAP_PER_WORKSPACE} scan Google in corso (max per workspace). Aspetta che ne finisca qualcuno.`,
      },
      { status: 429 },
    );
  }
  const skipped: SkipReason[] = filterResult.skipped;
  const toLaunch = filterResult.eligible;

  if (toLaunch.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        batch_id: null,
        started: [],
        skipped,
        message: "Nessuno scan lanciato (tutti i brand sono stati filtrati).",
      },
      { status: 200 },
    );
  }

  // 5. Charge atomico di N crediti (helper centralizzato). Rollback
  //    automatico se mid-batch i crediti non bastano. Refund per brand
  //    individuale piu' avanti in caso di start_failed.
  const chargeResult = await chargeBatchCredits(
    user.id,
    "google",
    toLaunch.length,
    `Batch Google Ads: ${toLaunch.length} brand`,
  );
  if (!chargeResult.ok) {
    return NextResponse.json(
      {
        error: "Insufficient credits",
        balance: chargeResult.balance,
        charged_before_rollback: chargeResult.chargedBeforeRollback,
        batch_size: toLaunch.length,
      },
      { status: 402 },
    );
  }

  const batchId = randomUUID();
  const started: Array<{
    competitor_id: string;
    job_id: string;
    run_id: string;
    page_name: string | null;
  }> = [];
  let webhooksConfiguredOnSomeRun = false;

  // 6. Per-brand kick off. Errori isolati: un fallimento su un brand
  //    non rompe il batch, refundiamo solo quel credito.
  for (const c of toLaunch) {
    let cleanedDomain = c.google_domain;
    if (cleanedDomain) {
      const cleaned = cleanAdvertiserDomain(cleanedDomain);
      if (cleaned && cleaned !== cleanedDomain) {
        cleanedDomain = cleaned;
        await admin
          .from("mait_competitors")
          .update({ google_domain: cleaned })
          .eq("id", c.id);
      }
    }

    const scanOptions = {
      advertiserId: c.google_advertiser_id ?? null,
      advertiserDomain: cleanedDomain ?? null,
      advertiserName:
        !c.google_advertiser_id && !cleanedDomain ? c.page_name : null,
      dateFrom: parsed.data.date_from ?? null,
      dateTo: parsed.data.date_to ?? null,
      maxResults: parsed.data.max_items ?? 500,
      country: c.country ?? null,
      competitorPageName: c.page_name ?? null,
    };

    // Insert job row
    const { data: job, error: jobErr } = await admin
      .from("mait_scrape_jobs")
      .insert({
        workspace_id: workspaceId,
        competitor_id: c.id,
        status: "running",
        source: "google",
        date_from: parsed.data.date_from ?? null,
        date_to: parsed.data.date_to ?? null,
        created_by: user.id,
        batch_id: batchId,
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      skipped.push({
        competitor_id: c.id,
        page_name: c.page_name,
        reason: "start_failed",
        detail: jobErr?.message ?? "Job insert failed",
      });
      await refundOneBatchCredit(
        user.id,
        "google",
        `Batch Google: insert failed for ${c.page_name}`,
      );
      continue;
    }

    try {
      const result = await startGoogleAdsScan({
        advertiserId: scanOptions.advertiserId ?? undefined,
        advertiserDomain: scanOptions.advertiserDomain ?? undefined,
        advertiserName: scanOptions.advertiserName ?? undefined,
        dateFrom: scanOptions.dateFrom ?? undefined,
        dateTo: scanOptions.dateTo ?? undefined,
        maxResults: scanOptions.maxResults,
        country: scanOptions.country ?? undefined,
        workspaceId,
      });

      await admin
        .from("mait_scrape_jobs")
        .update({
          apify_run_id: result.runId,
          dataset_id: result.datasetId,
          scan_options: {
            ...scanOptions,
            urlRegionList: result.urlRegionList,
            actorId: result.actorId,
          },
        })
        .eq("id", job.id);

      if (result.webhooksConfigured) webhooksConfiguredOnSomeRun = true;
      started.push({
        competitor_id: c.id,
        job_id: job.id,
        run_id: result.runId,
        page_name: c.page_name,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Start failed";
      logger.error(
        `start failed: ${message}`,
        {
          channel: "scan-google/batch",
          event: "scan.start_failed",
          workspaceId,
          userId: user.id,
          competitorId: c.id,
          jobId: job.id,
        },
        e,
      );
      await admin
        .from("mait_scrape_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: message,
        })
        .eq("id", job.id);
      await refundOneBatchCredit(
        user.id,
        "google",
        `Batch Google: start failed for ${c.page_name}`,
      );
      skipped.push({
        competitor_id: c.id,
        page_name: c.page_name,
        reason: "start_failed",
        detail: message,
      });
    }
  }

  logger.info(
    `batch done: started=${started.length} skipped=${skipped.length}`,
    {
      channel: "scan-google/batch",
      event: "batch.completed",
      workspaceId,
      userId: user.id,
      batchId,
    },
  );

  return NextResponse.json({
    ok: true,
    batch_id: batchId,
    started,
    skipped,
    webhooks_configured: webhooksConfiguredOnSomeRun,
    summary: {
      requested: parsed.data.competitor_ids.length,
      eligible: toLaunch.length,
      launched: started.length,
      skipped: skipped.length,
      credits_charged: started.length * 2,
    },
  });
}

/**
 * GET /api/apify/scan-google/batch?batch_id=<uuid>
 *
 * Status di un batch: per ogni job conta status; ritorna riepilogo
 * per il polling lato client.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const batchId = url.searchParams.get("batch_id");
  if (!batchId) {
    return NextResponse.json({ error: "Missing batch_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("mait_scrape_jobs")
    .select(
      "id, status, competitor_id, records_count, error, started_at, completed_at",
    )
    .eq("batch_id", batchId);

  const jobs = data ?? [];
  const counts = {
    total: jobs.length,
    running: jobs.filter((j) => j.status === "running").length,
    succeeded: jobs.filter((j) => j.status === "succeeded").length,
    partial: jobs.filter((j) => j.status === "partial").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };
  const totalRecords = jobs.reduce(
    (s, j) => s + (j.records_count ?? 0),
    0,
  );
  const terminal = counts.running === 0;

  return NextResponse.json({
    batch_id: batchId,
    counts,
    total_records: totalRecords,
    terminal,
    jobs,
  });
}
