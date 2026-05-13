import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sub-brand attribution splitter.
 *
 * Trova tutti i sub-brand del workspace che hanno
 * `parent_brand_id === <parentId>` e ri-assegna le ads matching i
 * loro `attribution_url_patterns` (regex su landing_url) al sub-brand
 * corretto. Chiamato dopo ogni scan Google completato del parent.
 *
 * Idempotente: usa UPDATE WHERE competitor_id = parent AND match
 * pattern, quindi puo' essere richiamato N volte senza side-effect.
 *
 * Esempio: scan di Marina Rinaldi → Persona ha parent_brand_id =
 * Marina + attribution_url_patterns = array['/persona([/?-]|$)']
 * → tutte le ads sotto Marina con landing_url che matcha il pattern
 * vengono spostate a Persona.
 *
 * Logga il count di ads riassegnate per sub-brand (utile debug).
 */
export async function applySubBrandAttribution(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    parentBrandId: string;
    source?: "google" | "meta";
  },
): Promise<{ subBrand: string; moved: number }[]> {
  const source = args.source ?? "google";

  // Carica tutti i sub-brand del parent
  const { data: subBrands, error: subErr } = await supabase
    .from("mait_competitors")
    .select("id, page_name, attribution_url_patterns")
    .eq("workspace_id", args.workspaceId)
    .eq("parent_brand_id", args.parentBrandId)
    .not("attribution_url_patterns", "is", null);
  if (subErr) {
    console.error(
      "[sub-brand-attribution] subBrands lookup failed:",
      subErr.message,
    );
    return [];
  }
  type SubBrand = {
    id: string;
    page_name: string | null;
    attribution_url_patterns: string[] | null;
  };
  const subs = ((subBrands as SubBrand[] | null) ?? []).filter(
    (s) => Array.isArray(s.attribution_url_patterns) && s.attribution_url_patterns.length > 0,
  );
  if (subs.length === 0) return [];

  const results: { subBrand: string; moved: number }[] = [];
  for (const sub of subs) {
    const patterns = sub.attribution_url_patterns ?? [];
    if (patterns.length === 0) continue;
    // Combine into single regex alternation: (p1)|(p2)|...
    // PostgreSQL ~* operator: case-insensitive POSIX match.
    const combined = patterns.map((p) => `(${p})`).join("|");
    // UPDATE returning ids: cosi' contiamo quante righe abbiamo mosso.
    const { data, error } = await supabase
      .from("mait_ads_external")
      .update({ competitor_id: sub.id })
      .eq("workspace_id", args.workspaceId)
      .eq("competitor_id", args.parentBrandId)
      .eq("source", source)
      .filter("landing_url", "~*", combined)
      .select("id");
    if (error) {
      console.error(
        `[sub-brand-attribution] update failed for sub ${sub.id} (${sub.page_name}):`,
        error.message,
      );
      continue;
    }
    const moved = (data as { id: string }[] | null)?.length ?? 0;
    if (moved > 0) {
      console.log(
        `[sub-brand-attribution] moved ${moved} ads from parent ${args.parentBrandId} → sub ${sub.id} (${sub.page_name}) — patterns: ${patterns.join("|")}`,
      );
    }
    results.push({
      subBrand: sub.page_name ?? sub.id,
      moved,
    });
  }
  return results;
}
