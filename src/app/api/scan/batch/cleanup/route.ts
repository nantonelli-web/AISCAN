import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStuckBatchJob } from "@/lib/apify/batch-dispatch";

/**
 * POST /api/scan/batch/cleanup
 *
 * One-shot cleanup per i job zombi rimasti dopo il bug del
 * 2026-05-20 sul Pattern B batch dispatch (abort 3s + keepalive
 * uccideva le fetch verso /scan prima che attivassero il container
 * target → job status='running' senza che Apify partisse mai,
 * crediti spesi).
 *
 * Trova tutti i job del workspace dell'utente con:
 *   - status='running'
 *   - batch_id IS NOT NULL
 *   - source IN (meta, instagram, tiktok, youtube)
 *   - started_at < NOW() - 5 minutes
 *
 * Per ogni job delega a resolveStuckBatchJob() (logica condivisa con
 * l'auto-reconcile): RECUPERA i job il cui scan aveva gia' salvato
 * dati (mark 'succeeded') e marca 'failed' + rifonde solo quelli senza
 * dati. Niente piu' fail+refund cieco: dopo un crash il recupero
 * manuale non scarta gli scan riusciti.
 */
export const maxDuration = 30;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userRow } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }
  const workspaceId = userRow.workspace_id as string;

  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: zombies } = await admin
    .from("mait_scrape_jobs")
    .select("id, source, created_by, competitor_id, started_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "running")
    .not("batch_id", "is", null)
    .in("source", ["meta", "instagram", "tiktok", "youtube"])
    .lt("started_at", cutoff);

  const list = (zombies ?? []) as Array<{
    id: string;
    source: string;
    created_by: string | null;
    competitor_id: string;
    started_at: string;
  }>;

  if (list.length === 0) {
    return NextResponse.json({
      ok: true,
      cleaned: 0,
      recovered: 0,
      failed: 0,
      refunded: 0,
      message: "Nessun job in stallo da pulire.",
    });
  }

  let recovered = 0;
  let failed = 0;
  for (const z of list) {
    const outcome = await resolveStuckBatchJob(z, admin, "cleanup");
    if (outcome === "recovered") recovered++;
    else failed++;
  }

  return NextResponse.json({
    ok: true,
    cleaned: list.length,
    recovered,
    failed,
    // I job senza dati salvati vengono marcati failed + rifondati;
    // quelli recuperati no (lo scan e' andato a buon fine).
    refunded: failed,
    message: `Risolti ${list.length} job in stallo: ${recovered} recuperati, ${failed} falliti + rifondati.`,
  });
}
