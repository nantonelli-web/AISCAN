import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import { aiAnalysisAction } from "@/config/pricing";
import { loadDashboardData } from "@/lib/perf/dashboard-loader";
import {
  runPerfAnalysis,
  applicableSections,
  PERF_SECTIONS,
  PERF_DEFAULT_TIER,
  type PerfModelTier,
  type PerfSection,
} from "@/lib/ai/perf-analysis";
import { getLocale } from "@/lib/i18n/server";
import type { ComparisonMode } from "@/lib/perf/comparisons";

export const maxDuration = 180;

interface AnalysisRow {
  section: string;
  content: string;
  model_tier: string;
  model_id: string | null;
  edited_by_user: boolean;
  updated_at: string;
}

const postSchema = z.object({
  tier: z.enum(["cheap", "pragmatic", "premium"]).optional(),
  /** Se settato, rigenera solo le sezioni elencate.
   *  Default: rigenera tutte le sezioni applicabili. */
  sections: z.array(z.enum(PERF_SECTIONS)).optional(),
  /** Se true, sovrascrive anche le sezioni gia' editate
   *  manualmente dall'utente (default false). */
  force_overwrite_edited: z.boolean().optional(),
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
  const tier: PerfModelTier = parsed.data.tier ?? PERF_DEFAULT_TIER;
  const locale = ((await getLocale()) as "it" | "en") ?? "it";

  // 1. Load dashboard payload (riusa la stessa logica del route
  //    /dashboard cosi i numeri sono identici).
  const dashboard = await loadDashboardData(supabase, {
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

  // 2. Sezioni da generare
  const all = applicableSections(dashboard.data);
  const requested = parsed.data.sections;
  const sectionsToGen: PerfSection[] = requested
    ? requested.filter((s) => all.includes(s))
    : all;
  if (sectionsToGen.length === 0) {
    return NextResponse.json({ error: "No applicable sections" }, { status: 400 });
  }

  // 3. Charge credits
  const action = aiAnalysisAction(tier);
  const credit = await consumeCredits(
    user.id,
    action,
    `Adv Performance AI (${tier})`,
  );
  if (!credit.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credit.balance, tier },
      { status: 402 },
    );
  }

  // 4. Run AI
  const out = await runPerfAnalysis({
    workspaceId: profile.workspace_id,
    data: dashboard.data,
    sections: sectionsToGen,
    tier,
    locale,
    channel: (dashboard.imp.channel as
      | "meta"
      | "snapchat"
      | "google"
      | "tiktok") ?? "meta",
  });
  if (!out || Object.keys(out.sections).length === 0) {
    await refundCredits(user.id, action, "Adv Performance AI failed");
    return NextResponse.json(
      { error: "AI generation failed. Credits refunded." },
      { status: 502 },
    );
  }

  // 5. Persist (skippa sezioni gia' edited unless force flag)
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("mait_perf_analyses")
    .select("section, edited_by_user")
    .eq("import_id", id);
  const editedSet = new Set(
    ((existing as { section: string; edited_by_user: boolean }[] | null) ?? [])
      .filter((r) => r.edited_by_user)
      .map((r) => r.section),
  );

  const writes: AnalysisRow[] = [];
  const now = new Date().toISOString();
  for (const [section, content] of Object.entries(out.sections)) {
    if (!content) continue;
    if (
      editedSet.has(section) &&
      !parsed.data.force_overwrite_edited
    ) {
      continue;
    }
    const row = {
      workspace_id: profile.workspace_id,
      import_id: id,
      section,
      content,
      model_tier: tier,
      model_id: out.modelId,
      edited_by_user: false,
      created_by: user.id,
      updated_at: now,
    };
    const { error } = await admin
      .from("mait_perf_analyses")
      .upsert(row, { onConflict: "import_id,section" });
    if (error) {
      console.error("[perf/analysis] upsert failed:", error.message);
      continue;
    }
    writes.push({
      section,
      content,
      model_tier: tier,
      model_id: out.modelId,
      edited_by_user: false,
      updated_at: now,
    });
  }

  return NextResponse.json({
    ok: true,
    tier,
    model_id: out.modelId,
    sections_generated: writes.length,
    sections_skipped_edited:
      Array.from(editedSet).filter((s) => sectionsToGen.includes(s as PerfSection))
        .length,
    analyses: writes,
  });
}

/**
 * GET /api/perf/imports/[id]/analysis
 * Ritorna tutte le analisi salvate per l'import.
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
  const { data, error } = await supabase
    .from("mait_perf_analyses")
    .select("section, content, model_tier, model_id, edited_by_user, updated_at")
    .eq("import_id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ analyses: (data ?? []) as AnalysisRow[] });
}
