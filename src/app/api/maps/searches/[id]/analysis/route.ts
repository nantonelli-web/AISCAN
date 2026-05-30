import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import {
  consumeCreditsCustom,
  refundCreditsCustom,
} from "@/lib/credits/consume";
import { getLocale } from "@/lib/i18n/server";
import {
  comparisonSignature,
  runMapsAnalysis,
  MAPS_DEFAULT_OPENROUTER_ID,
  type MapsAnalysisMode,
  type MapsPlaceInput,
} from "@/lib/maps/analysis";

export const maxDuration = 150;

const postSchema = z.object({
  mode: z.enum(["intra_brand", "cross_brand"]),
  /** Internal mait_maps_places.id delle entità selezionate. */
  place_ids: z.array(z.string().uuid()).min(2).max(6),
  /** Slug del modello (mait_ai_models.model_id). Opzionale → fallback
   *  al più economico attivo, poi al default hardcoded. */
  model_id: z.string().min(1).max(120).optional(),
  /** Se true, rigenera ignorando la cache (ri-bilita). */
  force: z.boolean().optional(),
});

interface PlaceRow {
  id: string;
  place_id: string;
  title: string | null;
  normalized_domain: string | null;
  category_name: string | null;
  price: string | null;
  rank: number | null;
  total_score: number | null;
  reviews_count: number;
  permanently_closed: boolean;
  temporarily_closed: boolean;
  phone: string | null;
  website: string | null;
  image_url: string | null;
  address: string | null;
  popular_times:
    | Record<string, { hour: number; occupancyPercent: number }[]>
    | null;
}

/**
 * POST /api/maps/searches/[id]/analysis
 * Genera (o serve dalla cache) un report AI di confronto store per il
 * set di place selezionato. Cache key = (search_id, signature, model,
 * locale): re-aprire la stessa comparison NON ri-bilita.
 */
