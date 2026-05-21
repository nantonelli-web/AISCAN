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
import { NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundCredits } from "@/lib/credits/consume";
import type { CreditAction } from "@/config/pricing";
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

/**
 * Auto-cleanup zombi Pattern B: prima di ogni batch, marca i job
 * 'running' del workspace con batch_id stamped + source corrente
 * + started_at >10min ago come failed e rifonde i crediti.
 *
 * Soglia 10 min e' deliberatamente piu' alta del maxDuration=300s
 * del per-brand /scan, cosi' job legittimi in corso non vengono
 * mai colpiti per errore.
 */
async function cleanupZombieJobs(
  workspaceId: string,
  source: BatchSource,
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ cleaned: number; refunded: number }> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: zombies } = await admin
    .from("mait_scrape_jobs")
    .select("id, source, created_by")
    .eq("workspace_id", workspaceId)
    .eq("source", source)
    .eq("status", "running")
    .not("batch_id", "is", null)
    .lt("started_at", cutoff);

  const list = (zombies ?? []) as Array<{
    id: string;
    source: string;
    created_by: string | null;
  }>;
  if (list.length === 0) return { cleaned: 0, refunded: 0 };

  let refunded = 0;
  for (const z of list) {
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "Auto-cleanup zombie (batch dispatch failed >10min ago)",
      })
      .eq("id", z.id);
    if (z.created_by) {
      try {
        await refundCredits(
          z.created_by,
          `scan_${z.source}` as CreditAction,
          `Auto-cleanup zombie ${z.source} scan`,
        );
        refunded++;
      } catch (e) {
        console.error(`[batch auto-cleanup] refund failed for ${z.id}:`, e);
      }
    }
  }
  console.log(
    `[batch auto-cleanup] source=${source} cleaned=${list.length} refunded=${refunded}`,
  );
  return { cleaned: list.length, refunded };
}

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
  /** Path canonico della rotta /scan per-brand. Usato SOLO come stringa
   *  identificativa nel Request synthesizzato (NEXT_PUBLIC_APP_URL +
   *  questo path). Non viene mai fetched via HTTP. */
  internalScanPath: string;
  /** Handler diretto della rotta /scan per-brand (POST function importata
   *  dal route module). Chiamato direttamente da after() senza HTTP.
   *  Vedi 2026-05-20: il pattern fetch+keepalive su Vercel non riusciva
   *  ad attivare il container target. Direct call bypassa il problema. */
  scanHandler: (req: Request) => Promise<Response>;
  /** Costruisce il body JSON aggiuntivo da passare al per-brand scan.
   *  Il flag `batched: true` + `job_id` + date vengono aggiunti automa-
   *  ticamente da dispatchAsyncBatch. */
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

  // PRE-FLIGHT: auto-cleanup zombie del SAME source (Pattern B
  // safeguard, vedi cleanupZombieJobs sopra). Cosi' un batch
  // precedente fallito non blocca i nuovi tentativi.
  await cleanupZombieJobs(workspaceId, cfg.source, admin);

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

  // Niente piu' cookie forwarding ne' appUrl — le scan vengono
  // chiamate via direct function call dentro after(), che mantiene
  // accesso ai cookies() del request originale via next/headers
  // context.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || "http://localhost";

  // Lista dei brand per cui consideriamo lo scan "lanciato" — il
  // batch endpoint torna SUBITO al client con questa lista,
  // mentre il vero dispatch via fetch avviene in after() dopo
  // la response.
  const started = toLaunch
    .map((c) => {
      const jobId = compToJob.get(c.id);
      return jobId
        ? { competitor_id: c.id, job_id: jobId, page_name: c.page_name }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  console.log(
    `[Batch ${cfg.channelLabel}] batchId=${batchId} pre-dispatch started=${started.length}`,
  );

  // CRITICO: usiamo Next.js after() per schedulare le fetch DOPO
  // aver risposto al client. La funzione vive fino a maxDuration
  // grazie a after() — possiamo awaitare le 10 scan in parallelo
  // (~90s ognuna) senza tenere bloccato il client.
  //
  // Perche' non fire-and-forget con keepalive+abort: in Vercel
  // Node runtime, quando il batch endpoint risponde, il container
  // puo' uccidere le fetch in-flight ANCHE con keepalive=true,
  // specialmente se abortite immediatamente (il container vede
  // la connection chiusa client-side e non avvia il /scan).
  // Risultato: il /scan container non viene mai invocato, lo scan
  // non parte mai. Bug osservato in produzione 2026-05-20.
  //
  // after() risolve mantenendo viva la function batch per tutto
  // maxDuration, durante il quale le fetch verso /scan partono
  // davvero, raggiungono il container target, attivano la
  // function destinataria che fa il suo full 300s di lavoro
  // indipendentemente.
  const launchedAt = new Date().toISOString();

  after(async () => {
    console.log(
      `[Batch ${cfg.channelLabel}] after() entered, dispatching ${toLaunch.length} scans via direct call`,
    );
    await Promise.allSettled(
      toLaunch.map(async (c) => {
        const jobId = compToJob.get(c.id);
        if (!jobId) return;
        const extraBody = cfg.buildScanBody ? cfg.buildScanBody(c, parsed.data) : {};
        try {
          // DIRECT CALL: niente fetch HTTP, chiamiamo la funzione
          // POST del scan route direttamente con un Request synthesi-
          // zzato. cookies()/headers() rimangono accessibili nel
          // after() context, quindi il createClient() dentro la
          // scan route vede gli stessi cookie dell'utente che ha
          // lanciato il batch.
          const req = new Request(`${appUrl}${cfg.internalScanPath}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              competitor_id: c.id,
              batched: true,
              job_id: jobId,
              date_from: parsed.data.date_from,
              date_to: parsed.data.date_to,
              ...extraBody,
            }),
          });
          const res = await cfg.scanHandler(req);
          const elapsed = Math.round((Date.now() - new Date(launchedAt).getTime()) / 1000);
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.error(
              `[Batch ${cfg.channelLabel}] scan ${c.id} non-2xx: ${res.status} ${txt.slice(0, 200)} (after ${elapsed}s)`,
            );
          } else {
            console.log(
              `[Batch ${cfg.channelLabel}] scan ${c.id} completed (took ${elapsed}s)`,
            );
          }
        } catch (err) {
          console.error(
            `[Batch ${cfg.channelLabel}] dispatch error for ${c.id}:`,
            err instanceof Error ? err.message : err,
          );
          // Mark il job come failed e refund — la scan handler ha
          // lanciato un'eccezione invece di gestire l'errore.
          await admin
            .from("mait_scrape_jobs")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              error: err instanceof Error ? err.message : "Dispatch failed",
            })
            .eq("id", jobId)
            .eq("status", "running");
          await refundOneBatchCredit(
            user.id,
            cfg.source,
            `${cfg.channelLabel} dispatch failed: ${c.page_name}`,
          );
        }
      }),
    );
    console.log(
      `[Batch ${cfg.channelLabel}] after() finished, batchId=${batchId}`,
    );
  });

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
 * Reconcile auto: per i job 'running' del batch piu' vecchi di
 * 5 minuti, controlla se ci sono record salvati nella tabella
 * dati per quel competitor dopo job.started_at. Se si' → mark
 * 'succeeded' con il count reale. Se no → mark 'failed' + refund.
 *
 * Necessario perche' su Vercel un singolo scan Pattern B che
 * dura piu' del maxDuration del batch endpoint (300s) viene
 * killato a meta', lasciando il job in 'running' indefinitamente
 * anche se Apify ha gia' completato e potrebbe aver salvato i
 * dati nel DB (l'update di status pero' non e' arrivato).
 */
async function reconcileStuckBatchJobs(
  batchId: string,
  source: BatchSource,
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ reconciled: number; recovered: number; failed: number }> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: stuck } = await admin
    .from("mait_scrape_jobs")
    .select("id, competitor_id, source, created_by, started_at")
    .eq("batch_id", batchId)
    .eq("source", source)
    .eq("status", "running")
    .lt("started_at", cutoff);

  const list = (stuck ?? []) as Array<{
    id: string;
    competitor_id: string;
    source: string;
    created_by: string | null;
    started_at: string;
  }>;
  if (list.length === 0) return { reconciled: 0, recovered: 0, failed: 0 };

  // Mappa source → query: dove andare a cercare i record per capire
  // se lo scan ha salvato qualcosa prima di essere killato.
  let recovered = 0;
  let failed = 0;
  for (const j of list) {
    let count = 0;
    if (source === "instagram" || source === "tiktok" || source === "youtube") {
      const platform = source;
      const { count: c } = await admin
        .from("mait_organic_posts")
        .select("post_id", { count: "exact", head: true })
        .eq("competitor_id", j.competitor_id)
        .eq("platform", platform)
        .gt("created_at", j.started_at);
      count = c ?? 0;
    } else if (source === "meta") {
      const { count: c } = await admin
        .from("mait_ads_external")
        .select("ad_archive_id", { count: "exact", head: true })
        .eq("competitor_id", j.competitor_id)
        .gt("created_at", j.started_at);
      count = c ?? 0;
    }

    if (count > 0) {
      // Recovered — Apify completo' + l'upsert ando' bene, solo la
      // job-row update e' mancata.
      await admin
        .from("mait_scrape_jobs")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          records_count: count,
          error:
            "Recovered post-mortem (function timeout): records present in DB",
        })
        .eq("id", j.id);
      // Aggiorna anche last_scraped_at sul competitor — il
      // handler avrebbe fatto questo ma e' morto prima.
      await admin
        .from("mait_competitors")
        .update({ last_scraped_at: new Date().toISOString() })
        .eq("id", j.competitor_id);
      recovered++;
    } else {
      // No records: lo scan e' morto prima di salvare alcunche'.
      await admin
        .from("mait_scrape_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: "Stuck: function timeout, no records found in DB",
        })
        .eq("id", j.id);
      if (j.created_by) {
        try {
          await refundCredits(
            j.created_by,
            `scan_${j.source}` as CreditAction,
            `Batch reconcile: ${j.source} timeout`,
          );
        } catch (e) {
          console.error(`[batch reconcile] refund failed:`, e);
        }
      }
      failed++;
    }
  }
  console.log(
    `[batch reconcile] batchId=${batchId} source=${source} stuck=${list.length} recovered=${recovered} failed=${failed}`,
  );
  return { reconciled: list.length, recovered, failed };
}

/**
 * GET handler condiviso: ritorna lo stato del batch in modo
 * polling-friendly. Stessa shape di /api/snapchat/scan/batch e
 * /api/apify/scan-google/batch.
 *
 * Effetto collaterale: chiama reconcileStuckBatchJobs() per ripulire
 * job 'running' bloccati >5min. Cosi' la UI di polling vede un
 * batch progredire verso completion anche se le scan functions
 * sono state killate dal maxDuration timeout.
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

  // Reconcile auto i job stuck (function timeout) prima di ritornare
  // lo status — il polling polla ogni 8s, quindi al massimo l'utente
  // aspetta una decina di secondi prima che la UI mostri il vero
  // outcome dei job killati a meta'.
  await reconcileStuckBatchJobs(batchId, source, admin);

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
