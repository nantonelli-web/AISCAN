import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applySubBrandAttribution } from "@/lib/apify/sub-brand-attribution";

/**
 * POST /api/competitors/[id]/apply-attribution
 *
 * Triggera manualmente lo splitter sub-brand per il brand identificato
 * da [id]. Usato dal bottone "Riassegna ora" nella pagina edit brand
 * quando l'utente vuole applicare le sue rules attribution_url_patterns
 * subito, senza aspettare il prossimo scan.
 *
 * Lo splitter applica le rules ALL'INDIETRO: scansiona le ads del
 * parent del brand corrente e ri-assegna quelle che matchano i pattern
 * di QUESTO brand (sub-brand).
 */
export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: brand } = await admin
    .from("mait_competitors")
    .select("id, workspace_id, parent_brand_id, attribution_url_patterns")
    .eq("id", id)
    .maybeSingle();
  type Brand = {
    id: string;
    workspace_id: string;
    parent_brand_id: string | null;
    attribution_url_patterns: string[] | null;
  };
  const b = brand as Brand | null;
  if (!b) {
    return NextResponse.json({ error: "Brand non trovato" }, { status: 404 });
  }
  if (!b.parent_brand_id) {
    return NextResponse.json(
      {
        error:
          "Questo brand non ha un parent_brand_id. Configurare la sezione 'Sub-brand attribution' prima di applicare.",
      },
      { status: 400 },
    );
  }
  if (!b.attribution_url_patterns || b.attribution_url_patterns.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nessun pattern URL configurato. Aggiungere almeno un pattern prima di applicare.",
      },
      { status: 400 },
    );
  }
  const moved = await applySubBrandAttribution(admin, {
    workspaceId: b.workspace_id,
    parentBrandId: b.parent_brand_id,
    source: "google",
  });
  // Filtra per ID del brand corrente — i siblings (altri sub-brand
  // dello stesso parent) sono in `moved[]` ma non ci interessano nel
  // toast. Bug originale: moved.find(m => m.subBrand !== null) prendeva
  // sempre il primo sub-brand del parent, non THIS brand.
  const thisSub = moved.find((m) => m.subBrandId === id);
  return NextResponse.json({
    ok: true,
    moved_for_this_brand: thisSub?.moved ?? 0,
    all_subs: moved,
  });
}