export async function POST(
  req: Request,
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
  const { profile } = await getSessionUser();
  if (!profile.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const locale = ((await getLocale()) as "it" | "en") ?? "it";
  const mode = parsed.data.mode as MapsAnalysisMode;

  const admin = createAdminClient();

  // 1. Ownership: la search deve appartenere al workspace dell'utente.
  const { data: search } = await admin
    .from("mait_maps_searches")
    .select("id, workspace_id")
    .eq("id", id)
    .maybeSingle();
  if (!search || search.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 2. Carica i place selezionati (vincolati a questa search) + review.
  const { data: placesRaw } = await admin
    .from("mait_maps_places")
    .select(
      "id, place_id, title, normalized_domain, category_name, price, rank, total_score, reviews_count, permanently_closed, temporarily_closed, phone, website, image_url, address, popular_times",
    )
    .eq("search_id", id)
    .in("id", parsed.data.place_ids);
  const placeRows = (placesRaw ?? []) as PlaceRow[];
  if (placeRows.length < 2) {
    return NextResponse.json(
      { error: "Select at least 2 valid places from this search" },
      { status: 400 },
    );
  }

  const internalIds = placeRows.map((p) => p.id);
  const { data: reviewsRaw } = await admin
    .from("mait_maps_reviews")
    .select(
      "place_id, stars, text, text_translated, response_from_owner_text",
    )
    .in("place_id", internalIds);
  const reviewsByPlace = new Map<string, MapsPlaceInput["reviews"]>();
  for (const r of (reviewsRaw ?? []) as ({
    place_id: string;
  } & MapsPlaceInput["reviews"][number])[]) {
    const list = reviewsByPlace.get(r.place_id) ?? [];
    list.push({
      stars: r.stars,
      text: r.text,
      text_translated: r.text_translated,
      response_from_owner_text: r.response_from_owner_text,
    });
    reviewsByPlace.set(r.place_id, list);
  }

  // Costruisci gli input del lib. Usiamo l'id interno come chiave
  // stabile (place_id del lib) così la firma e i leader sono coerenti
  // con la selezione lato client.
  const places: MapsPlaceInput[] = placeRows.map((p) => ({
    id: p.id,
    place_id: p.id,
    title: p.title,
    normalized_domain: p.normalized_domain,
    category_name: p.category_name,
    price: p.price,
    rank: p.rank,
    total_score: p.total_score,
    reviews_count: p.reviews_count,
    permanently_closed: p.permanently_closed,
    temporarily_closed: p.temporarily_closed,
    phone: p.phone,
    website: p.website,
    image_url: p.image_url,
    address: p.address,
    popular_times: p.popular_times,
    reviews: reviewsByPlace.get(p.id) ?? [],
  }));

  const signature = comparisonSignature(mode, internalIds);

  // 3. Risolvi il modello (lookup mait_ai_models, fallback per costo).
  interface ModelRow {
    model_id: string;
    openrouter_id: string | null;
    credits_cost: number;
    display_name: string;
  }
  let modelRow: ModelRow | null = null;
  if (parsed.data.model_id) {
    const { data: m } = await admin
      .from("mait_ai_models")
      .select("model_id, openrouter_id, credits_cost, display_name")
      .eq("model_id", parsed.data.model_id)
      .eq("is_active", true)
      .not("openrouter_id", "is", null)
      .maybeSingle();
    modelRow = (m as ModelRow | null) ?? null;
  }
  if (!modelRow) {
    const { data: fallback } = await admin
      .from("mait_ai_models")
      .select("model_id, openrouter_id, credits_cost, display_name")
      .eq("is_active", true)
      .not("openrouter_id", "is", null)
      .order("credits_cost", { ascending: true })
      .limit(1)
      .maybeSingle();
    modelRow = (fallback as ModelRow | null) ?? null;
  }
  const modelOpenrouterId =
    modelRow?.openrouter_id ?? MAPS_DEFAULT_OPENROUTER_ID;
  const modelSlug = modelRow?.model_id ?? "default";
  const modelCost = modelRow?.credits_cost ?? 3;
  const modelDisplay = modelRow?.display_name ?? "Default model";

  // 4. Cache hit? (a meno di force) → servi senza ri-bilitare.
  if (!parsed.data.force) {
    const { data: cached } = await admin
      .from("mait_maps_analyses")
      .select("result, model_id, created_at")
      .eq("search_id", id)
      .eq("comparison_signature", signature)
      .eq("model_id", modelSlug)
      .eq("locale", locale)
      .maybeSingle();
    if (cached?.result) {
      return NextResponse.json({
        ok: true,
        cached: true,
        signature,
        model_slug: modelSlug,
        model_display: modelDisplay,
        result: cached.result,
      });
    }
  }

  // 5. Charge credits.
  const credit = await consumeCreditsCustom(
    user.id,
    modelCost,
    `Maps store analysis (${mode}) — ${modelDisplay}`,
  );
  if (!credit.ok) {
    return NextResponse.json(
      {
        error: "Insufficient credits",
        balance: credit.balance,
        cost: modelCost,
        model: modelDisplay,
      },
      { status: 402 },
    );
  }

  // 6. Run AI.
  const out = await runMapsAnalysis({
    workspaceId: profile.workspace_id,
    mode,
    places,
    modelOpenrouterId,
    locale,
  });
  if (!out) {
    await refundCreditsCustom(
      user.id,
      modelCost,
      `Maps store analysis failed (${mode})`,
    );
    return NextResponse.json(
      { error: "AI generation failed. Credits refunded." },
      { status: 502 },
    );
  }

  // 7. Persist (upsert sulla unique key).
  const result = {
    facts: out.facts,
    sections: out.sections,
    modelId: out.modelId,
    modelDisplay,
  };
  const { error: upsertErr } = await admin.from("mait_maps_analyses").upsert(
    {
      workspace_id: profile.workspace_id,
      search_id: id,
      mode,
      comparison_signature: signature,
      model_id: modelSlug,
      locale,
      result,
    },
    { onConflict: "search_id,comparison_signature,model_id,locale" },
  );
  if (upsertErr) {
    // Il dato è stato generato ma non persistito: rimborsa e segnala.
    await refundCreditsCustom(
      user.id,
      modelCost,
      "Maps store analysis: persist failed",
    );
    console.error("[maps/analysis] upsert failed:", upsertErr.message);
    return NextResponse.json(
      {
        error:
          "Generated analysis could not be persisted (DB rejected upsert). Credits refunded.",
        hint: "Check that migration 0062_maps_analyses.sql has been applied.",
        details: upsertErr.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    cached: false,
    signature,
    model_slug: modelSlug,
    model_display: modelDisplay,
    cost: modelCost,
    result,
  });
}

/**
 * GET /api/maps/searches/[id]/analysis
 * Lista i report cached per questa search nel locale corrente (fallback
 * cross-locale), così il panel può ripristinare l'ultima comparison
 * vista senza rigenerare.
 */
export async function GET(
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
  const locale = ((await getLocale()) as "it" | "en") ?? "it";

  const { data, error } = await supabase
    .from("mait_maps_analyses")
    .select("mode, comparison_signature, model_id, locale, result, created_at")
    .eq("search_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = data ?? [];
  const inLocale = rows.filter((r) => r.locale === locale);
  return NextResponse.json({
    analyses: inLocale.length > 0 ? inLocale : rows,
    locale,
    cross_locale: inLocale.length === 0 && rows.length > 0,
  });
}
