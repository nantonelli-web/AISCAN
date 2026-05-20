import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundCredits } from "@/lib/credits/consume";
import type { CreditAction } from "@/config/pricing";

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
 * Marca come 'failed' e rifonde i crediti via refundCredits()
 * (che usa la RPC mait_add_credits per coerenza con il pattern
 * esistente).
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
    .select("id, source, created_by, competitor_id")
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
  }>;

  if (list.length === 0) {
    return NextResponse.json({
      ok: true,
      cleaned: 0,
      refunded: 0,
      message: "Nessun job zombi da pulire.",
    });
  }

  let refunded = 0;
  for (const z of list) {
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "Batch dispatch failed (Pattern B bug 2026-05-20 — fix shipped)",
      })
      .eq("id", z.id);

    if (z.created_by) {
      const action = `scan_${z.source}` as CreditAction;
      try {
        await refundCredits(z.created_by, action, `Batch zombie cleanup: ${z.source}`);
        refunded++;
      } catch (e) {
        console.error(`[batch cleanup] refund failed for ${z.id}:`, e);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    cleaned: list.length,
    refunded,
    message: `Puliti ${list.length} job zombi, ${refunded} refund effettuati.`,
  });
}
