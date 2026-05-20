/**
 * Generic batch dispatcher per i canali che usano una rotta /scan
 * SYNC (Meta/IG/TT/YT). Il batch endpoint pre-carica i crediti,
 * crea i job row, poi fa fire-internal-fetch a /scan?batched=1
 * con il job_id passato — la rotta sync skippa charge+insert e
 * fa solo il lavoro Apify. La fetch e' fire-and-forget (keepalive
 * + abort 3s) cosi' il batch endpoint torna subito mentre i 10
 * scan girano in parallelo per i loro 60-90s.
 *
 * Snapchat batch usa un pattern diverso (Promise.allSettled,
 * wait completo) perche' i suoi scan sono <10s. Google batch
 * usa un pattern diverso (chiama Apify direttamente, gestisce
 * webhook). Questo helper e' specifico per la categoria "sync
 * scan lento" — IG/TT/YT/Meta.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BATCH_MAX,
  CONCURRENCY_CAP_PER_WORKSPACE,
  checkDailyCostCap,
  chargeBatchCredits,
  filterEligibleBrands,
  refundOneBatchCredit,
  type BatchSource,
  type SkipReason,
} from "@/lib/apify/batch-safety";

export const batchSchema = z.object({
  competitor_ids: z.array(z.string().uuid()).min(1).max(BATCH_MAX),
  // Opzionali: il batch endpoint li passa al per-brand scan. Date
  // sono in formato ISO YYYY-MM-DD.
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  max_items: z.number().int().min(1).max(1000).optional(),
});

export type BatchSchema = z.infer<typeof batchSchema>;

export interface DispatchBatchConfig<C extends { id: string; page_name: string | null }> {
  /** Channel source identifier — usato per il job row + safety helpers. */
  source: BatchSource;
  /** Select string per la query brand. Deve includere id, workspace_id,
   *  page_name + i campi config-canale che hasChannelConfig esamina. */
  selectFields: string;
  /** Predicato che valida la presenza della config canale per il brand. */
  hasChannelConfig: (c: C) => boolean;
  /** Endpoint interno per per-brand scan. Es: "/api/instagram/scan". */
  internalScanPath: string;
  /** Costruisce il body JSON da inviare al per-brand scan. Il flag
   *  `batched: true` + `job_id` vengono aggiunti automaticamente. */
  buildScanBody?: (c: C, batchInput: BatchSchema) => Record<string, unknown>;
  /** Etichetta umana per i log + crediti, es: "Instagram". */
  channelLabel: string;
}

export async function dispatchAsyncBatch<
  C extends { id: string; workspace_id: string; page_name: string | null }
