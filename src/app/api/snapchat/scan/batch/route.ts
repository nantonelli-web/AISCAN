import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BATCH_MAX,
  checkDailyCostCap,
  filterEligibleBrands,
  CONCURRENCY_CAP_PER_WORKSPACE,
  type SkipReason,
} from "@/lib/apify/batch-safety";
import { logger } from "@/lib/logger";

/**
 * POST /api/snapchat/scan/batch { competitor_ids: [...] }
 *
 * Batch Snapchat scan multi-brand. Snapchat usa l'API REST ufficiale
 * Snap (gratuita, no Apify) con latenza tipica 5-10s per brand. Un
 * batch di 10 brand in parallelo finisce in 15-30s — sta tranquillo
 * dentro maxDuration 300s.
 *
 * SAFETY CONTROLS (centralizzati in @/lib/apify/batch-safety):
 *   - Batch size cap 10
 *   - Cooldown 6h per-brand (snapchat-specifico)
 *   - Concurrency cap 8 paralleli per workspace
 *   - Daily cost cap del workspace
 *   - Credit charge atomico con rollback su insufficient mid-batch
 *   - Niente auto-retry
 *
 * Pattern di dispatch: fire-internal-fetch verso /api/snapchat/scan
 * per ogni brand eligible. Auth cookie forwarded. Promise.allSettled
 * per isolare errori per-brand. Cost crediti=1 per Snapchat.
 */
export const maxDuration = 300;

