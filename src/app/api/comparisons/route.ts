import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inferObjective } from "@/lib/analytics/objective-inference";
import {
  analyzeCopy,
  analyzeVisuals,
  type BrandAdData,
} from "@/lib/ai/creative-analysis";

export const maxDuration = 300;

/* ── Schemas ─────────────────────────────────────────────── */

const postSchema = z.object({
  competitor_ids: z.array(z.string().uuid()).min(2).max(3),
  locale: z.enum(["it", "en"]).optional(),
  sections: z
    .array(z.enum(["technical", "copy", "visual"]))
    .min(1)
    .optional()
    .default(["technical"]),
});

const deleteSchema = z.object({
  competitor_ids: z.array(z.string().uuid()).min(2).max(3),
  locale: z.enum(["it", "en"]).optional(),
});

/* ── Helpers ─────────────────────────────────────────────── */

/** Sort IDs to ensure consistent cache keys */
function sortedIds(ids: string[]): string[] {
  return [...ids].sort();
}

/** Resolve workspace_id from the current user */
async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  return profile?.workspace_id ?? null;
}

/* ── Technical stats computation (same logic as /api/competitors/compare) ── */

type AdRow = {
  ad_archive_id: string;
  headline: string | null;
  ad_text: string | null;
  description: string | null;
  cta: string | null;
  image_url: string | null;
  video_url: string | null;
  platforms: string[] | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  raw_data: Record<string, unknown> | null;
};

