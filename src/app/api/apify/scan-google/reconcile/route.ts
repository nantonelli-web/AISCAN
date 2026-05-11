import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  finalizeGoogleAdsScan,
  type FinalizeScanArgs,
  type GoogleScrapeOptions,
} from "@/lib/apify/google-ads-service";
import { refundCredits } from "@/lib/credits/consume";
import { getApifyCredentials } from "@/lib/billing/credentials";

/**
 * POST /api/apify/scan-google/reconcile { job_id? }
 *
 * Rimedio "fix-up" per job Google rimasti orfani: scan lanciato senza
 * webhook config (es. APIFY_WEBHOOK_SECRET non era ancora deployata),
 * l'attore Apify ha finito ma noi non abbiamo mai ricevuto il
 * callback → job rimane in stato 'running' all'infinito.
 *
 * Logica:
 *  - Se job_id fornito: reconcile solo quel job (workspace check via auth).
 *  - Senza job_id: scan tutti i job 'running' del workspace del chiamante
 *    con apify_run_id valorizzato e started_at > 5 min fa.
 *
 * Per ogni job:
 *  - Fetch /actor-runs/{runId} su Apify
 *  - Se SUCCEEDED/ABORTED/TIMED-OUT/FAILED → finalize (stesso codice
 *    path del webhook handler) → persiste ads + marca status
 *  - Se RUNNING/READY → niente (e' davvero ancora in corso lato Apify)
 *
 * Idempotente: se la stessa run viene reconciled mentre il webhook
 * arriva in parallelo, il webhook fa skip via webhook_received_at,
 * il reconcile aggiorna lo stato lo stesso (e marca webhook_received_at
 * per chiudere la finestra).
 */
export const maxDuration = 120;

const schema = z.object({
  job_id: z.string().uuid().optional(),
});

const APIFY_BASE = "https://api.apify.com/v2";

interface JobRow {
  id: string;
  workspace_id: string;
  competitor_id: string | null;
  apify_run_id: string | null;
  dataset_id: string | null;
  status: string;
  source: string | null;
  scan_options: Record<string, unknown> | null;
  created_by: string | null;
  started_at: string | null;
  webhook_received_at: string | null;
}

