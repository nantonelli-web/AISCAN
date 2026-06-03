/**
 * Safety helpers per i batch multi-brand scan.
 *
 * Centralizza i controlli di sicurezza che proteggono il workspace da
 * runaway spending: cooldown per-brand, concurrency cap, daily cost
 * cap, batch size cap, credit charge atomico con rollback.
 *
 * Estratto dalla logica originale di /api/apify/scan-google/batch
 * (commit 5277519 del 2026-05-11). Adesso shared per Google +
 * Snapchat (e altri canali quando passeranno alla pipeline async).
 *
 * **Importante**: ogni nuovo batch route DEVE usare questo helper —
 * NON re-implementare safety checks inline. Memory rule
 * "feedback_no_runaway_scan_spending".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import type { CreditAction } from "@/config/pricing";
import { creditCosts } from "@/config/pricing";
import { logger } from "@/lib/logger";

/** Canali supportati nel batch scan. Estendere quando un canale
 *  passa alla pipeline async (richiede webhook Apify configurato +
 *  resume support per evitare timeout Vercel maxDuration 300s). */
export type BatchSource =
  | "google"
  | "meta"
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "youtube"
  // Canali paid per-brand (DSA library). Stesso modello per-brand dei
  // canali sopra: competitor_id + last_seen_in_scan_at sulle rispettive
  // tabelle (mait_tiktok_ads / mait_snapchat_ads).
  | "tiktok_ads"
  | "snapchat_ads";

/** Cap massimo brand per chiamata batch — limite duro, niente bypass.
 *  Eccederlo significa lanciare troppi scan in parallelo, potenziale
 *  abuso, costi imprevisti. Se l'utente serve di piu', deve fare
 *  batch ripetuti. */
export const BATCH_MAX = 10;

/** Default daily cost cap del workspace ($USD). Sovrascrivibile via
 *  env var APIFY_DAILY_COST_CAP_USD. Se 0 → cap disabilitato. */
const DEFAULT_DAILY_CAP_USD = 50;

/** Concurrency cap: max scan paralleli del SAME source per workspace.
 *  Oltre questo cap, eligible brand in eccesso vengono skippati con
 *  reason "concurrency_cap" — niente credit charge. */
export const CONCURRENCY_CAP_PER_WORKSPACE = 8;

/** Cooldown per-brand in ore: se il brand ha avuto uno scan
 *  succeeded/partial/running negli ultimi N ore, lo skippiamo con
 *  reason "recent_scan". Diversificato per canale: Google/Meta/SC
 *  6h (scan piu' veloci, refresh accettabile), IG/TT/YT 12h
 *  (canali piu' lenti, dati cambiano meno frequentemente). */
export function cooldownHoursForSource(source: BatchSource): number {
  switch (source) {
    case "google":
    case "meta":
    case "snapchat":
    case "tiktok_ads":
    case "snapchat_ads":
      return 6;
    case "instagram":
    case "tiktok":
    case "youtube":
      return 12;
  }
}

/** Action string mapped to credits/consume.ts conventions. */
function actionForSource(source: BatchSource): CreditAction {
  return `scan_${source}` as CreditAction;
}

/** Costo crediti per singolo scan, per canale. Letto direttamente da
 *  config/pricing.ts (creditCosts) — un'unica fonte di verita'. */
export function creditsPerScan(source: BatchSource): number {
  return creditCosts[actionForSource(source)] ?? 0;
}

export interface SkipReason {
  competitor_id: string;
  page_name: string | null;
  reason:
    | "no_config"
    | "recent_scan"
    | "already_running"
    | "concurrency_cap"
    | "start_failed";
  detail?: string;
}

export interface DailyCostCheckResult {
  ok: boolean;
  spent: number;
  cap: number;
}

/**
 * Verifica daily cost cap del workspace. Ritorna ok=false se sum(
 * cost_cu) negli ultimi 24h supera il cap. La route deve abortire
 * con HTTP 429 in quel caso.
 *
 * Cap=0 (or <=0) → cap disabilitato, sempre ok=true.
 */
