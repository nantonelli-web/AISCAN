import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApifyCredentials } from "@/lib/billing/credentials";

/**
 * GET /api/apify/scan-google/poll-active
 *
 * Sostituisce i webhook Apify (che Apify, per ragioni non
 * documentate, non invoca affidabilmente sui Rental actors come
 * silva95gustavo/google-ads-scraper) con polling-driven
 * finalization:
 *
 *  1. Trova i job Google `running` del workspace utente con
 *     apify_run_id valorizzato e started_at > 30s fa.
 *  2. Per ognuno: GET /v2/actor-runs/{runId} su Apify.
 *  3. Se lo stato e' terminale (SUCCEEDED/FAILED/ABORTED/TIMED-OUT)
 *     → POST fire-and-forget al /reconcile (internal auth) per
 *     finalizzare. Il reconcile ha il suo maxDuration alto e fa
 *     il vero finalize (dataset fetch + normalize + upsert + update).
 *  4. Se lo stato e' RUNNING/READY → niente, riprovera al prossimo
 *     poll del client.
 *
 * Questo endpoint e' invocato dal client `<ScanPoller />` ogni 10s
 * mentre l'utente ha aperta qualsiasi pagina del dashboard. Niente
 * cron Vercel: il polling client basta per il use case (utente che
 * lancia uno scan e poi aspetta il risultato sulla stessa app).
 */
export const maxDuration = 30;

const APIFY_BASE = "https://api.apify.com/v2";

const TERMINAL_STATES = new Set([
  "SUCCEEDED",
  "FAILED",
  "ABORTED",
  "TIMED-OUT",
  "TIMED_OUT",
]);

interface JobRow {
  id: string;
  workspace_id: string;
  apify_run_id: string | null;
  status: string;
  started_at: string | null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Job 'running' del workspace, Google source, runId presente,
  // partiti almeno 30s fa (per non sovrapporsi al primo poll
  // mentre il job e' appena stato registrato).
  const cutoff = new Date(Date.now() - 30 * 1000).toISOString();
  const { data: jobsData } = await admin
    .from("mait_scrape_jobs")
    .select("id, workspace_id, apify_run_id, status, started_at")
    .eq("workspace_id", workspaceId)
    .eq("source", "google")
    .eq("status", "running")
    .not("apify_run_id", "is", null)
    .lt("started_at", cutoff)
    .limit(20);
  const jobs = (jobsData as JobRow[] | null) ?? [];

  if (jobs.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, triggered: [] });
  }

  console.log(
    `[poll-active] workspace=${workspaceId} found ${jobs.length} running google job(s):`,
    jobs.map((j) => ({ id: j.id, runId: j.apify_run_id, started: j.started_at })),
  );

  // Apify credentials del workspace.
  const creds = await getApifyCredentials(workspaceId).catch(() => null);
  if (!creds?.token) {
    return NextResponse.json({
      ok: false,
      error: "No Apify credentials for workspace",
      checked: 0,
    });
  }

  const triggered: Array<{
    job_id: string;
    apify_status: string | null;
    action: "reconcile_triggered" | "still_running" | "apify_error";
  }> = [];

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET ?? "";

  await Promise.all(
    jobs.map(async (job) => {
      if (!job.apify_run_id) return;
      try {
        const runRes = await fetch(
          `${APIFY_BASE}/actor-runs/${job.apify_run_id}`,
          { headers: { authorization: `Bearer ${creds.token}` } },
        );
        if (!runRes.ok) {
          triggered.push({
            job_id: job.id,
            apify_status: null,
            action: "apify_error",
          });
          return;
        }
        const body = (await runRes.json()) as {
          data?: { status?: string };
        };
        const status = body.data?.status ?? null;
        if (!status) {
          triggered.push({
            job_id: job.id,
            apify_status: null,
            action: "apify_error",
          });
          return;
        }
        const isTerminal = TERMINAL_STATES.has(status);
        console.log(
          `[poll-active] job=${job.id} run=${job.apify_run_id} apify_status=${status} terminal=${isTerminal}`,
        );
        if (!isTerminal) {
          triggered.push({
            job_id: job.id,
            apify_status: status,
            action: "still_running",
          });
          return;
        }
        // Apify ha finito → trigger reconcile fire-and-forget.
        if (appUrl && webhookSecret) {
          console.log(
            `[poll-active] triggering reconcile for job=${job.id} (apify ${status})`,
          );
          const ctrl = new AbortController();
          const abortTimer = setTimeout(() => ctrl.abort(), 3000);
          try {
            await fetch(`${appUrl}/api/apify/scan-google/reconcile`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-internal-auth": webhookSecret,
              },
              body: JSON.stringify({ job_id: job.id }),
              signal: ctrl.signal,
              keepalive: true,
            });
          } catch {
            /* AbortError atteso dopo 3s; la request e' partita */
          } finally {
            clearTimeout(abortTimer);
          }
        }
        triggered.push({
          job_id: job.id,
          apify_status: status,
          action: "reconcile_triggered",
        });
      } catch (e) {
        console.error(
          `[poll-active] error on job ${job.id}:`,
          e instanceof Error ? e.message : e,
        );
        triggered.push({
          job_id: job.id,
          apify_status: null,
          action: "apify_error",
        });
      }
    }),
  );

  return NextResponse.json({
    ok: true,
    checked: jobs.length,
    triggered,
  });
}
