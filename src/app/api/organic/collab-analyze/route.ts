import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  consumeCredits,
  consumeCreditsCustom,
  refundCredits,
  refundCreditsCustom,
} from "@/lib/credits/consume";
import { aiAnalysisAction, collabEnrichCost } from "@/config/pricing";
import { COLLAB_ENRICH_ENABLED, COLLAB_CLASSIFY_ENABLED } from "@/config/features";
import { normalizeHandle } from "@/lib/organic/collaborations";
import {
  needsEnrichment,
  needsClassification,
  ENRICH_PLATFORMS,
  type CollabAccount,
  type CollabPlatform,
} from "@/lib/organic/collab-intel";
import { enrichCollaborators } from "@/lib/organic/collab-enrich";
import { enforceAiRateLimit } from "@/lib/rate-limit/enforce";
import {
  classifyCollaborators,
  type AccountToClassify,
} from "@/lib/organic/collab-classify";
import { logger } from "@/lib/logger";

// Enrichment fa polling sull'actor Apify (fino a ~5 min per chunk) +
// la classificazione LLM (fino a ~2 min). 300s e' il margine dello
// stesso pattern inline-poll usato dagli scan organic.
export const maxDuration = 300;

const ACCOUNT_COLUMNS =
  "handle, platform, full_name, biography, category, verified, followers_count, posts_count, follows_count, tier, profile_pic_url, external_url, enriched_at, enrich_status, classification, classification_confidence, classification_reason, classified_at";

const schema = z.object({
  competitor_id: z.string().uuid(),
  platform: z.enum(["instagram", "tiktok"]),
  handles: z.array(z.string()).min(1).max(200),
  tier: z.enum(["cheap", "pragmatic", "premium"]).optional(),
  locale: z.enum(["it", "en"]).optional(),
});

type Admin = ReturnType<typeof createAdminClient>;