export async function checkDailyCostCap(
  workspaceId: string,
  admin: SupabaseClient,
): Promise<DailyCostCheckResult> {
  const cap = Number.parseFloat(
    process.env.APIFY_DAILY_COST_CAP_USD ?? String(DEFAULT_DAILY_CAP_USD),
  );
  if (!Number.isFinite(cap) || cap <= 0) {
    return { ok: true, spent: 0, cap: -1 };
  }
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data, error } = await admin
    .from("mait_scrape_jobs")
    .select("cost_cu")
    .eq("workspace_id", workspaceId)
    .gt("started_at", since);
  // Fail CLOSED on a DB error: if we can't prove the workspace is under
  // budget, don't launch a paid Apify run. (Unlike the rate limiter,
  // which fails open — here the downside is real money, and a DB error
  // usually means we can't scan anyway.)
  if (error) {
    logger.error(
      "Daily cost-cap query failed (fail-closed — scan blocked)",
      { channel: "batch-safety", event: "cost_cap.daily.query_failed", workspaceId },
      error,
    );
    return { ok: false, spent: -1, cap };
  }
  const spent = (data ?? []).reduce(
    (s: number, j: { cost_cu: number | null }) => s + Number(j.cost_cu ?? 0),
    0,
  );
  return { ok: spent < cap, spent, cap };
}

/**
 * GLOBAL (whole-account) Apify daily spend ceiling. Every per-workspace
 * cap multiplies by the number of workspaces, so without a global ceiling
 * total spend on the one shared Apify token is unbounded as tenants grow.
 *
 * Disabled unless APIFY_GLOBAL_DAILY_COST_CAP_USD is set (>0), so this is
 * a no-op until you opt in — then it caps the SUM of cost_cu across ALL
 * workspaces in the last 24h. Fail-closed on a DB error.
 */
export async function checkGlobalCostCap(
  admin: SupabaseClient,
): Promise<DailyCostCheckResult> {
  const cap = Number.parseFloat(
    process.env.APIFY_GLOBAL_DAILY_COST_CAP_USD ?? "",
  );
  if (!Number.isFinite(cap) || cap <= 0) {
    return { ok: true, spent: 0, cap: -1 };
  }
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data, error } = await admin
    .from("mait_scrape_jobs")
    .select("cost_cu")
    .gt("started_at", since);
  if (error) {
    logger.error(
      "Global cost-cap query failed (fail-closed — scan blocked)",
      { channel: "batch-safety", event: "cost_cap.global.query_failed" },
      error,
    );
    return { ok: false, spent: -1, cap };
  }
  const spent = (data ?? []).reduce(
    (s: number, j: { cost_cu: number | null }) => s + Number(j.cost_cu ?? 0),
    0,
  );
  return { ok: spent < cap, spent, cap };
}

/**
 * GLOBAL Apify concurrency ceiling: total running scrape jobs across ALL
 * workspaces. Protects the shared Apify account's max-concurrent-runs
 * limit (per-workspace cap of 8 × N workspaces is otherwise unbounded).
 *
 * Disabled unless APIFY_GLOBAL_CONCURRENCY is set (>0). Fail-closed on error.
 */
export async function checkGlobalConcurrency(
  admin: SupabaseClient,
): Promise<{ ok: boolean; running: number; cap: number }> {
  const cap = Number.parseInt(process.env.APIFY_GLOBAL_CONCURRENCY ?? "", 10);
  if (!Number.isFinite(cap) || cap <= 0) {
    return { ok: true, running: 0, cap: -1 };
  }
  const { count, error } = await admin
    .from("mait_scrape_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running");
  if (error) {
    logger.error(
      "Global concurrency query failed (fail-closed — scan blocked)",
      { channel: "batch-safety", event: "concurrency.global.query_failed" },
      error,
    );
    return { ok: false, running: -1, cap };
  }
  return { ok: (count ?? 0) < cap, running: count ?? 0, cap };
}

/**
 * Conta gli scan running del canale specifico per il workspace.
 * Usato per applicare il concurrency cap.
 */
