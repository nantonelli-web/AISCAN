import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeInstagramPosts } from "@/lib/instagram/service";

export const maxDuration = 300; // seconds

const schema = z.object({
  competitor_id: z.string().uuid(),
  max_posts: z.number().int().min(1).max(500).optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json(
      {
        error:
          "APIFY_API_TOKEN non configurato. Aggiungilo nelle Environment Variables di Vercel e ridepiega.",
      },
      { status: 503 }
    );
  }

  // Validate ownership via RLS read
  const { data: competitor, error: compErr } = await supabase
    .from("mait_competitors")
    .select("id, workspace_id, page_name, instagram_username")
    .eq("id", parsed.data.competitor_id)
    .single();

  if (compErr || !competitor) {
    return NextResponse.json(
      { error: "Competitor not found" },
      { status: 404 }
    );
  }

  const admin = createAdminClient();

  // Resolve instagram_username if not set
  let igUsername: string | null = competitor.instagram_username ?? null;

  if (!igUsername) {
    // Try to extract from the most recent ad's raw_data
    const { data: latestAd } = await admin
      .from("mait_ads_external")
      .select("raw_data")
      .eq("competitor_id", competitor.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestAd?.raw_data) {
      const raw = latestAd.raw_data as Record<string, unknown>;
      const snapshot = raw.snapshot as Record<string, unknown> | undefined;
      igUsername =
        (raw.pageInstagramUser as string) ??
        (snapshot?.pageInstagramUser as string) ??
        null;
    }

    // If found, persist it for future use
    if (igUsername) {
      await admin
        .from("mait_competitors")
        .update({ instagram_username: igUsername })
        .eq("id", competitor.id);
    }
  }

  if (!igUsername) {
    return NextResponse.json(
      {
        error:
          "Instagram username non trovato. Aggiungilo manualmente nel profilo del brand o lancia prima uno scan ads.",
      },
      { status: 400 }
    );
  }

  // Create job row (same pattern as Meta/Google scans)
  const { data: job, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .insert({
      workspace_id: competitor.workspace_id,
      competitor_id: competitor.id,
      status: "running",
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: jobErr?.message ?? "Job error" },
      { status: 500 }
    );
  }

  try {
    const result = await scrapeInstagramPosts({
      username: igUsername,
      maxPosts: parsed.data.max_posts ?? 30,
    });

    // Upsert posts
    if (result.records.length > 0) {
      const rows = result.records.map((r) => ({
        ...r,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        platform: "instagram" as const,
      }));

      const { error: upErr } = await admin
        .from("mait_organic_posts")
        .upsert(rows, { onConflict: "workspace_id,platform,post_id" });
      if (upErr) throw upErr;
    }

    // Update job as succeeded
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        records_count: result.records.length,
        cost_cu: result.costCu ?? 0,
        apify_run_id: result.runId ?? null,
      })
      .eq("id", job.id);

    // Create alert
    if (result.records.length > 0) {
      await admin.from("mait_alerts").insert({
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        type: "new_ads",
        message: `${result.records.length} post Instagram organici sincronizzati per ${competitor.page_name}.`,
      });
    }

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      records: result.records.length,
      username: igUsername,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Instagram scrape failed";
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: message,
      })
      .eq("id", job.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