interface ReconcileResult {
  job_id: string;
  page_name: string | null;
  outcome:
    | "finalized_succeeded"
    | "finalized_partial"
    | "finalized_failed"
    | "still_running"
    | "no_runid"
    | "apify_error";
  records_count?: number;
  message?: string;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { data: userRow } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }
  const workspaceId = userRow.workspace_id as string;

  const admin = createAdminClient();

  // Carica i job da reconcile
  let jobs: JobRow[] = [];
  if (parsed.data.job_id) {
    const { data } = await admin
      .from("mait_scrape_jobs")
      .select(
        "id, workspace_id, competitor_id, apify_run_id, dataset_id, status, source, scan_options, created_by, started_at, webhook_received_at",
      )
      .eq("id", parsed.data.job_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (data) jobs.push(data as JobRow);
  } else {
    // Auto-discover: tutti i job 'running' Google del workspace
    // partiti almeno 5 min fa con un runId valorizzato.
    const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data } = await admin
      .from("mait_scrape_jobs")
      .select(
        "id, workspace_id, competitor_id, apify_run_id, dataset_id, status, source, scan_options, created_by, started_at, webhook_received_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("source", "google")
      .eq("status", "running")
      .not("apify_run_id", "is", null)
      .lt("started_at", cutoff)
      .limit(20);
    jobs = (data as JobRow[] | null) ?? [];
  }

  if (jobs.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "Nessun job da riconciliare",
      reconciled: [],
    });
  }

  const reconciled: ReconcileResult[] = [];

  for (const job of jobs) {
    if (!job.apify_run_id) {
      reconciled.push({
        job_id: job.id,
        page_name: null,
        outcome: "no_runid",
        message: "Job senza apify_run_id, impossibile reconcile",
      });
      continue;
    }

    let pageName: string | null = null;
    if (job.competitor_id) {
      const { data: comp } = await admin
        .from("mait_competitors")
        .select("page_name")
        .eq("id", job.competitor_id)
        .maybeSingle();
      pageName = (comp as { page_name: string | null } | null)?.page_name ?? null;
    }

    // Fetch run status from Apify
    let apifyStatus: string;
    let datasetId: string;
    try {
      const creds = await getApifyCredentials(job.workspace_id);
      const res = await fetch(
        `${APIFY_BASE}/actor-runs/${job.apify_run_id}`,
        {
          headers: { authorization: `Bearer ${creds.token}` },
        },
      );
      if (!res.ok) {
        throw new Error(`Apify ${res.status}`);
      }
      const body = (await res.json()) as {
        data?: { status?: string; defaultDatasetId?: string };
      };
      apifyStatus = body.data?.status ?? "UNKNOWN";
      datasetId = body.data?.defaultDatasetId ?? job.dataset_id ?? "";
    } catch (e) {
      reconciled.push({
        job_id: job.id,
        page_name: pageName,
        outcome: "apify_error",
        message: e instanceof Error ? e.message : "Apify fetch failed",
      });
      continue;
    }

    // Se ancora in corso lato Apify, niente da fare
    if (apifyStatus === "RUNNING" || apifyStatus === "READY") {
      reconciled.push({
        job_id: job.id,
        page_name: pageName,
        outcome: "still_running",
        message: `Apify status=${apifyStatus}, lo lasciamo lavorare`,
      });
      continue;
    }

    if (!datasetId) {
      await admin
        .from("mait_scrape_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: `Reconcile: no datasetId, Apify status=${apifyStatus}`,
          webhook_received_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      if (job.created_by) {
        await refundCredits(
          job.created_by,
          "scan_google",
          `Reconcile: no datasetId (${pageName})`,
        );
      }
      reconciled.push({
        job_id: job.id,
        page_name: pageName,
        outcome: "finalized_failed",
        message: "Nessun datasetId, marcato failed e crediti rifondati",
      });
      continue;
    }

    // Finalize (stessa logica del webhook handler)
    const opts = (job.scan_options ?? {}) as Record<string, unknown>;
    const finalizeOpts: GoogleScrapeOptions = {
      advertiserId: (opts.advertiserId as string | undefined) ?? undefined,
      advertiserDomain:
        (opts.advertiserDomain as string | undefined) ?? undefined,
      advertiserName: (opts.advertiserName as string | undefined) ?? undefined,
      dateFrom: (opts.dateFrom as string | undefined) ?? undefined,
      dateTo: (opts.dateTo as string | undefined) ?? undefined,
      maxResults: (opts.maxResults as number | undefined) ?? 500,
      country: (opts.country as string | undefined) ?? undefined,
      workspaceId: job.workspace_id,
    };

    try {
      const args: FinalizeScanArgs = {
        workspaceId: job.workspace_id,
        runId: job.apify_run_id,
        datasetId,
        apifyStatus,
        opts: finalizeOpts,
        urlRegionList:
          (opts.urlRegionList as string[] | undefined) ?? [],
      };
      const result = await finalizeGoogleAdsScan(args);

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
          throw new Error(`Upsert failed: ${upErr.message}`);
        }
      }

      const finalStatus: "succeeded" | "partial" | "failed" =
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
          webhook_received_at: new Date().toISOString(),
          error:
            finalStatus === "failed"
              ? `Reconcile: Apify status=${apifyStatus} and dataset was empty`
              : finalStatus === "partial"
                ? `Reconcile: Apify status=${apifyStatus} ma ${result.records.length} items recuperati dal dataset`
                : null,
        })
        .eq("id", job.id);

      if (job.competitor_id) {
        await admin
          .from("mait_competitors")
          .update({ last_scraped_at: new Date().toISOString() })
          .eq("id", job.competitor_id);
      }

      if (finalStatus === "failed" && job.created_by) {
        await refundCredits(
          job.created_by,
          "scan_google",
          `Reconcile: scan failed (${pageName})`,
        );
      }

      if (result.records.length > 0 && job.competitor_id) {
        await admin.from("mait_alerts").insert({
          workspace_id: job.workspace_id,
          competitor_id: job.competitor_id,
          type: "new_ads",
          message:
            finalStatus === "partial"
              ? `${result.records.length} Google Ads sincronizzate (reconcile, scan parziale).`
              : `${result.records.length} Google Ads sincronizzate (reconcile).`,
        });
        await admin
          .from("mait_comparisons")
          .update({ stale: true, updated_at: new Date().toISOString() })
          .contains("competitor_ids", [job.competitor_id]);
      }

      reconciled.push({
        job_id: job.id,
        page_name: pageName,
        outcome:
          finalStatus === "succeeded"
            ? "finalized_succeeded"
            : finalStatus === "partial"
              ? "finalized_partial"
              : "finalized_failed",
        records_count: result.records.length,
      });

      console.log(
        `[Reconcile Google] job=${job.id} status=${finalStatus} records=${result.records.length}`,
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Finalize failed";
      console.error(`[Reconcile Google] failed job=${job.id}:`, message);
      await admin
        .from("mait_scrape_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: `Reconcile failed: ${message}`,
        })
        .eq("id", job.id);
      if (job.created_by) {
        await refundCredits(
          job.created_by,
          "scan_google",
          `Reconcile finalize failed: ${pageName}`,
        );
      }
      reconciled.push({
        job_id: job.id,
        page_name: pageName,
        outcome: "apify_error",
        message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    reconciled_count: reconciled.length,
    reconciled,
  });
}
