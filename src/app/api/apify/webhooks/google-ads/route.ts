import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  finalizeGoogleAdsScan,
  type FinalizeScanArgs,
} from "@/lib/apify/google-ads-service";
import { refundCredits } from "@/lib/credits/consume";

// Apify chiama questo endpoint quando un run Google Ads finisce
// (SUCCEEDED / ABORTED / FAILED / TIMED-OUT). Il payload e' quello
// definito nel payloadTemplate di startGoogleAdsScan().
//
// Autenticazione: header `x-aiscan-secret` deve matchare la env var
// `APIFY_WEBHOOK_SECRET`. Non usiamo cookies — questa chiamata viene
// da Apify, non da un utente.
//
// Idempotenza: il primo webhook setta mait_scrape_jobs.webhook_received_at.
// Webhook duplicati (retry Apify) trovano la colonna gia' valorizzata
// e ritornano 200 senza riprocessare.
//
// Vercel maxDuration 120s: il webhook fa fetch dataset (puo' essere
// grosso: 50k items) + normalize + upsert. Stiamo conservativi.
export const maxDuration = 120;

interface WebhookPayload {
  // Default Apify payload (webhook persistente senza payloadTemplate)
  eventType?: string;
  eventData?: {
    actorId?: string;
    actorRunId?: string;
    actorTaskId?: string | null;
  };
  resource?: {
    id?: string;
    actId?: string;
    status?: string;
    defaultDatasetId?: string;
  };
  // Vecchio formato custom (template), tenuto per retro-compat:
  runId?: string;
  status?: string;
  datasetId?: string;
  actorId?: string;
}

/**
 * Estrae i campi runId/status/datasetId/actorId da entrambi i
 * formati Apify (default e custom-template). Quando il template
 * non viene risolto, i campi top-level arrivano come stringa
 * letterale ("{{resource.id}}") che non e' valida — quindi
 * preferiamo SEMPRE i path strutturati del default quando presenti.
 */
function extractWebhookFields(p: WebhookPayload): {
  runId: string | null;
  status: string | null;
  datasetId: string | null;
  actorId: string | null;
} {
  const isTemplateLiteral = (s: string | undefined): boolean =>
    !!s && s.startsWith("{{") && s.endsWith("}}");
  const pickRunId = (() => {
    if (p.eventData?.actorRunId) return p.eventData.actorRunId;
    if (p.resource?.id) return p.resource.id;
    if (p.runId && !isTemplateLiteral(p.runId)) return p.runId;
    return null;
  })();
  const pickStatus = (() => {
    if (p.resource?.status) return p.resource.status;
    if (p.status && !isTemplateLiteral(p.status)) return p.status;
    return null;
  })();
  const pickDatasetId = (() => {
    if (p.resource?.defaultDatasetId) return p.resource.defaultDatasetId;
    if (p.datasetId && !isTemplateLiteral(p.datasetId)) return p.datasetId;
    return null;
  })();
  const pickActorId = (() => {
    if (p.eventData?.actorId) return p.eventData.actorId;
    if (p.resource?.actId) return p.resource.actId;
    if (p.actorId && !isTemplateLiteral(p.actorId)) return p.actorId;
    return null;
  })();
  return {
    runId: pickRunId,
    status: pickStatus,
    datasetId: pickDatasetId,
    actorId: pickActorId,
  };
}

interface JobRow {
  id: string;
  workspace_id: string;
  competitor_id: string | null;
  status: string;
  webhook_received_at: string | null;
  scan_options: Record<string, unknown> | null;
  dataset_id: string | null;
  created_by?: string | null;
}

