import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import {
  consumeCreditsCustom,
  refundCreditsCustom,
} from "@/lib/credits/consume";
import { loadDashboardData } from "@/lib/perf/dashboard-loader";
import {
  runPerfAnalysis,
  translatePerfAnalysis,
  applicableSections,
  PERF_SECTIONS,
  PERF_DEFAULT_OPENROUTER_ID,
  type PerfSection,
} from "@/lib/ai/perf-analysis";
import { getLocale } from "@/lib/i18n/server";
import { enforceRateLimit, AI_CALLS_PER_HOUR } from "@/lib/rate-limit/enforce";
import type { ComparisonMode } from "@/lib/perf/comparisons";

export const maxDuration = 180;

interface AnalysisRow {
  section: string;
  content: string;
  model_tier: string;
  model_id: string | null;
  edited_by_user: boolean;
  updated_at: string;
  locale?: string;
}

const postSchema = z.object({
  /** Slug del modello scelto (mait_ai_models.model_id, es.
   *  'claude-haiku-4-5'). Opzionale: se assente o non risolvibile,
   *  fallback al primo modello attivo con minor costo, o al
   *  default hardcoded. */
  model_id: z.string().min(1).max(120).optional(),
  /** Se settato, rigenera solo le sezioni elencate.
   *  Default: rigenera tutte le sezioni applicabili. */
  sections: z.array(z.enum(PERF_SECTIONS)).optional(),
  /** Se true, sovrascrive anche le sezioni gia' editate
   *  manualmente dall'utente (default false). */
  force_overwrite_edited: z.boolean().optional(),
  /** Modalita' di generazione:
   *   - "regenerate" (default): rigenera ex-novo dal dato del
   *      dashboard, usando il prompt analitico
   *   - "translate": traduce le analisi gia' esistenti in altra
   *      lingua nel locale corrente, preservando le personalizzazioni
   *      manuali dell'utente. La sorgente e' determinata da
   *      `translate_from` o auto-rilevata
   *   - "auto": se non ci sono analisi nel locale corrente ma
   *      esistono in altre lingue → translate; altrimenti regenerate.
   *      E' il default consigliato dal client. */
  mode: z.enum(["regenerate", "translate", "auto"]).optional(),
  /** Quando mode=translate, locale della sorgente da tradurre.
   *  Opzionale: se assente prende la prima/unica lingua disponibile
   *  diversa dal locale corrente. */
  translate_from: z.enum(["it", "en"]).optional(),
  /** Comparison mode applicato al payload (per coerenza con il
   *  dashboard che l'utente sta vedendo). */
  compare: z
    .enum(["none", "previous", "week", "yoy", "custom"])
    .optional(),
  compare_from: z.string().optional(),
  compare_to: z.string().optional(),
  week_current: z.string().optional(),
  week_compare: z.string().optional(),
});

