/**
 * Collaborazioni L2 + L3 — tipi e logica PURA condivisa client/server.
 *
 * Niente import server-side (no Supabase, no Apify, no OpenRouter) cosi'
 * sia il pannello React (preview di costo) sia la API route (addebito
 * crediti reale) usano LE STESSE regole "cosa va arricchito / cosa va
 * classificato". Single source of truth = nessun mismatch tra il
 * preventivo mostrato e quello effettivamente caricato.
 *
 * La riga DB vive in mait_collab_accounts (migration 0058).
 */

export type CollabPlatform = "instagram" | "tiktok";

export type CollabClassification =
  | "brand"
  | "influencer"
  | "celebrity"
  | "staff"
  | "unknown";

export type CollabTier = "nano" | "mid" | "macro" | "mega";

export type CollabEnrichStatus = "ok" | "not_found" | "error";

/** Forma della riga cache cosi' come torna dalla GET (date come ISO). */
export interface CollabAccount {
  handle: string;
  platform: CollabPlatform;
  // L3
  full_name: string | null;
  biography: string | null;
  category: string | null;
  verified: boolean | null;
  followers_count: number | null;
  tier: CollabTier | null;
  profile_pic_url: string | null;
  external_url: string | null;
  enriched_at: string | null;
  enrich_status: CollabEnrichStatus | null;
  // L2
  classification: CollabClassification | null;
  classification_confidence: number | null;
  classification_reason: string | null;
  classified_at: string | null;
}

/**
 * Piattaforme dove l'enrichment L3 e' realmente disponibile oggi.
 * Instagram live (scrapeInstagramProfile). TikTok arrivera' con un
 * actor profilo dedicato — fino ad allora gli account TikTok NON
 * contano nel costo di enrichment e la UI non promette dati profilo.
 */
export const ENRICH_PLATFORMS: readonly CollabPlatform[] = ["instagram"];

/** Re-enrich / re-classify dopo questo numero di giorni (follower e
 *  classifica cambiano lento; 90gg e' il punto di freschezza scelto
 *  in project_open_followups.md). */
export const STALE_DAYS = 90;

function isStale(iso: string | null, days = STALE_DAYS): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > days * 86_400_000;
}

/**
 * Un account va (ri)arricchito se: mai tentato, l'ultimo tentativo e'
 * fallito con errore transitorio, o il dato e' stale. Un 'not_found'
 * recente NON si ri-tenta (l'account e' privato/inesistente: ritentare
 * brucia crediti per nulla finche' non scade la staleness).
 */
export function needsEnrichment(row: CollabAccount | undefined | null): boolean {
  if (!row || !row.enriched_at) return true;
  if (row.enrich_status === "error") return true;
  return isStale(row.enriched_at);
}

/**
 * Un account va (ri)classificato se: mai classificato, l'enrichment e'
 * piu' recente della classifica (ora abbiamo bio/follower → input
 * migliore), o la classifica e' stale.
 */
export function needsClassification(
  row: CollabAccount | undefined | null,
): boolean {
  if (!row || !row.classified_at) return true;
  if (
    row.enriched_at &&
    new Date(row.enriched_at).getTime() > new Date(row.classified_at).getTime()
  ) {
    return true;
  }
  return isStale(row.classified_at);
}

/**
 * Tier dimensionale dai follower. Soglie standard influencer marketing:
 *   nano < 10k | mid 10k–100k | macro 100k–1M | mega ≥ 1M
 * (stesse soglie documentate nel check della migration 0058).
 */
export function computeTier(followers: number | null | undefined): CollabTier | null {
  if (followers == null || !Number.isFinite(followers) || followers < 0) {
    return null;
  }
  if (followers < 10_000) return "nano";
  if (followers < 100_000) return "mid";
  if (followers < 1_000_000) return "macro";
  return "mega";
}