export async function POST(req: Request) {
  // 1. Auth: verifica share secret
  const secret = req.headers.get("x-aiscan-secret");
  const expected = process.env.APIFY_WEBHOOK_SECRET;
  if (!expected) {
    console.error(
      "[Google Ads webhook] APIFY_WEBHOOK_SECRET non settata, rifiuto",
    );
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }
  if (secret !== expected) {
    console.warn("[Google Ads webhook] secret mismatch from", req.headers.get("user-agent"));
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse payload (accetta sia default Apify che custom-template)
  const payload = (await req.json().catch(() => null)) as WebhookPayload | null;
  if (!payload) {
    console.error("[Google Ads webhook] empty payload");
    return NextResponse.json({ error: "Empty payload" }, { status: 400 });
  }
  const fields = extractWebhookFields(payload);
  if (!fields.runId || !fields.status) {
    console.error(
      "[Google Ads webhook] missing runId/status after extraction. Payload keys:",
      Object.keys(payload),
      "Extracted:",
      fields,
    );
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  console.log(
    `[Google Ads webhook] received: runId=${fields.runId} status=${fields.status} eventType=${payload.eventType}`,
  );

  // 3. Find the job by apify_run_id (admin client, RLS bypass)
  const admin = createAdminClient();
  const { data: jobData, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .select(
      "id, workspace_id, competitor_id, status, webhook_received_at, scan_options, dataset_id, created_by",
    )
    .eq("apify_run_id", fields.runId)
    .eq("source", "google")
    .maybeSingle();

  if (jobErr) {
    console.error("[Google Ads webhook] DB lookup failed:", jobErr.message);
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }
  if (!jobData) {
    // No matching job: probabile webhook spurio (es. run lanciato
    // manualmente in Apify console) o race con la creazione del job.
    console.warn(
      `[Google Ads webhook] no job matches runId=${fields.runId} — ignoring`,
    );
    return NextResponse.json({ ok: true, ignored: true });
  }
  const job = jobData as JobRow;

  // 4. Idempotenza: se gia' processato, ritorna 200 senza rifare
  if (job.webhook_received_at) {
    console.log(
      `[Google Ads webhook] job ${job.id} already processed at ${job.webhook_received_at} — skip`,
    );
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  // 5. Marca subito webhook_received_at per chiudere la finestra di
  // race con eventuali retry Apify. Se il finalize crashes dopo,
  // il job restera' in stato "running" con webhook_received_at
  // settato — gestiamo questo edge case loggando e marcando failed.
  const now = new Date().toISOString();
  await admin
    .from("mait_scrape_jobs")
    .update({ webhook_received_at: now })
    .eq("id", job.id);

  const datasetId = fields.datasetId || job.dataset_id;
  if (!datasetId) {
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "failed",
        completed_at: now,
        error: "Webhook received without datasetId",
      })
      .eq("id", job.id);
    return NextResponse.json(
      { error: "Missing datasetId" },
      { status: 400 },
    );
  }

  const opts = (job.scan_options ?? {}) as Record<string, unknown>;
  const competitorPageName =
    (opts.competitorPageName as string | undefined) ?? "unknown brand";

  // 6. Finalize: fetch dataset + normalize + filter + dedup
  try {
    const finalizeArgs: FinalizeScanArgs = {
      workspaceId: job.workspace_id,
      runId: fields.runId,
      datasetId,
      apifyStatus: fields.status,
      opts: {
        advertiserId: (opts.advertiserId as string | undefined) ?? undefined,
        advertiserDomain:
          (opts.advertiserDomain as string | undefined) ?? undefined,
        advertiserName:
          (opts.advertiserName as string | undefined) ?? undefined,
        dateFrom: (opts.dateFrom as string | undefined) ?? undefined,
        dateTo: (opts.dateTo as string | undefined) ?? undefined,
        maxResults: (opts.maxResults as number | undefined) ?? 500,
        country: (opts.country as string | undefined) ?? undefined,
        workspaceId: job.workspace_id,
      },
      urlRegionList:
        (opts.urlRegionList as string[] | undefined) ?? [],
    };
    const result = await finalizeGoogleAdsScan(finalizeArgs);

    // 7. Persist ads (anche se result.records.length === 0).
    if (result.records.length > 0 && job.competitor_id) {
      const seenAt = new Date().toISOString();
      const rows = result.records.map((r) => ({
        ...r,
        source: "google" as const,
        workspace_id: job.workspace_id,
        competitor_id: job.competitor_id,
        last_seen_in_scan_at: seenAt,
      }));

      const { error: upErr } = await admin
        .from("mait_ads_external")
        .upsert(rows, { onConflict: "workspace_id,ad_archive_id,source" });
      if (upErr) {
        throw new Error(`Ads upsert failed: ${upErr.message}`);
      }
    }

    // 8. Final job status: succeeded vs partial vs failed
    const finalStatus =
      result.complete && result.records.length >= 0
        ? "succeeded"
        : result.records.length > 0
          ? "partial"
          : "failed";

    await admin
      .from("mait_scrape_jobs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        records_count: result.records.length,
        cost_cu: result.costCu,
        error:
          finalStatus === "failed"
            ? `Apify run ended with status ${fields.status} and dataset was empty`
            : finalStatus === "partial"
              ? `Apify run did not complete (status=${fields.status}) but ${result.records.length} items were saved before the abort.`
              : null,
      })
      .eq("id", job.id);

    if (job.competitor_id) {
      await admin
        .from("mait_competitors")
        .update({ last_scraped_at: new Date().toISOString() })
        .eq("id", job.competitor_id);
    }

    // Refund se completamente failed (zero items + not succeeded)
    if (finalStatus === "failed" && job.created_by) {
      await refundCredits(
        job.created_by,
        "scan_google",
        `Google Ads scan failed (no items): ${competitorPageName}`,
      );
    }

    // Alert + invalidazione cache comparisons solo se abbiamo dati
    if (result.records.length > 0 && job.competitor_id) {
      await admin.from("mait_alerts").insert({
        workspace_id: job.workspace_id,
        competitor_id: job.competitor_id,
        type: "new_ads",
        message:
          finalStatus === "partial"
            ? `${result.records.length} Google Ads sincronizzate (scan parziale).`
            : `${result.records.length} Google Ads sincronizzate.`,
      });

      await admin
        .from("mait_comparisons")
        .update({ stale: true, updated_at: new Date().toISOString() })
        .contains("competitor_ids", [job.competitor_id]);
    }

    console.log(
      `[Google Ads webhook] DONE: job=${job.id} status=${finalStatus} records=${result.records.length} cost=$${result.costCu.toFixed(3)}`,
    );

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      status: finalStatus,
      records: result.records.length,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Finalize failed";
    console.error(`[Google Ads webhook] FAILED: job=${job.id}:`, message);
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: message,
      })
      .eq("id", job.id);
    if (job.created_by) {
      await refundCredits(
        job.created_by,
        "scan_google",
        `Google Ads scan failed in webhook: ${competitorPageName}`,
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
