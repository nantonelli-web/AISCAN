import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import { getApifyCredentials } from "@/lib/billing/credentials";
import { logger } from "@/lib/logger";

/**
 * POST /api/apify/scan-google/resume { job_id }
 *
 * Riprende un Google Ads scan finito in 'partial' chiamando l'endpoint
 * Apify /actor-runs/{runId}/resurrect. Apify riapre il run dallo stato
 * in cui era stato abortito (queue items conservata) e continua a
 * scrappare. Il webhook gia' configurato in fase di startGoogleAdsScan
 * verra' richiamato a fine del run di resurrect, e finalizera' come
 * sempre.
 *
 * Costo: 2 crediti (stesso di un nuovo scan). Apify costa di nuovo
 * lo stesso compute time del run originale + il resurrect.
 *
 * Vincoli:
 * - job deve essere in stato 'partial'
 * - runId deve esistere (apify_run_id non null)
 * - il run deve essere ancora disponibile su Apify (default ~7 giorni)
 * - non possiamo resumetare un job gia' in 'running' (race condition)
 */
export const maxDuration = 30;

const schema = z.object({
  job_id: z.string().uuid(),
});

const APIFY_BASE = "https://api.apify.com/v2";

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
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: jobData, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .select(
      "id, workspace_id, competitor_id, apify_run_id, status, source, scan_options, dataset_id, created_by, started_at",
    )
    .eq("id", parsed.data.job_id)
    .maybeSingle();

  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }
  if (!jobData) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Workspace ownership: il chiamante deve essere nello stesso
  // workspace del job. Riusiamo la query mait_users per coerenza con
  // gli altri endpoint.
  const { data: userRow } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!userRow || userRow.workspace_id !== jobData.workspace_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (jobData.source !== "google") {
    return NextResponse.json(
      { error: "Resume disponibile solo per scan Google" },
      { status: 400 },
    );
  }
  if (jobData.status !== "partial") {
    return NextResponse.json(
      {
        error: `Resume disponibile solo su scan in stato 'partial' (questo job e' ${jobData.status})`,
      },
      { status: 400 },
    );
  }
  if (!jobData.apify_run_id) {
    return NextResponse.json(
      { error: "Job senza apify_run_id, impossibile resumetare" },
      { status: 400 },
    );
  }

  // Cap soft: dopo 6 giorni Apify potrebbe aver gia' purgato il run.
  // Diamo un buffer: blocchiamo a 5 giorni per sicurezza.
  const startedAt = jobData.started_at
    ? new Date(jobData.started_at).getTime()
    : 0;
  if (startedAt && Date.now() - startedAt > 5 * 86_400_000) {
    return NextResponse.json(
      {
        error:
          "Il run Apify originale e' troppo vecchio per essere resumetato (>5 giorni). Lancia un nuovo scan.",
      },
      { status: 400 },
    );
  }

  // Charge credits (stesso costo di un nuovo scan)
  const credits = await consumeCredits(
    user.id,
    "scan_google",
    `Google Ads scan resume: job=${jobData.id}`,
  );
  if (!credits.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credits.balance, cost: 2 },
      { status: 402 },
    );
  }

  // Reset webhook_received_at: il webhook handler usa quel campo come
  // marker di idempotenza, devo riazzerarlo se no ignorerebbe il
  // webhook in arrivo da resurrect.
  await admin
    .from("mait_scrape_jobs")
    .update({
      status: "running",
      webhook_received_at: null,
      // Aggiorniamo started_at cosi il watchdog stale (>35 min) parte
      // dal resurrect, non dal run originale.
      started_at: new Date().toISOString(),
      completed_at: null,
      error: null,
    })
    .eq("id", jobData.id);

  try {
    const creds = await getApifyCredentials(jobData.workspace_id);
    const token = creds.token;

    const res = await fetch(
      `${APIFY_BASE}/actor-runs/${jobData.apify_run_id}/resurrect`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Apify resurrect failed (${res.status}): ${errText.slice(0, 200)}`,
      );
    }

    logger.info(`resurrect OK runId=${jobData.apify_run_id}`, {
      channel: "scan-google/resume",
      event: "scan.resumed",
      jobId: jobData.id,
      workspaceId: jobData.workspace_id,
      competitorId: jobData.competitor_id,
      userId: user.id,
    });

    return NextResponse.json({
      ok: true,
      job_id: jobData.id,
      run_id: jobData.apify_run_id,
      status: "running",
      message:
        "Scan ripreso. Apify continuera' da dove si era fermato e ti avviseremo a completion.",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Resume failed";
    logger.error(
      `resume FAILED: ${message}`,
      {
        channel: "scan-google/resume",
        event: "scan.resume_failed",
        jobId: jobData.id,
        workspaceId: jobData.workspace_id,
        competitorId: jobData.competitor_id,
        userId: user.id,
      },
      e,
    );

    // Rollback dello state e refund crediti
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "partial",
        error: `Resume failed: ${message}`,
      })
      .eq("id", jobData.id);
    await refundCredits(
      user.id,
      "scan_google",
      `Google Ads scan resume failed: job=${jobData.id}`,
    );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
