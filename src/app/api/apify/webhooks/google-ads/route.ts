import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const CH = "Google Ads webhook";

// Apify chiama questo endpoint quando un run Google Ads finisce
// (SUCCEEDED / ABORTED / FAILED / TIMED-OUT). Il payload e' il
// default Apify webhook payload (eventData + resource + ...).
//
// Autenticazione: header `x-aiscan-secret` deve matchare la env var
// `APIFY_WEBHOOK_SECRET`. Non usiamo cookies — questa chiamata viene
// da Apify, non da un utente.
//
// Idempotenza + ack veloce:
//   Apify ha un client-side timeout di ~30s sul webhook HTTP; se la
//   response tarda di piu' marca il dispatch come failed/408. Per
//   stare ben sotto il limite questo handler fa SOLO:
//     - validate secret
//     - parse payload + extract fields (default Apify format)
//     - lookup job + set webhook_received_at + status='processing'
//     - fire-and-forget POST a /api/apify/scan-google/reconcile
//       (internal auth via x-internal-auth header)
//     - 200 a Apify entro 1s
//
//   Il reconcile endpoint ha maxDuration alto e fa il vero finalize.
//   Vantaggio: non dipende da `after()` (clamped su Hobby plan) ne'
//   da grace-period Vercel per fire-and-forget locali — il fetch e'
//   verso un URL esterno, parte come HTTP request sull'event loop.
export const maxDuration = 30;

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
    logger.error("APIFY_WEBHOOK_SECRET non settata, webhook rifiutato", {
      channel: CH,
      event: "webhook.no_secret_configured",
    });
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }
  if (secret !== expected) {
    logger.warn("Webhook secret mismatch (possibile spoofing)", {
      channel: CH,
      event: "webhook.secret_mismatch",
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse payload (accetta sia default Apify che custom-template)
  const payload = (await req.json().catch(() => null)) as WebhookPayload | null;
  if (!payload) {
    logger.error("Empty webhook payload", { channel: CH, event: "webhook.empty_payload" });
    return NextResponse.json({ error: "Empty payload" }, { status: 400 });
  }
  const fields = extractWebhookFields(payload);
  if (!fields.runId || !fields.status) {
    logger.error("Missing runId/status after extraction", {
      channel: CH,
      event: "webhook.invalid_payload",
      payloadKeys: Object.keys(payload),
      extracted: fields,
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  logger.info(
    `Webhook received: status=${fields.status} eventType=${payload.eventType}`,
    { channel: CH, event: "webhook.received", runId: fields.runId, status: fields.status, eventType: payload.eventType },
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
    logger.error(
      "Webhook job DB lookup failed",
      { channel: CH, event: "webhook.lookup_failed", runId: fields.runId },
      jobErr,
    );
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }
  if (!jobData) {
    // No matching job: probabile webhook spurio (es. run lanciato
    // manualmente in Apify console) o race con la creazione del job.
    logger.warn(`No job matches runId=${fields.runId} — ignoring webhook`, {
      channel: CH,
      event: "webhook.no_job_match",
      runId: fields.runId,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }
  const job = jobData as JobRow;

  // 4. Idempotenza: il lock vale SOLO se il job e' arrivato a uno
  //    stato finale (succeeded/partial/failed). Se e' ancora
  //    'running' nonostante webhook_received_at sia settato, vuol
  //    dire che un retry precedente ha settato il lock ma il
  //    finalize non e' mai stato completato (es. function killed
  //    a meta'). In questo caso lasciamo che il retry corrente
  //    riavvii il reconcile invece di tornare alreadyProcessed.
  const finalStates = ["succeeded", "partial", "failed"];
  if (job.webhook_received_at && finalStates.includes(job.status)) {
    logger.info(`Job already finalized (${job.status}) — skip`, {
      channel: CH,
      event: "webhook.already_finalized",
      jobId: job.id,
      workspaceId: job.workspace_id,
      competitorId: job.competitor_id,
      runId: fields.runId,
      status: job.status,
    });
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }
  if (job.webhook_received_at && !finalStates.includes(job.status)) {
    logger.warn(
      `Job has webhook_received_at but status=${job.status} — retrying reconcile`,
      {
        channel: CH,
        event: "webhook.reconcile_retry",
        jobId: job.id,
        workspaceId: job.workspace_id,
        runId: fields.runId,
        status: job.status,
      },
    );
  }

  // 5. Marca webhook_received_at come lock anti-doppia-elaborazione.
  //    I retry Apify trovano la colonna valorizzata e ritornano
  //    alreadyProcessed.
  const now = new Date().toISOString();
  await admin
    .from("mait_scrape_jobs")
    .update({ webhook_received_at: now })
    .eq("id", job.id);

  // 6. POST al reconcile endpoint con awaited-but-capped:
  //    aspettiamo al MASSIMO 3s che la fetch parta + inizializzi
  //    TCP. Su Vercel un puro fire-and-forget puo' essere killato
  //    prima che la connessione si apra. 3s sono lontani dai 30s
  //    di timeout Apify ma sufficienti per garantire che la
  //    request raggiunga il reconcile container, che poi gira
  //    indipendentemente con il suo maxDuration.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (appUrl) {
    const reconcileUrl = `${appUrl}/api/apify/scan-google/reconcile`;
    const ctrl = new AbortController();
    const abortTimer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const recRes = await fetch(reconcileUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-auth": expected,
        },
        body: JSON.stringify({ job_id: job.id }),
        signal: ctrl.signal,
        // keepalive: la request continua anche se il caller (questa
        // function) viene terminato dopo aver mandato la response.
        keepalive: true,
      });
      logger.info(`Reconcile triggered (status=${recRes.status})`, {
        channel: CH,
        event: "webhook.reconcile_triggered",
        jobId: job.id,
        workspaceId: job.workspace_id,
        runId: fields.runId,
        reconcileStatus: recRes.status,
      });
    } catch (err) {
      // AbortError dopo 3s e' atteso: la richiesta e' partita, il
      // reconcile sta processando, possiamo chiudere noi.
      const isAbort =
        err instanceof Error && err.name === "AbortError";
      if (isAbort) {
        logger.debug(`Reconcile request kept-alive after 3s`, {
          channel: CH,
          event: "webhook.reconcile_keepalive",
          jobId: job.id,
        });
      } else {
        logger.error(
          `Reconcile call failed`,
          { channel: CH, event: "webhook.reconcile_failed", jobId: job.id, workspaceId: job.workspace_id, runId: fields.runId },
          err,
        );
      }
    } finally {
      clearTimeout(abortTimer);
    }
  } else {
    logger.error(
      `Cannot schedule reconcile: NEXT_PUBLIC_APP_URL missing`,
      { channel: CH, event: "webhook.no_appurl", jobId: job.id },
    );
  }

  // 7. Ack immediato a Apify (entro 1s, ben dentro il timeout 30s
  //    lato client).
  return NextResponse.json({
    ok: true,
    job_id: job.id,
    status: "processing",
    message: "Reconcile scheduled",
  });
}