async function computeTechnicalStats(
  ids: string[],
  admin: ReturnType<typeof createAdminClient>
) {
  return Promise.all(
    ids.map(async (id) => {
      const [{ data: comp }, { data: ads }] = await Promise.all([
        admin
          .from("mait_competitors")
          .select("id, page_name")
          .eq("id", id)
          .single(),
        admin
          .from("mait_ads_external")
          .select(
            "ad_archive_id, headline, ad_text, description, cta, image_url, video_url, platforms, status, start_date, end_date, created_at, raw_data"
          )
          .eq("competitor_id", id)
          .limit(500),
      ]);

      const adsList = (ads ?? []) as AdRow[];
      const active = adsList.filter((a) => a.status === "ACTIVE");
      const imageCount = adsList.filter(
        (a) => a.image_url && !a.video_url
      ).length;
      const videoCount = adsList.filter((a) => a.video_url).length;

      // CTA counts
      const ctaMap = new Map<string, number>();
      for (const a of adsList) {
        if (a.cta) ctaMap.set(a.cta, (ctaMap.get(a.cta) ?? 0) + 1);
      }
      const topCtas = [...ctaMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // Platforms
      const platMap = new Map<string, number>();
      for (const a of adsList) {
        for (const p of a.platforms ?? []) {
          platMap.set(p, (platMap.get(p) ?? 0) + 1);
        }
      }
      const platforms = [...platMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

      // Duration
      const durations: number[] = [];
      for (const a of adsList) {
        if (!a.start_date) continue;
        const start = new Date(a.start_date).getTime();
        const end = a.end_date
          ? new Date(a.end_date).getTime()
          : Date.now();
        durations.push(Math.max(1, Math.round((end - start) / 86_400_000)));
      }
      const avgDuration =
        durations.length > 0
          ? Math.round(
              durations.reduce((a, b) => a + b, 0) / durations.length
            )
          : 0;

      // Copy length
      const lengths = adsList
        .map((a) => (a.ad_text ?? "").length)
        .filter((l) => l > 0);
      const avgCopyLength =
        lengths.length > 0
          ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
          : 0;

      // Refresh rate (90 days)
      const ninetyAgo = Date.now() - 90 * 86_400_000;
      const recent = adsList.filter(
        (a) => new Date(a.created_at).getTime() > ninetyAgo
      ).length;
      const adsPerWeek = Math.round((recent / (90 / 7)) * 10) / 10;

      // Latest ads
      const latestAds = adsList
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        )
        .slice(0, 5)
        .map((a) => ({
          headline: a.headline,
          image_url: a.image_url,
          ad_archive_id: a.ad_archive_id,
        }));

      // Infer campaign objective
      const objectiveInference = inferObjective(
        adsList.map((a) => a.raw_data)
      );

      return {
        id,
        name: comp?.page_name ?? "—",
        totalAds: adsList.length,
        activeAds: active.length,
        imageCount,
        videoCount,
        topCtas,
        platforms,
        avgDuration,
        avgCopyLength,
        adsPerWeek,
        latestAds,
        objectiveInference,
      };
    })
  );
}

/** Fetch brand ad data for AI analysis (latest 15 ads per brand) */
async function fetchBrandAdData(
  ids: string[],
  admin: ReturnType<typeof createAdminClient>
): Promise<BrandAdData[]> {
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
  return Promise.all(
    ids.map(async (id) => {
      const [{ data: comp }, { data: ads }] = await Promise.all([
        admin
          .from("mait_competitors")
          .select("id, page_name")
          .eq("id", id)
          .single(),
        admin
          .from("mait_ads_external")
          .select("headline, ad_text, description, cta, image_url")
          .eq("competitor_id", id)
          .gte("created_at", tenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      return {
        brandName: comp?.page_name ?? "Unknown",
        competitorId: id,
        ads: (ads ?? []) as {
          headline: string | null;
          ad_text: string | null;
          description: string | null;
          cta: string | null;
          image_url: string | null;
        }[],
      };
    })
  );
}

/* ── GET /api/comparisons?ids=X,Y,Z&locale=it ───────────── */

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  const locale = url.searchParams.get("locale") ?? "it";

  if (!idsParam) {
    return NextResponse.json(
      { error: "Missing ids parameter" },
      { status: 400 }
    );
  }

  const ids = sortedIds(idsParam.split(",").filter(Boolean));
  if (ids.length < 2 || ids.length > 3) {
    return NextResponse.json(
      { error: "Provide 2-3 competitor IDs" },
      { status: 400 }
    );
  }

  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No workspace" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mait_comparisons")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("competitor_ids", `{${ids.join(",")}}`)
    .eq("locale", locale)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

/* ── POST /api/comparisons ───────────────────────────────── */

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No workspace" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const ids = sortedIds(parsed.data.competitor_ids);
  const locale = parsed.data.locale ?? "it";
  const sections = parsed.data.sections;

  // Check if we already have a cached record to merge with
  const { data: existing } = await admin
    .from("mait_comparisons")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("competitor_ids", `{${ids.join(",")}}`)
    .eq("locale", locale)
    .single();

  // Build update payload
  const payload: Record<string, unknown> = {
    workspace_id: workspaceId,
    competitor_ids: ids,
    locale,
    stale: false,
    updated_at: new Date().toISOString(),
  };

  // Technical data
  if (sections.includes("technical")) {
    const stats = await computeTechnicalStats(ids, admin);
    payload.technical_data = stats;
  }

  // AI sections (copy / visual) — fetch brand data once if needed
  const needsAi = sections.includes("copy") || sections.includes("visual");
  if (needsAi) {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY non configurato." },
        { status: 503 }
      );
    }
    const brands = await fetchBrandAdData(ids, admin);
    const aiLocale = locale as "it" | "en";

    const aiTasks: Promise<void>[] = [];

    if (sections.includes("copy")) {
      aiTasks.push(
        analyzeCopy(brands, aiLocale).then((result) => {
          payload.copy_analysis = result;
        })
      );
    }

    if (sections.includes("visual")) {
      aiTasks.push(
        analyzeVisuals(brands, aiLocale).then((result) => {
          payload.visual_analysis = result;
        })
      );
    }

    await Promise.all(aiTasks);
  }

  // Upsert
  let result;
  if (existing) {
    // Merge: keep existing fields that we're not regenerating
    const merged = { ...existing, ...payload };
    const { data, error } = await admin
      .from("mait_comparisons")
      .update(merged)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    result = data;
  } else {
    // Insert new
    payload.created_at = new Date().toISOString();
    const { data, error } = await admin
      .from("mait_comparisons")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    result = data;
  }

  return NextResponse.json(result);
}

/* ── DELETE /api/comparisons ─────────────────────────────── */

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No workspace" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const ids = sortedIds(parsed.data.competitor_ids);
  const locale = parsed.data.locale ?? "it";

  await admin
    .from("mait_comparisons")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("competitor_ids", `{${ids.join(",")}}`)
    .eq("locale", locale);

  return NextResponse.json({ ok: true });
}
