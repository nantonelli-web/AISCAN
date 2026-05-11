import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApifyCredentials } from "@/lib/billing/credentials";

/**
 * POST /api/apify/scan-google/batch/stop { batch_id }
 *
 * Aborta tutti i run Apify ancora in corso di un batch. Per ogni
 * job 'running' del batch:
 *  1. Chiama Apify /actor-runs/{runId}/abort (best-effort)
 *  2. Lascia che il webhook arrivi con status=ABORTED e finalizzi
 *     come 'partial' (se aveva gia' scrapato qualcosa) o 'failed'
 *     (se zero items).
 *
 * NON refund qui: il webhook handler gestisce gia' i refund quando
 * il job finisce con zero items. Cosi' la logica di crediti resta
 * in un posto solo (il finalize via webhook).
 */
export const maxDuration = 30;

const schema = z.object({
  batch_id: z.string().uuid(),
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
  const { data: jobs } = await admin
    .from("mait_scrape_jobs")
    .select("id, competitor_id, apify_run_id, status, workspace_id")
    .eq("batch_id", parsed.data.batch_id)
    .eq("workspace_id", workspaceId)
    .eq("status", "running")
    .not("apify_run_id", "is", null);

  type JobRow = {
    id: string;
    competitor_id: string | null;
    apify_run_id: string | null;
    status: string;
    workspace_id: string;
  };
  const running = (jobs as JobRow[] | null) ?? [];

  if (running.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "Nessun job in corso da abortire",
      aborted_count: 0,
    });
  }

  let creds;
  try {
    creds = await getApifyCredentials(workspaceId);
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Apify credentials missing",
      },
      { status: 503 },
    );
  }

  const aborted: string[] = [];
  const failed: Array<{ job_id: string; reason: string }> = [];

  // Sequenziale (no Promise.all) per evitare burst su Apify quando
  // il batch ha 10 brand. ~100ms per call x 10 = 1s, ben sotto il
  // maxDuration di 30s.
  for (const j of running) {
    if (!j.apify_run_id) continue;
    try {
      const res = await fetch(
        `${APIFY_BASE}/actor-runs/${j.apify_run_id}/abort`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${creds.token}` },
        },
      );
      if (!res.ok && res.status !== 400) {
        // 400 = run gia' in stato terminale, lo accettiamo silenziosamente
        const t = await res.text().catch(() => "");
        throw new Error(`Apify abort ${res.status}: ${t.slice(0, 120)}`);
      }
      aborted.push(j.id);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "abort failed";
      console.error(
        `[Batch Stop] failed to abort job=${j.id} run=${j.apify_run_id}:`,
        reason,
      );
      failed.push({ job_id: j.id, reason });
    }
  }

  console.log(
    `[Batch Stop] batch=${parsed.data.batch_id} aborted=${aborted.length} failed=${failed.length}`,
  );

  return NextResponse.json({
    ok: true,
    batch_id: parsed.data.batch_id,
    aborted_count: aborted.length,
    aborted_job_ids: aborted,
    failed,
  });
}