/**
 * POST /api/perf/imports/[id]/analysis
 * Genera (o rigenera) le analisi AI per le sezioni applicabili
 * dell'import. One-shot: una chiamata LLM produce JSON con tutte
 * le sezioni richieste, salvate poi una per riga in
 * mait_perf_analyses (last-write-wins, conservando edited_by_user
 * a meno di force_overwrite_edited=true).
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

  const body = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const locale = ((await getLocale()) as "it" | "en") ?? "it";

  // Risolvi il modello: lookup esplicito in mait_ai_models (admin).
  // Se model_id assente o non valido → primo attivo per costo ASC.
  interface ModelRow {
    model_id: string;
    openrouter_id: string | null;
    credits_cost: number;
    display_name: string;
  }
  const adminPre = createAdminClient();
  let modelRow: ModelRow | null = null;
  if (parsed.data.model_id) {
    const { data: m } = await adminPre
      .from("mait_ai_models")
      .select("model_id, openrouter_id, credits_cost, display_name")
      .eq("model_id", parsed.data.model_id)
      .eq("is_active", true)
      .not("openrouter_id", "is", null)
      .maybeSingle();
    modelRow = (m as ModelRow | null) ?? null;
  }
  if (!modelRow) {
    const { data: fallback } = await adminPre
      .from("mait_ai_models")
      .select("model_id, openrouter_id, credits_cost, display_name")
      .eq("is_active", true)
      .not("openrouter_id", "is", null)
      .order("credits_cost", { ascending: true })
      .limit(1)
      .maybeSingle();
    modelRow = (fallback as ModelRow | null) ?? null;
  }
  // Ultimo fallback: hardcoded default (es. catalogo non popolato).
  const modelOpenrouterId =
    modelRow?.openrouter_id ?? PERF_DEFAULT_OPENROUTER_ID;
  const modelSlug = modelRow?.model_id ?? "default";
  const modelCost = modelRow?.credits_cost ?? 3;
  const modelDisplay = modelRow?.display_name ?? "Default model";

  // 1. Determina mode effettivo (auto-detect translate vs regenerate)
  const admin = createAdminClient();
  const { data: allExistingData } = await admin
    .from("mait_perf_analyses")
    .select(
      "section, content, model_tier, model_id, edited_by_user, updated_at, locale",
    )
    .eq("import_id", id);
  const allExisting = (allExistingData as AnalysisRow[] | null) ?? [];
  const existingInCurrent = allExisting.filter((r) => r.locale === locale);
  const existingInOther = allExisting.filter((r) => r.locale !== locale);

  const requestedMode = parsed.data.mode ?? "auto";
  let effectiveMode: "regenerate" | "translate";
  if (requestedMode === "auto") {
    effectiveMode =
      existingInCurrent.length === 0 && existingInOther.length > 0
        ? "translate"
        : "regenerate";
  } else {
    effectiveMode = requestedMode;
  }

  // Per translate serve almeno una versione sorgente da cui partire.
  if (effectiveMode === "translate" && existingInOther.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nessuna analisi disponibile in altra lingua da tradurre. Usa mode=regenerate per generarla ex-novo.",
      },
      { status: 400 },
    );
  }

  // 2. Sezioni da generare/tradurre
  let dashboard: Awaited<ReturnType<typeof loadDashboardData>> = null;
  let sectionsToGen: PerfSection[];
  if (effectiveMode === "translate") {
    // Translate: prendiamo le sezioni dalle versioni esistenti in
    // altra lingua, non dal dashboard. Cosi' non c'e' rischio di
    // "perdere" sezioni che esistono solo perche' l'utente le aveva
    // editate manualmente.
    const sourceLocale: "it" | "en" =
      parsed.data.translate_from ??
      (existingInOther[0]?.locale as "it" | "en" | undefined) ??
      (locale === "it" ? "en" : "it");
    const sourceRows = allExisting.filter((r) => r.locale === sourceLocale);
    if (sourceRows.length === 0) {
      return NextResponse.json(
        { error: `Nessuna analisi sorgente in ${sourceLocale}` },
        { status: 400 },
      );
    }
    const sourceSections = new Set(sourceRows.map((r) => r.section));
    sectionsToGen = (
      parsed.data.sections ?? (PERF_SECTIONS as readonly PerfSection[])
    ).filter((s) => sourceSections.has(s)) as PerfSection[];
    if (sectionsToGen.length === 0) {
      return NextResponse.json(
        { error: "Nessuna sezione sorgente da tradurre" },
        { status: 400 },
      );
    }
  } else {
    // Regenerate: load dashboard + use applicableSections come prima.
    dashboard = await loadDashboardData(supabase, {
      importId: id,
      mode: (parsed.data.compare ?? "none") as ComparisonMode,
      customFrom: parsed.data.compare_from,
      customTo: parsed.data.compare_to,
      weekCurrent: parsed.data.week_current,
      weekCompare: parsed.data.week_compare,
    });
    if (!dashboard) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (dashboard.imp.workspace_id !== profile.workspace_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const all = applicableSections(dashboard.data);
    const requested = parsed.data.sections;
    sectionsToGen = requested ? requested.filter((s) => all.includes(s)) : all;
    if (sectionsToGen.length === 0) {
      return NextResponse.json(
        { error: "No applicable sections" },
        { status: 400 },
      );
    }
  }

  // Per-workspace AI rate limit (shared ceiling with the other LLM routes).
  const aiRl = await enforceRateLimit(admin, {
    key: `ai:${profile.workspace_id}`,
    limit: AI_CALLS_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!aiRl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // 3. Charge credits (costo dinamico dal catalogo modelli)
  const credit = await consumeCreditsCustom(
    user.id,
    modelCost,
    `Adv Performance AI (${effectiveMode}) — ${modelDisplay}`,
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

  // 4. Run AI (translate o regenerate)
  let out: Awaited<ReturnType<typeof runPerfAnalysis>> = null;
  let sourceMetadataBySection: Map<
    string,
    { edited_by_user: boolean; model_tier: string; model_id: string | null }
  > = new Map();
  if (effectiveMode === "translate") {
    const sourceLocale: "it" | "en" =
      parsed.data.translate_from ??
      (existingInOther[0]?.locale as "it" | "en" | undefined) ??
      (locale === "it" ? "en" : "it");
    const sourceRows = allExisting.filter(
      (r) => r.locale === sourceLocale && sectionsToGen.includes(r.section as PerfSection),
    );
    sourceMetadataBySection = new Map(
      sourceRows.map((r) => [
        r.section,
        {
          edited_by_user: r.edited_by_user,
          model_tier: r.model_tier,
          model_id: r.model_id,
        },
      ]),
    );
    out = await translatePerfAnalysis({
      workspaceId: profile.workspace_id,
      modelOpenrouterId,
      fromLocale: sourceLocale,
      toLocale: locale,
      sections: sourceRows.map((r) => ({
        section: r.section as PerfSection,
        content: r.content,
      })),
    });
  } else {
    if (!dashboard) {
      // Difensivo: non dovrebbe accadere perche' regenerate carica
      // dashboard sopra, ma TS non lo sa.
      return NextResponse.json({ error: "Dashboard load failed" }, { status: 500 });
    }
    out = await runPerfAnalysis({
      workspaceId: profile.workspace_id,
      data: dashboard.data,
      sections: sectionsToGen,
      modelOpenrouterId,
      locale,
      channel: (dashboard.imp.channel as
        | "meta"
        | "snapchat"
        | "google"
        | "tiktok") ?? "meta",
    });
  }
  if (!out || Object.keys(out.sections).length === 0) {
    await refundCreditsCustom(
      user.id,
      modelCost,
      `Adv Performance AI failed (${effectiveMode})`,
    );
    return NextResponse.json(
      { error: "AI generation failed. Credits refunded." },
      { status: 502 },
    );
  }

  // 5. Persist
  //    Per `regenerate`: skip sezioni gia' edited unless force flag.
  //    Per `translate`: SEMPRE upsertare. Se la sorgente era
  //    edited_by_user=true, preserviamo questo flag sulla traduzione
  //    (cosi la rigenerazione futura nella stessa locale non
  //    sovrascrive la traduzione di un edit utente). Idem
  //    model_tier/model_id originali — la traduzione ne "porta"
  //    l'identita' della sorgente.
  const editedSetInCurrent = new Set(
    existingInCurrent.filter((r) => r.edited_by_user).map((r) => r.section),
  );

  const writes: AnalysisRow[] = [];
  const upsertErrors: string[] = [];
  const now = new Date().toISOString();
  for (const [section, content] of Object.entries(out.sections)) {
    if (!content) continue;
    if (
      effectiveMode === "regenerate" &&
      editedSetInCurrent.has(section) &&
      !parsed.data.force_overwrite_edited
    ) {
      continue;
    }
    const srcMeta = sourceMetadataBySection.get(section);
    const row = {
      workspace_id: profile.workspace_id,
      import_id: id,
      section,
      content,
      model_tier:
        effectiveMode === "translate" && srcMeta
          ? srcMeta.model_tier
          : modelSlug,
      model_id:
        effectiveMode === "translate" && srcMeta
          ? srcMeta.model_id
          : out.modelId,
      locale,
      edited_by_user:
        effectiveMode === "translate" && srcMeta
          ? srcMeta.edited_by_user
          : false,
      created_by: user.id,
      updated_at: now,
    };
    const { error } = await admin
      .from("mait_perf_analyses")
      .upsert(row, { onConflict: "import_id,section,locale" });
    if (error) {
      console.error(
        `[perf/analysis] upsert failed (section=${section}):`,
        error.message,
        error.details ?? "",
        error.hint ?? "",
      );
      upsertErrors.push(`${section}: ${error.message}`);
      continue;
    }
    writes.push({
      section,
      content,
      model_tier: row.model_tier,
      model_id: row.model_id,
      edited_by_user: row.edited_by_user,
      updated_at: now,
      locale,
    });
  }

  // Se TUTTI gli upsert sono falliti, refund: l'utente ha pagato il
  // credito ma non ha ricevuto nulla di persistito. Ritorna l'errore
  // reale del DB cosi si capisce cosa correggere (tipicamente:
  // migrazioni 0049/0050 non applicate).
  if (writes.length === 0) {
    await refundCreditsCustom(
      user.id,
      modelCost,
      "Adv Performance AI: 0 sections persisted",
    );
    return NextResponse.json(
      {
        error:
          "Generated analysis could not be persisted (DB rejected upsert). Credits refunded.",
        details: upsertErrors.slice(0, 3),
        hint:
          "Check that Supabase migrations 0049 (drop model_tier check) and 0050 (locale column + unique) have been applied.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    mode: effectiveMode,
    model_slug: modelSlug,
    model_display: modelDisplay,
    model_id: out.modelId,
    cost: modelCost,
    sections_generated: writes.length,
    sections_skipped_edited:
      effectiveMode === "regenerate"
        ? Array.from(editedSetInCurrent).filter((s) =>
            sectionsToGen.includes(s as PerfSection),
          ).length
        : 0,
    analyses: writes,
  });
}

/**
 * GET /api/perf/imports/[id]/analysis
 * Ritorna le analisi nel locale corrente. Se per quel locale non
 * ci sono righe, fallback a quelle in altra lingua (l'UI mostra
 * un hint "disponibile in italiano/inglese, rigenera per tradurre")
 * cosi l'utente non vede una pagina vuota dopo aver cambiato lingua.
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
  const primary = await supabase
    .from("mait_perf_analyses")
    .select(
      "section, content, model_tier, model_id, edited_by_user, updated_at, locale",
    )
    .eq("import_id", id)
    .eq("locale", locale);
  if (primary.error) {
    return NextResponse.json({ error: primary.error.message }, { status: 500 });
  }
  if ((primary.data ?? []).length > 0) {
    return NextResponse.json({
      analyses: primary.data as AnalysisRow[],
      locale,
      cross_locale: false,
    });
  }
  // Fallback cross-locale
  const fb = await supabase
    .from("mait_perf_analyses")
    .select(
      "section, content, model_tier, model_id, edited_by_user, updated_at, locale",
    )
    .eq("import_id", id);
  if (fb.error) {
    return NextResponse.json({ error: fb.error.message }, { status: 500 });
  }
  return NextResponse.json({
    analyses: (fb.data ?? []) as AnalysisRow[],
    locale,
    cross_locale: (fb.data ?? []).length > 0,
  });
}
