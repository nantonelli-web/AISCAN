import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeMetaAds } from "@/lib/apify/service";
import { reconcileMetaAdStatus } from "@/lib/apify/reconcile-status";
import { resolvePageId } from "@/lib/meta/resolve-page-id";
import { sendNewAdsNotification } from "@/lib/email/resend";
import { storeAdImages, storeProfilePicture } from "@/lib/media/store-ad-images";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import { checkScanConcurrency } from "@/lib/rate-limit/scan-concurrency";

export const maxDuration = 300; // seconds (Vercel hobby allows 60; pro 300)

/**
 * Re-read the job row from the DB to see whether the abort endpoint
 * flipped it to failed while the long Vercel Lambda was mid-flight.
 *
 * The fresh job row was created with status=running by this same
 * route; the stale-cleanup at the top of the route only touches rows
 * older than 10 minutes, so any flip to failed mid-run is caused by
 * /api/apify/abort (i.e. the user clicked Stop). Returning true at
 * the call sites lets us skip the upsert and the success update so
 * partial Apify results never land in mait_ads_external and the job
 * row stays correctly marked as failed/aborted.
 */
async function jobWasAborted(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("mait_scrape_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  return data?.status === "failed";
}

const schema = z.object({
  competitor_id: z.string().uuid(),
  max_items: z.number().int().min(1).max(1000).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    .select("id, workspace_id, page_id, page_url, page_name, country")
    .eq("id", parsed.data.competitor_id)
    .single();

  if (compErr || !competitor) {
    return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
  }

  const admin = createAdminClient();

  // Cleanup stale jobs: any "running" job older than 10 min → mark failed
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin
    .from("mait_scrape_jobs")
    .update({ status: "failed", completed_at: new Date().toISOString(), error: "Timeout (stale)" })
    .eq("competitor_id", competitor.id)
    .eq("status", "running")
    .lt("started_at", tenMinAgo);

  const rate = await checkScanConcurrency(admin, {
    workspaceId: competitor.workspace_id,
    competitorId: competitor.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.reason }, { status: 429 });
  }

  // Credit check AFTER rate check so we don't charge on 429.
  const credits = await consumeCredits(user.id, "scan_meta", `Meta Ads scan: ${competitor.page_name}`);
  if (!credits.ok) {
    return NextResponse.json({ error: "Insufficient credits", balance: credits.balance, cost: 5 }, { status: 402 });
  }

  // If page_id was never resolved, try again now
  let pageId = competitor.page_id;
  if (!pageId) {
    const resolved = await resolvePageId(
      competitor.page_url,
      competitor.page_name ?? undefined
    );
    if (resolved) {
      pageId = resolved;
      await admin
        .from("mait_competitors")
        .update({ page_id: resolved })
        .eq("id", competitor.id);
    }
  }

  // Create job row. date_from/date_to capture the user-requested
  // window so the brand list can later display "scan period
  // 22/03 → 22/04" without re-deriving from the ads.
  const { data: job, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .insert({
      workspace_id: competitor.workspace_id,
      competitor_id: competitor.id,
      status: "running",
      source: "meta",
      date_from: parsed.data.date_from ?? null,
      date_to: parsed.data.date_to ?? null,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    // Race-loss against the partial unique index from migration 0033 —
    // a concurrent request beat us after we passed the rate check.
    // Refund credits and return the same 429 the rate check would
    // have given.
    if ((jobErr as { code?: string } | null)?.code === "23505") {
      await refundCredits(user.id, "scan_meta", `Meta Ads scan race-rejected: ${competitor.page_name}`);
      return NextResponse.json({ error: "already_running" }, { status: 429 });
    }
    return NextResponse.json({ error: jobErr?.message ?? "Job error" }, { status: 500 });
  }

  try {
    const result = await scrapeMetaAds({
      pageId: pageId ?? undefined,
      pageName: competitor.page_name ?? undefined,
      pageUrl: competitor.page_url,
      country: competitor.country ?? undefined,
      maxItems: parsed.data.max_items ?? 500,
      // Product rule: only scan active ads. Inactive / stopped creatives are
      // not analysed — removing the toggle avoids surprising users who would
      // otherwise see thousands of archived ads counted as current signals.
      active: true,
      dateFrom: parsed.data.date_from,
      dateTo: parsed.data.date_to,
      // BYO dispatch: subscription-mode workspaces hit their own Apify
      // account; credit-mode workspaces stay on the AISCAN env key.
      workspaceId: competitor.workspace_id,
    });

    // Abort checkpoint #1: user clicked Stop while Apify was still
    // returning. Skip the upsert + final update so the partial data
    // never lands in mait_ads_external and the job row keeps the
    // failed/aborted state set by /api/apify/abort. Refund credits
    // so the user is not charged for a scan they cancelled.
    if (await jobWasAborted(admin, job.id)) {
      await refundCredits(
        user.id,
        "scan_meta",
        `Meta Ads scan aborted: ${competitor.page_name}`,
      );
      return NextResponse.json({
        ok: false,
        aborted: true,
        job_id: job.id,
        records: 0,
      });
    }

    // Download images to permanent storage, then upsert ads
    if (result.records.length > 0) {
      const rows = result.records.map((r) => ({
        ...r,
        source: "meta" as const,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
      }));

      await storeAdImages(admin, competitor.workspace_id, rows, "meta");

      // Save profile picture permanently
      const firstSnapshot = (result.records[0]?.raw_data as Record<string, unknown>)?.snapshot as Record<string, unknown> | undefined;
      const profilePicUrl = firstSnapshot?.pageProfilePictureUrl as string | undefined;
      if (profilePicUrl) {
        const permanentProfileUrl = await storeProfilePicture(
          admin, competitor.workspace_id, competitor.id, profilePicUrl
        );
        if (permanentProfileUrl) {
          await admin
            .from("mait_competitors")
            .update({ profile_picture_url: permanentProfileUrl })
            .eq("id", competitor.id);
        }
      }

      const { error: upErr } = await admin
        .from("mait_ads_external")
        .upsert(rows, { onConflict: "workspace_id,ad_archive_id,source" });
      if (upErr) throw upErr;

      // Reconcile: any ad that was ACTIVE in DB, lives in the
      // countries we just scanned, and falls inside the same
      // start_date window Apify was given but did NOT come back is
      // no longer running. Flip it to INACTIVE so the volume chart
      // stops counting stale active rows. Best-effort: errors are
      // logged inside the helper and never block the scan response.
      const newArchiveIds = result.records
        .map((r) => r.ad_archive_id)
        .filter((id): id is string => !!id);
      const inactivated = await reconcileMetaAdStatus(
        admin,
        competitor.id,
        newArchiveIds,
        result.scannedCountries,
        parsed.data.date_from,
        parsed.data.date_to,
      );
      if (inactivated > 0) {
        console.log(
          `[scan] Reconciled ${inactivated} stale ACTIVE ads for ${competitor.page_name}`,
        );
      }
    }

    // Abort checkpoint #2: stop landed AFTER the upsert (rare, narrow
    // race). Some partial data is in DB at this point — we cannot
    // undo it without complex tracking — but at least the job row
    // stays honestly marked failed/aborted instead of being
    // overwritten to succeeded with an inconsistent error field.
    if (await jobWasAborted(admin, job.id)) {
      await refundCredits(
        user.id,
        "scan_meta",
        `Meta Ads scan aborted (post-commit): ${competitor.page_name}`,
      );
      return NextResponse.json({
        ok: false,
        aborted: true,
        partial_records: result.records.length,
        job_id: job.id,
      });
    }

    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        records_count: result.records.length,
        cost_cu: result.costCu,
        apify_run_id: result.runId,
        // BYO audit: which key paid for this run + the workspace's
        // billing mode at the moment of the scan, so support can
        // answer "what was active when this run failed?" later.
        key_used: result.credentials?.keyRecordId ?? null,
        billing_mode_at_run: result.credentials?.billingMode ?? null,
      })
      .eq("id", job.id);

    await admin
      .from("mait_competitors")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", competitor.id);

    if (result.records.length > 0) {
      await admin.from("mait_alerts").insert({
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        type: "new_ads",
        message: `${result.records.length} ads sincronizzate.`,
      });

      // Mark any cached comparisons that include this competitor as stale
      await admin
        .from("mait_comparisons")
        .update({ stale: true, updated_at: new Date().toISOString() })
        .contains("competitor_ids", [competitor.id]);

      // Send email notification to workspace members
      try {
        const { data: members } = await admin
          .from("mait_users")
          .select("email")
          .eq("workspace_id", competitor.workspace_id);
        const emails = (members ?? []).map((m) => m.email).filter(Boolean);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        await sendNewAdsNotification(emails, {
          competitorName: competitor.page_name ?? "Competitor",
          adsCount: result.records.length,
          ads: result.records.slice(0, 5).map((r) => ({
            headline: r.headline,
            adText: r.ad_text,
            imageUrl: r.image_url,
            adLibraryUrl: r.ad_archive_id
              ? `https://www.facebook.com/ads/library/?id=${r.ad_archive_id}`
              : appUrl,
          })),
          dashboardUrl: `${appUrl}/competitors/${competitor.id}`,
        });
      } catch {
        // Email failure should not block the scan response
      }
    }

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      records: result.records.length,
      debug: { startUrl: result.startUrl, pageId: pageId ?? null },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Scrape failed";
    // BillingError surfaces with a `code` so the client UI can
    // route to "configure your provider keys" instead of showing
    // a generic 500. We don't import the class to keep this
    // route's coupling low — duck-typing on the shape.
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
    // Refund credits on failure (no-op in subscription mode anyway).
    await refundCredits(user.id, "scan_meta", `Meta Ads scan: ${competitor.page_name}`);
    const httpStatus =
      billingCode === "MISSING_KEY" || billingCode === "INVALID_KEY" ? 400 : 500;
    return NextResponse.json({ error: message, code: billingCode }, { status: httpStatus });
  }
}