export async function getRunningCount(
  workspaceId: string,
  source: BatchSource,
  admin: SupabaseClient,
): Promise<number> {
  const { data } = await admin
    .from("mait_scrape_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("source", source)
    .eq("status", "running");
  return (data ?? []).length;
}

/**
 * Carica gli scan recenti del canale (succeeded/partial/running)
 * per il workspace nelle ultime N ore. Usato per applicare il
 * cooldown per-brand: se un brand ha uno scan in questa mappa, lo
 * skippiamo.
 */
export async function getRecentJobsForCooldown(
  workspaceId: string,
  source: BatchSource,
  hours: number,
  admin: SupabaseClient,
): Promise<Map<string, { startedAt: string; status: string }>> {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const { data } = await admin
    .from("mait_scrape_jobs")
    .select("competitor_id, started_at, status")
    .eq("workspace_id", workspaceId)
    .eq("source", source)
    .in("status", ["succeeded", "partial", "running"])
    .gt("started_at", since);
  const map = new Map<string, { startedAt: string; status: string }>();
  for (const j of (data ?? []) as Array<{
    competitor_id: string | null;
    started_at: string;
    status: string;
  }>) {
    if (j.competitor_id) {
      map.set(j.competitor_id, {
        startedAt: j.started_at,
        status: j.status,
      });
    }
  }
  return map;
}

/**
 * Charge atomico di N crediti per il batch. Se in qualunque punto
 * mid-batch i crediti non bastano, FA ROLLBACK di tutto quanto
 * gia' charged → ritorna {ok: false, balance, chargedBeforeRollback}.
 *
 * Per canali con cost=0 (es. Snapchat) skippa il charge e ritorna
 * subito ok=true.
 */
export async function chargeBatchCredits(
  userId: string,
  source: BatchSource,
  count: number,
  label: string,
): Promise<
  | { ok: true; charged: number }
  | { ok: false; balance: number; chargedBeforeRollback: number }
> {
  if (creditsPerScan(source) === 0 || count <= 0) {
    return { ok: true, charged: 0 };
  }
  const action = actionForSource(source);
  let charged = 0;
  for (let i = 0; i < count; i++) {
    const r = await consumeCredits(
      userId,
      action,
      `${label} (${i + 1}/${count})`,
    );
    if (!r.ok) {
      // Rollback all charged so far
      for (let k = 0; k < charged; k++) {
        await refundCredits(
          userId,
          action,
          `${label}: insufficient mid-batch rollback`,
        );
      }
      return {
        ok: false,
        balance: r.balance,
        chargedBeforeRollback: charged,
      };
    }
    charged++;
  }
  return { ok: true, charged };
}

/**
 * Refund di un singolo credito per uno scan fallito in batch.
 * No-op per canali con cost=0.
 */
export async function refundOneBatchCredit(
  userId: string,
  source: BatchSource,
  label: string,
): Promise<void> {
  if (creditsPerScan(source) === 0) return;
  await refundCredits(userId, actionForSource(source), label);
}

/**
 * Helper composito: applica TUTTI i safety checks pre-launch ai brand
 * passati come input. Non lancia nulla, NON fa charge crediti: solo
 * filtra eligible vs skipped.
 *
 * La route batch chiamante poi:
 *   1. Valida competitor.length <= BATCH_MAX
 *   2. Chiama questo helper per ottenere eligible[] / skipped[]
 *   3. Charge crediti per eligible.length
 *   4. Lancia gli scan
 *
 * `hasChannelConfig(c)` predicato che ritorna true se il brand ha la
 * configurazione necessaria per scansionare il canale richiesto (es.
 * Snapchat richiede snapchat_handle). Esposto come callback perche'
 * ogni canale ha campi diversi.
 */
export async function filterEligibleBrands<C extends { id: string; page_name: string | null }>(args: {
  brands: C[];
  workspaceId: string;
  source: BatchSource;
  admin: SupabaseClient;
  hasChannelConfig: (c: C) => boolean;
}): Promise<{
  eligible: C[];
  skipped: SkipReason[];
  headroom: number;
}> {
  const { brands, workspaceId, source, admin, hasChannelConfig } = args;

  // Concurrency check
  const running = await getRunningCount(workspaceId, source, admin);
  const headroom = Math.max(0, CONCURRENCY_CAP_PER_WORKSPACE - running);

  // Recent jobs (cooldown)
  const recentByComp = await getRecentJobsForCooldown(
    workspaceId,
    source,
    cooldownHoursForSource(source),
    admin,
  );

  const skipped: SkipReason[] = [];
  const eligibleAll: C[] = [];

  for (const c of brands) {
    if (!hasChannelConfig(c)) {
      skipped.push({
        competitor_id: c.id,
        page_name: c.page_name,
        reason: "no_config",
      });
      continue;
    }
    const recent = recentByComp.get(c.id);
    if (recent) {
      if (recent.status === "running") {
        skipped.push({
          competitor_id: c.id,
          page_name: c.page_name,
          reason: "already_running",
        });
      } else {
        const hoursAgo = Math.round(
          (Date.now() - new Date(recent.startedAt).getTime()) / 3_600_000,
        );
        skipped.push({
          competitor_id: c.id,
          page_name: c.page_name,
          reason: "recent_scan",
          detail: `Scansionato ${hoursAgo}h fa (cooldown ${cooldownHoursForSource(source)}h)`,
        });
      }
      continue;
    }
    eligibleAll.push(c);
  }

  // Apply concurrency headroom
  const eligible = eligibleAll.slice(0, headroom);
  const excess = eligibleAll.slice(headroom);
  for (const c of excess) {
    skipped.push({
      competitor_id: c.id,
      page_name: c.page_name,
      reason: "concurrency_cap",
      detail: `Cap workspace ${CONCURRENCY_CAP_PER_WORKSPACE} scan ${source} contemporanei`,
    });
  }

  return { eligible, skipped, headroom };
}
