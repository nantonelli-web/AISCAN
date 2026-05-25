/**
 * Collaborazioni L3 — enrichment dei profili collaboratori (server).
 *
 * Arricchisce gli account taggati (verified / follower / bio / categoria
 * / tier) scrapando il profilo via Apify, e fa l'upsert in
 * mait_collab_accounts. SOLO i campi L3 vengono scritti: l'upsert NON
 * tocca le colonne di classificazione L2 (Supabase aggiorna solo le
 * colonne presenti nel payload), cosi' re-enrichare non azzera la
 * classifica e viceversa.
 *
 * Instagram live (scrapeInstagramProfiles batch). TikTok non ancora
 * supportato: ritorna { skipped: true } finche' non scegliamo un actor
 * profilo TikTok. Vedi ENRICH_PLATFORMS in collab-intel.ts.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeInstagramProfiles } from "@/lib/instagram/service";
import {
  computeTier,
  ENRICH_PLATFORMS,
  type CollabPlatform,
} from "@/lib/organic/collab-intel";

export interface EnrichResult {
  /** true se la piattaforma non e' ancora supportata (es. TikTok). */
  skipped: boolean;
  enriched: number;
  notFound: number;
  /** Costo Apify del run in USD (diagnostica/log). */
  costCu: number;
}

/**
 * Arricchisce gli `handles` (gia' normalizzati: lowercase, no @) per la
 * piattaforma data e fa l'upsert. Il chiamante passa SOLO gli handle
 * che hanno davvero bisogno di enrichment (needsEnrichment) — qui non
 * ri-filtriamo per staleness.
 */
export async function enrichCollaborators(opts: {
  workspaceId: string;
  platform: CollabPlatform;
  handles: string[];
}): Promise<EnrichResult> {
  const { workspaceId, platform, handles } = opts;

  if (!ENRICH_PLATFORMS.includes(platform)) {
    // TikTok & co.: enrichment non disponibile, no-op (la
    // classificazione L2 girera' comunque sui soli handle).
    return { skipped: true, enriched: 0, notFound: 0, costCu: 0 };
  }
  if (handles.length === 0) {
    return { skipped: false, enriched: 0, notFound: 0, costCu: 0 };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // platform === 'instagram' (unica supportata oggi).
  const { profiles, costCu } = await scrapeInstagramProfiles(
    handles,
    workspaceId,
  );

  let enriched = 0;
  let notFound = 0;
  const rows = handles.map((handle) => {
    const p = profiles.get(handle.toLowerCase());
    if (!p) {
      notFound += 1;
      return {
        workspace_id: workspaceId,
        handle,
        platform,
        enriched_at: now,
        enrich_status: "not_found" as const,
        enrich_error: null,
        updated_at: now,
      };
    }
    enriched += 1;
    return {
      workspace_id: workspaceId,
      handle,
      platform,
      full_name: p.fullName,
      biography: p.biography,
      category: p.businessCategoryName,
      verified: p.verified,
      followers_count: p.followersCount,
      tier: computeTier(p.followersCount),
      profile_pic_url: p.profilePicUrl,
      external_url: p.externalUrl,
      enriched_at: now,
      enrich_status: "ok" as const,
      enrich_error: null,
      raw_profile: p as unknown as Record<string, unknown>,
      updated_at: now,
    };
  });

  const { error } = await admin
    .from("mait_collab_accounts")
    .upsert(rows, { onConflict: "workspace_id,handle,platform" });
  if (error) {
    console.error("[collab-enrich] upsert error:", error);
    throw new Error("collab enrichment upsert failed");
  }

  return { skipped: false, enriched, notFound, costCu };
}