>(req: Request, cfg: DispatchBatchConfig<C>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = batchSchema.safeParse(body);
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
    .select(cfg.selectFields)
    .in("id", parsed.data.competitor_ids)
    .eq("workspace_id", workspaceId);
  const compList = ((competitors ?? []) as unknown) as C[];
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

  // SAFETY 2+3: concurrency cap + cooldown
  const filterResult = await filterEligibleBrands<C>({
    brands: compList,
    workspaceId,
    source: cfg.source,
    admin,
    hasChannelConfig: cfg.hasChannelConfig,
  });
  if (filterResult.headroom === 0) {
    return NextResponse.json(
      {
        error: `Hai gia' ${CONCURRENCY_CAP_PER_WORKSPACE} scan ${cfg.channelLabel} in corso (max per workspace). Aspetta che ne finisca qualcuno.`,
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

  // SAFETY 4: atomic credit charge
  const charge = await chargeBatchCredits(
    user.id,
    cfg.source,
    toLaunch.length,
    `${cfg.channelLabel} batch scan x${toLaunch.length}`,
  );
  if (!charge.ok) {
    return NextResponse.json(
      {
        error: `Crediti insufficienti per ${toLaunch.length} scan ${cfg.channelLabel}. Saldo dopo rollback: ${charge.balance}.`,
        balance: charge.balance,
        needed: toLaunch.length,
      },
      { status: 402 },
    );
  }

  const batchId = randomUUID();

  // Pre-create job rows (status='running', batch_id stamped) per ogni
  // brand del batch. Il per-brand scan riceve job_id e lo aggiorna.
  const jobRows = toLaunch.map((c) => ({
    workspace_id: c.workspace_id,
    competitor_id: c.id,
    status: "running",
    source: cfg.source,
    batch_id: batchId,
    date_from: parsed.data.date_from ?? null,
    date_to: parsed.data.date_to ?? null,
    created_by: user.id,
  }));
  const { data: insertedJobs, error: insertErr } = await admin
    .from("mait_scrape_jobs")
    .insert(jobRows)
    .select("id, competitor_id");
  if (insertErr || !insertedJobs) {
    // Rollback charges su fallimento massivo (es. unique violation
    // su uno qualunque dei brand → l'intero insert fallisce). Refund
    // tutti i crediti chargati, niente scan parte.
    for (let i = 0; i < toLaunch.length; i++) {
      await refundOneBatchCredit(
        user.id,
        cfg.source,
        `${cfg.channelLabel} batch insert failed`,
      );
    }
    return NextResponse.json(
      {
        error: `Insert job row falliti: ${insertErr?.message ?? "unknown"}. Probabile concurrency conflict — riprova tra qualche secondo.`,
      },
      { status: 500 },
    );
  }

  const compToJob = new Map<string, string>();
  for (const j of insertedJobs as Array<{ id: string; competitor_id: string }>) {
    compToJob.set(j.competitor_id, j.id);
  }

  // Auth cookie forwarding per le internal fetch
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) {
    // Refund tutti i charge, mark tutti i job come failed.
    for (const c of toLaunch) {
      const jobId = compToJob.get(c.id);
      if (jobId) {
        await admin
          .from("mait_scrape_jobs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error: "NEXT_PUBLIC_APP_URL non configurato sul deploy",
          })
          .eq("id", jobId);
      }
      await refundOneBatchCredit(
        user.id,
        cfg.source,
        `${cfg.channelLabel} batch: app URL missing`,
      );
    }
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL non configurato." },
      { status: 503 },
    );
  }

  const started: Array<{ competitor_id: string; job_id: string; page_name: string | null }> = [];

  // Fire-and-forget: lanciamo TUTTE le fetch in parallelo con
  // keepalive + abort 3s. La request raggiunge il container, parte
  // la function (con suo maxDuration 300s), il batch endpoint puo'
  // tornare subito senza aspettare lo scan completo.
  await Promise.all(
    toLaunch.map(async (c) => {
      const jobId = compToJob.get(c.id);
      if (!jobId) return;
      const ctrl = new AbortController();
      const tmr = setTimeout(() => ctrl.abort(), 3000);
      const extraBody = cfg.buildScanBody ? cfg.buildScanBody(c, parsed.data) : {};
      try {
        await fetch(`${appUrl}${cfg.internalScanPath}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: cookieHeader,
          },
          body: JSON.stringify({
            competitor_id: c.id,
            batched: true,
            job_id: jobId,
            date_from: parsed.data.date_from,
            date_to: parsed.data.date_to,
            ...extraBody,
          }),
          signal: ctrl.signal,
          keepalive: true,
        });
        started.push({ competitor_id: c.id, job_id: jobId, page_name: c.page_name });
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (isAbort) {
          // Expected: 3s abort dopo che la request e' partita.
          started.push({ competitor_id: c.id, job_id: jobId, page_name: c.page_name });
        } else {
          // Fetch fallita davvero (es. DNS fail, network error). Mark
          // il job come failed e refund.
          console.error(
            `[Batch ${cfg.channelLabel}] dispatch failed for ${c.id}:`,
            err instanceof Error ? err.message : err,
          );
          await admin
            .from("mait_scrape_jobs")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              error: err instanceof Error ? err.message : "Dispatch failed",
            })
            .eq("id", jobId);
          await refundOneBatchCredit(
            user.id,
            cfg.source,
            `${cfg.channelLabel} dispatch failed: ${c.page_name}`,
          );
          skipped.push({
            competitor_id: c.id,
            page_name: c.page_name,
            reason: "start_failed",
            detail: err instanceof Error ? err.message : "Dispatch failed",
          });
        }
      } finally {
        clearTimeout(tmr);
      }
    }),
  );

  console.log(
    `[Batch ${cfg.channelLabel}] batchId=${batchId} started=${started.length} skipped=${skipped.length}`,
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
      credits_charged: charge.ok ? charge.charged : 0,
    },
  });
}

/**
 * GET handler condiviso: ritorna lo stato del batch in modo
 * polling-friendly. Stessa shape di /api/snapchat/scan/batch e
 * /api/apify/scan-google/batch.
 */
export async function getBatchStatus(req: Request, source: BatchSource) {
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
    .eq("source", source)
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