async function loadRows(
  admin: Admin,
  workspaceId: string,
  platform: CollabPlatform,
  handles: string[],
): Promise<Map<string, CollabAccount>> {
  const { data } = await admin
    .from("mait_collab_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("platform", platform)
    .in("handle", handles);
  const map = new Map<string, CollabAccount>();
  for (const row of (data ?? []) as CollabAccount[]) {
    map.set(row.handle, row);
  }
  return map;
}

/**
 * POST /api/organic/collab-analyze
 *
 * Analizza i collaboratori di un brand su una piattaforma: arricchisce
 * i profili (L3, Apify) e li classifica (L2, LLM). On-demand: addebita
 * i crediti SOLO per cio' che serve davvero (account non ancora
 * arricchiti/classificati o stale), poi esegue. Idempotente: rilanciare
 * non ri-arricchisce/ri-classifica cio' che e' gia' fresco.
 *
 * Cost model (allineato alla preview client, stesse funzioni pure):
 *   enrichment = collabEnrichCost(#toEnrich)  (1 cr / 10 account, IG)
 *   classification = 1 × ai_analysis_<tier>   (una batch call)
 */
export async function POST(req: Request) {
  if (!COLLAB_ENRICH_ENABLED && !COLLAB_CLASSIFY_ENABLED) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { competitor_id, platform, tier } = parsed.data;
  const locale = parsed.data.locale ?? "it";

  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const workspaceId = profile.workspace_id as string;

  // Brand del workspace (per nome + scoping difensivo). NB:
  // mait_competitors NON ha colonna `name` — il display name e'
  // `page_name`.
  const { data: competitor } = await supabase
    .from("mait_competitors")
    .select("page_name")
    .eq("id", competitor_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!competitor) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  const brandName = (competitor.page_name as string | null) ?? "the brand";

  // Normalizza + dedup gli handle (match 1:1 con gli aggregati L1).
  const handles = [
    ...new Set(parsed.data.handles.map(normalizeHandle).filter(Boolean)),
  ];
  if (handles.length === 0) {
    return NextResponse.json({ error: "No valid handles" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Per-workspace AI rate limit (shared ceiling with the other LLM routes):
  // classification/enrichment hit the company OpenRouter key.
  const aiRl = await enforceAiRateLimit(admin, workspaceId);
  if (!aiRl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const existing = await loadRows(admin, workspaceId, platform, handles);

  const canEnrich =
    COLLAB_ENRICH_ENABLED && ENRICH_PLATFORMS.includes(platform);
  const toEnrich = canEnrich
    ? handles.filter((h) => needsEnrichment(existing.get(h)))
    : [];
  const toClassify = COLLAB_CLASSIFY_ENABLED
    ? handles.filter((h) => needsClassification(existing.get(h)))
    : [];

  if (toEnrich.length === 0 && toClassify.length === 0) {
    const current = await loadRows(admin, workspaceId, platform, handles);
    return NextResponse.json({
      ok: true,
      nothingToDo: true,
      enriched: 0,
      notFound: 0,
      classified: 0,
      accounts: [...current.values()],
    });
  }

  // ── Charge ──
  const classifyAction = aiAnalysisAction(tier);
  const classifyNeeded = toClassify.length > 0;
  const enrichCredits = collabEnrichCost(toEnrich.length);
  let chargedClassify = false;

  if (classifyNeeded) {
    const c = await consumeCredits(
      user.id,
      classifyAction,
      `Collab classify (${tier ?? "pragmatic"})`,
      competitor_id,
    );
    if (!c.ok) {
      return NextResponse.json(
        { error: "Insufficient credits", balance: c.balance },
        { status: 402 },
      );
    }
    chargedClassify = true;
  }

  if (enrichCredits > 0) {
    const e = await consumeCreditsCustom(
      user.id,
      enrichCredits,
      `Collab enrichment (${toEnrich.length} account)`,
      competitor_id,
    );
    if (!e.ok) {
      if (chargedClassify) {
        await refundCredits(user.id, classifyAction, "Collab classify");
      }
      return NextResponse.json(
        { error: "Insufficient credits", balance: e.balance },
        { status: 402 },
      );
    }
  }

  // ── L3 enrichment ──
  let enriched = 0;
  let notFound = 0;
  if (toEnrich.length > 0) {
    try {
      const res = await enrichCollaborators({
        workspaceId,
        platform,
        handles: toEnrich,
      });
      enriched = res.enriched;
      notFound = res.notFound;
    } catch (err) {
      logger.error(
        "Enrichment failed",
        {
          channel: "organic/collab-analyze",
          event: "enrich.failed",
          workspaceId,
          userId: user.id,
          competitorId: competitor_id,
        },
        err,
      );
      if (chargedClassify) {
        await refundCredits(user.id, classifyAction, "Collab classify");
      }
      if (enrichCredits > 0) {
        await refundCreditsCustom(user.id, enrichCredits, "Collab enrichment");
      }
      return NextResponse.json(
        { error: "Enrichment failed" },
        { status: 502 },
      );
    }
  }

  // ── L2 classification (su dati L3 freschi) ──
  let classified = 0;
  if (classifyNeeded) {
    const refreshed = await loadRows(admin, workspaceId, platform, handles);
    const accounts: AccountToClassify[] = toClassify.map((h) => {
      const row = refreshed.get(h);
      return {
        handle: h,
        platform,
        full_name: row?.full_name ?? null,
        biography: row?.biography ?? null,
        verified: row?.verified ?? null,
        followers_count: row?.followers_count ?? null,
        category: row?.category ?? null,
      };
    });
    try {
      const res = await classifyCollaborators({
        workspaceId,
        brandName,
        accounts,
        tier,
        locale,
      });
      classified = res.classified;
    } catch (err) {
      logger.error(
        "Classification failed",
        {
          channel: "organic/collab-analyze",
          event: "classify.failed",
          workspaceId,
          userId: user.id,
          competitorId: competitor_id,
        },
        err,
      );
      // L'enrichment e' andato a buon fine e resta salvato; rimborsiamo
      // solo la classificazione.
      await refundCredits(user.id, classifyAction, "Collab classify");
      const current = await loadRows(admin, workspaceId, platform, handles);
      return NextResponse.json(
        {
          ok: false,
          error: "Classification failed",
          enriched,
          notFound,
          classified: 0,
          accounts: [...current.values()],
        },
        { status: 502 },
      );
    }
  }

  const final = await loadRows(admin, workspaceId, platform, handles);
  return NextResponse.json({
    ok: true,
    enriched,
    notFound,
    classified,
    accounts: [...final.values()],
  });
}
