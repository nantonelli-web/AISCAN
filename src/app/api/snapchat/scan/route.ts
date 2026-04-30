import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  scrapeSnapchatProfile,
  cleanSnapchatHandle,
} from "@/lib/snapchat/service";
import { storeProfilePicture } from "@/lib/media/store-ad-images";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import { checkScanConcurrency } from "@/lib/rate-limit/scan-concurrency";

export const maxDuration = 300; // seconds

const schema = z.object({
  competitor_id: z.string().uuid(),
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
      { status: 503 },
    );
  }

  const { data: competitor, error: compErr } = await supabase
    .from("mait_competitors")
    .select("id, workspace_id, page_name, snapchat_handle")
    .eq("id", parsed.data.competitor_id)
    .single();

  if (compErr || !competitor) {
    return NextResponse.json(
      { error: "Competitor not found" },
      { status: 404 },
    );
  }

  const admin = createAdminClient();

  // Stale-job cleanup + concurrency gate BEFORE charging credits.
  const tenMinAgoPre = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin
    .from("mait_scrape_jobs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error: "Timeout (stale)",
    })
    .eq("competitor_id", competitor.id)
    .eq("status", "running")
    .lt("started_at", tenMinAgoPre);

  const rate = await checkScanConcurrency(admin, {
    workspaceId: competitor.workspace_id,
    competitorId: competitor.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.reason }, { status: 429 });
  }

  const credits = await consumeCredits(
    user.id,
    "scan_snapchat",
    `Snapchat scan: ${competitor.page_name}`,
  );
  if (!credits.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credits.balance, cost: 1 },
      { status: 402 },
    );
  }

  // Resolve snapchat_handle, normalising legacy entries the same way
  // the Instagram and TikTok scans do.
  let handle: string | null = competitor.snapchat_handle ?? null;
  if (handle) {
    const cleaned = cleanSnapchatHandle(handle);
    if (cleaned && cleaned !== handle) {
      await admin
        .from("mait_competitors")
        .update({ snapchat_handle: cleaned })
        .eq("id", competitor.id);
      handle = cleaned;
    } else if (cleaned) {
      handle = cleaned;
    } else {
      handle = null;
    }
  }

  if (!handle) {
    await refundCredits(
      user.id,
      "scan_snapchat",
      `Snapchat scan: ${competitor.page_name}`,
    );
    return NextResponse.json(
      {
        error:
          "Snapchat handle non configurato per questo brand. Aggiungilo dal profilo del brand prima di lanciare lo scan.",
      },
      { status: 400 },
    );
  }

  const { data: job, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .insert({
      workspace_id: competitor.workspace_id,
      competitor_id: competitor.id,
      status: "running",
      source: "snapchat",
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    await refundCredits(
      user.id,
      "scan_snapchat",
      `Snapchat scan: ${competitor.page_name}`,
    );
    if ((jobErr as { code?: string } | null)?.code === "23505") {
      return NextResponse.json({ error: "already_running" }, { status: 429 });
    }
    return NextResponse.json(
      { error: jobErr?.message ?? "Job error" },
      { status: 500 },
    );
  }

  try {
    const result = await scrapeSnapchatProfile({
      username: handle,
      workspaceId: competitor.workspace_id,
    });

    // Abort checkpoint #1: user clicked Stop while Apify was still
    // running. Skip every downstream side-effect — same pattern as
    // the TikTok/Instagram scans.
    {
      const { data: jobNow } = await admin
        .from("mait_scrape_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (jobNow?.status === "failed") {
        await refundCredits(
          user.id,
          "scan_snapchat",
          `Snapchat scan aborted: ${competitor.page_name}`,
        );
        return NextResponse.json({
          ok: false,
          aborted: true,
          job_id: job.id,
          records: 0,
        });
      }
    }

    if (!result.profile) {
      // Actor returned an empty dataset (handle 404, private account
      // with no public surface, etc.). Mark the job failed honestly
      // and refund — no row to insert and the user paid for nothing.
      await admin
        .from("mait_scrape_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          records_count: 0,
          cost_cu: result.costCu ?? 0,
          apify_run_id: result.runId ?? null,
          error: "Snapchat profile not found or empty",
        })
        .eq("id", job.id);
      await refundCredits(
        user.id,
        "scan_snapchat",
        `Snapchat scan (no data): ${competitor.page_name}`,
      );
      return NextResponse.json(
        {
          error:
            "Profilo Snapchat non trovato o vuoto. Verifica l'handle del brand.",
        },
        { status: 404 },
      );
    }

    // Persist the profile picture to permanent storage. Snapchat CDN
    // URLs (cf-st.sc-cdn.net) are signed with short TTLs, same as
    // fbcdn / tiktokcdn. Without this the brand grid breaks within a
    // day. The hero image gets the same treatment via a second call.
    if (result.profile.profile_picture_url) {
      const permanent = await storeProfilePicture(
        admin,
        competitor.workspace_id,
        `sc_${competitor.id}`,
        result.profile.profile_picture_url,
      );
      if (permanent) {
        result.profile.profile_picture_url = permanent;
      }
    }
    if (result.profile.hero_image_url) {
      const permanentHero = await storeProfilePicture(
        admin,
        competitor.workspace_id,
        `sc_hero_${competitor.id}`,
        result.profile.hero_image_url,
      );
      if (permanentHero) {
        result.profile.hero_image_url = permanentHero;
      }
    }

    // Mirror the latest snapshot on the competitor row for the brand
    // header (same as instagram_profile + tiktok_profile).
    await admin
      .from("mait_competitors")
      .update({ snapchat_profile: result.profile })
      .eq("id", competitor.id);

    // Append a fresh row to the snapshot history table — one row per
    // scan, never an upsert. This is the trend store: lensCount or
    // spotlightCount growing over time tells the story.
    const { error: insertErr } = await admin
      .from("mait_snapchat_profiles")
      .insert({
        ...result.profile,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
      });
    if (insertErr) {
      console.error(`[Snapchat route] Insert error:`, insertErr);
      throw insertErr;
    }
    console.log(`[Snapchat route] Snapshot stored`);

    // Any cached comparison containing this brand is now out of date.
    await admin
      .from("mait_comparisons")
      .update({ stale: true })
      .contains("competitor_ids", [competitor.id]);

    // Abort checkpoint #2: stop landed AFTER the insert (rare race).
    {
      const { data: jobNow } = await admin
        .from("mait_scrape_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (jobNow?.status === "failed") {
        await refundCredits(
          user.id,
          "scan_snapchat",
          `Snapchat scan aborted (post-commit): ${competitor.page_name}`,
        );
        return NextResponse.json({
          ok: false,
          aborted: true,
          partial_records: 1,
          job_id: job.id,
        });
      }
    }

    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        records_count: 1,
        cost_cu: result.costCu ?? 0,
        apify_run_id: result.runId ?? null,
        key_used: result.credentials?.keyRecordId ?? null,
        billing_mode_at_run: result.credentials?.billingMode ?? null,
      })
      .eq("id", job.id);

    await admin
      .from("mait_competitors")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", competitor.id);

    await admin.from("mait_alerts").insert({
      workspace_id: competitor.workspace_id,
      competitor_id: competitor.id,
      type: "new_ads",
      message: `Snapshot Snapchat aggiornato per ${competitor.page_name}.`,
    });

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      records: 1,
      handle,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Snapchat scrape failed";
    const billingCode =
      e && typeof e === "object" && "code" in (e as object)
        ? ((e as { code: unknown }).code as string)
        : null;
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: message,
      })
      .eq("id", job.id);
    await refundCredits(
      user.id,
      "scan_snapchat",
      `Snapchat scan: ${competitor.page_name}`,
    );
    const httpStatus =
      billingCode === "MISSING_KEY" || billingCode === "INVALID_KEY" ? 400 : 500;
    return NextResponse.json({ error: message, code: billingCode }, { status: httpStatus });
  }
}