const schema = z.object({
  competitor_ids: z.array(z.string().uuid()).min(1).max(BATCH_MAX),
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

  const admin = createAdminClient();

  // Workspace ownership
  const { data: userRow } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }
  const workspaceId = userRow.workspace_id as string;

  // Brand fetch
  const { data: competitors } = await admin
    .from("mait_competitors")
    .select("id, workspace_id, page_name, snapchat_handle")
    .in("id", parsed.data.competitor_ids)
    .eq("workspace_id", workspaceId);
  type Comp = {
    id: string;
    workspace_id: string;
    page_name: string | null;
    snapchat_handle: string | null;
  };
  const compList = (competitors ?? []) as Comp[];
  if (compList.length === 0) {
    return NextResponse.json(
      { error: "Nessun brand valido trovato nel workspace" },
      { status: 404 },
    );
  }

  // SAFETY 1: daily cost cap
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

  // SAFETY 2+3: concurrency cap + cooldown via helper
  const filterResult = await filterEligibleBrands({
    brands: compList,
    workspaceId,
    source: "snapchat",
    admin,
    hasChannelConfig: (c) => !!c.snapchat_handle,
  });
  if (filterResult.headroom === 0) {
    return NextResponse.json(
      {
        error: `Hai gia' ${CONCURRENCY_CAP_PER_WORKSPACE} scan Snapchat in corso (max per workspace). Aspetta che ne finisca qualcuno.`,
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

  // DIVERGENZA INTENZIONALE vs Google batch (rivista 2026-06-03):
  // qui NON si usa chargeBatchCredits. La route per-brand
  // /api/snapchat/scan e' l'UNICA autorita' di addebito: fa il proprio
  // charge atomico (1 credit) e il proprio refund idempotente
  // (refundJobCreditOnce, vedi #3). Centralizzare il charge nel batch
  // richiederebbe aggiungere un ramo "batched → skip charge" alla route
  // per-brand (che oggi addebita SEMPRE), introducendo rischio di
  // doppio/mancato addebito senza alcun vantaggio: il pattern attuale e'
  // gia' single-charge-authority e quindi privo di double-charge. Le
  // altre safety (cost cap, concurrency, cooldown) SONO centralizzate
  // sopra. Tenuto cosi' di proposito.

  const batchId = randomUUID();

  // Auth cookie forwarding: per fare fetch internal alle route per-
  // brand, dobbiamo passare i cookie supabase. cookies() (next/headers)
  // ritorna i cookie della request corrente; li serializziamo nel
  // header Cookie del fetch.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL non configurato." },
      { status: 503 },
    );
  }

  const started: Array<{
    competitor_id: string;
    page_name: string | null;
  }> = [];

  // Lancia tutti i per-brand in parallelo, isolando errori.
  // Promise.allSettled per evitare che un fallimento contagioso
  // affossi gli altri. Per Snapchat il scan e' veloce (~10s ognuno)
  // quindi 10 paralleli stanno tranquilli dentro 300s.
  const results = await Promise.allSettled(
    toLaunch.map(async (c) => {
      const res = await fetch(`${appUrl}/api/snapchat/scan`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        body: JSON.stringify({ competitor_id: c.id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      return c;
    }),
  );

  for (let i = 0; i < toLaunch.length; i++) {
    const c = toLaunch[i];
    const r = results[i];
    if (r.status === "fulfilled") {
      started.push({
        competitor_id: c.id,
        page_name: c.page_name,
      });
    } else {
      const message =
        r.reason instanceof Error ? r.reason.message : "Start failed";
      logger.error(
        `start failed: ${message}`,
        {
          channel: "snapchat/scan/batch",
          event: "scan.start_failed",
          workspaceId,
          userId: user.id,
          competitorId: c.id,
        },
        r.reason,
      );
      skipped.push({
        competitor_id: c.id,
        page_name: c.page_name,
        reason: "start_failed",
        detail: message,
      });
      // Niente refund qui: la route per-brand ha gia' fatto il
      // proprio refund nel suo error path.
    }
  }

  // Job rows con batch_id per il polling lato client. La per-brand
  // route inserisce gia' la sua riga; aggiorniamo il batch_id sui
  // job che riusciamo a identificare (started_at recenti per il
  // brand + source=snapchat). Best-effort: serve solo per il
  // polling, niente di critico se manca su qualche riga.
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  for (const s of started) {
    await admin
      .from("mait_scrape_jobs")
      .update({ batch_id: batchId })
      .eq("competitor_id", s.competitor_id)
      .eq("source", "snapchat")
      .gt("started_at", tenMinAgo)
      .is("batch_id", null);
  }

  logger.info(
    `batch done: started=${started.length} skipped=${skipped.length}`,
    {
      channel: "snapchat/scan/batch",
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
    summary: {
      requested: parsed.data.competitor_ids.length,
      eligible: toLaunch.length,
      launched: started.length,
      skipped: skipped.length,
      credits_charged: started.length, // 1 cr per brand, charged dalla per-brand route
    },
  });
}

/**
 * GET /api/snapchat/scan/batch?batch_id=<uuid>
 *
 * Status del batch, identica forma a /api/apify/scan-google/batch
 * cosi il polling lato client puo' essere generico.
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

  const admin = createAdminClient();
  const { data: jobs } = await admin
    .from("mait_scrape_jobs")
    .select("id, competitor_id, status, records_count, error, started_at, completed_at")
    .eq("batch_id", batchId)
    .eq("source", "snapchat")
    .order("started_at", { ascending: false });

  const list = (jobs ?? []) as Array<{
    id: string;
    competitor_id: string;
    status: string;
    records_count: number;
    error: string | null;
    started_at: string;
    completed_at: string | null;
  }>;
  // Stessa forma di /api/apify/scan-google/batch GET cosi il polling
  // lato client e' generico (BatchScanPanel non si preoccupa del
  // canale specifico durante il poll).
  const counts = {
    total: list.length,
    running: list.filter((j) => j.status === "running").length,
    succeeded: list.filter((j) => j.status === "succeeded").length,
    partial: list.filter((j) => j.status === "partial").length,
    failed: list.filter((j) => j.status === "failed").length,
  };
  const totalRecords = list.reduce((s, j) => s + (j.records_count ?? 0), 0);
  const terminal = counts.running === 0;

  return NextResponse.json({
    batch_id: batchId,
    counts,
    total_records: totalRecords,
    terminal,
    jobs: list,
  });
}
