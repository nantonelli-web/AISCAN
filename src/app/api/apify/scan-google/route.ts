import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  startGoogleAdsScan,
  cleanAdvertiserDomain,
} from "@/lib/apify/google-ads-service";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import { checkScanConcurrency } from "@/lib/rate-limit/scan-concurrency";
import { logger } from "@/lib/logger";

// Async fire-and-forget: lanciamo il run su Apify e ritorniamo
// immediatamente. La finalizzazione (fetch dataset + upsert ads)
// avviene in /api/apify/webhooks/google-ads quando Apify ci chiama
// alla fine del run. Quindi un cap di 30s e' piu' che sufficiente
// per kick-off + insert job + qualche retry transient.
export const maxDuration = 30;

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

  // Guard contro "ghost scan": senza webhook secret o app URL,
  // Apify non puo' richiamarci → il job resterebbe in 'running' per
  // sempre e gli ads scrapati non verrebbero mai persistiti. Meglio
  // rifiutare lo start in modo esplicito e dire quale env var manca.
  {
    const missing: string[] = [];
    if (!process.env.APIFY_WEBHOOK_SECRET) missing.push("APIFY_WEBHOOK_SECRET");
    if (!process.env.NEXT_PUBLIC_APP_URL) missing.push("NEXT_PUBLIC_APP_URL");
    if (missing.length > 0) {
      logger.error(
        `webhook env vars mancanti su questa function: ${missing.join(", ")}`,
        {
          channel: "scan-google",
          event: "scan.config_missing",
          userId: user.id,
          competitorId: parsed.data.competitor_id,
          missing,
        },
      );
      return NextResponse.json(
        {
          error: `Webhook config mancante: ${missing.join(", ")}. Verifica che siano settate in Vercel per l'ambiente corrente (Production e Preview) e fai un redeploy.`,
          missing,
        },
        { status: 503 },
      );
    }
  }

  // Validate ownership via RLS read
  const { data: competitor, error: compErr } = await supabase
    .from("mait_competitors")
    .select(
      "id, workspace_id, page_name, google_advertiser_id, google_domain, country",
    )
    .eq("id", parsed.data.competitor_id)
    .single();

  if (compErr || !competitor) {
    return NextResponse.json(
      { error: "Competitor not found" },
      { status: 404 },
    );
  }

  if (!competitor.google_advertiser_id && !competitor.google_domain) {
    return NextResponse.json(
      {
        error:
          "Nessun Google Advertiser ID o dominio configurato per questo competitor.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Cleanup stale jobs prima del concurrency gate. Async flow:
  // un job 'running' senza webhook_received_at dopo 35 min e' stale
  // (il run Apify avrebbe timeoutato a 30 min e ci avrebbe chiamato).
  const staleCutoff = new Date(Date.now() - 35 * 60 * 1000).toISOString();
  await admin
    .from("mait_scrape_jobs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error: "Timeout (stale, no webhook received within 35min)",
    })
    .eq("competitor_id", competitor.id)
    .eq("status", "running")
    .lt("started_at", staleCutoff);

  const rate = await checkScanConcurrency(admin, {
    workspaceId: competitor.workspace_id,
    competitorId: competitor.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.reason }, { status: rate.reason === "cost_cap" ? 402 : 429 });
  }

  const credits = await consumeCredits(
    user.id,
    "scan_google",
    `Google Ads scan: ${competitor.page_name}`,
  );
  if (!credits.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credits.balance, cost: 2 },
      { status: 402 },
    );
  }

  // Auto-heal legacy google_domain values stored as full URLs.
  if (competitor.google_domain) {
    const cleaned = cleanAdvertiserDomain(competitor.google_domain);
    if (cleaned && cleaned !== competitor.google_domain) {
      await admin
        .from("mait_competitors")
        .update({ google_domain: cleaned })
        .eq("id", competitor.id);
      competitor.google_domain = cleaned;
    }
  }

  // Snapshot delle opzioni: il webhook handler le riusera' per
  // ricostruire il filtro advertiser-id, il filtro date range,
  // il dedup, ecc. Salviamo TUTTO cio' che serve a finalize().
  const scanOptions = {
    advertiserId: competitor.google_advertiser_id ?? null,
    advertiserDomain: competitor.google_domain ?? null,
    advertiserName:
      !competitor.google_advertiser_id && !competitor.google_domain
        ? competitor.page_name ?? null
        : null,
    dateFrom: parsed.data.date_from ?? null,
    dateTo: parsed.data.date_to ?? null,
    maxResults: parsed.data.max_items ?? 500,
    country: competitor.country ?? null,
    competitorPageName: competitor.page_name ?? null,
  };

  // Create job row PRIMA di lanciare Apify cosi se l'insert fallisce
  // (unique violation: gia' running) non sprechiamo una run.
  const { data: job, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .insert({
      workspace_id: competitor.workspace_id,
      competitor_id: competitor.id,
      status: "running",
      source: "google",
      date_from: parsed.data.date_from ?? null,
      date_to: parsed.data.date_to ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    if ((jobErr as { code?: string } | null)?.code === "23505") {
      await refundCredits(
        user.id,
        "scan_google",
        `Google Ads scan race-rejected: ${competitor.page_name}`,
      );
      return NextResponse.json({ error: "already_running" }, { status: 429 });
    }
    return NextResponse.json(
      { error: jobErr?.message ?? "Job error" },
      { status: 500 },
    );
  }

  try {
    const result = await startGoogleAdsScan({
      advertiserId: scanOptions.advertiserId ?? undefined,
      advertiserDomain: scanOptions.advertiserDomain ?? undefined,
      advertiserName: scanOptions.advertiserName ?? undefined,
      dateFrom: scanOptions.dateFrom ?? undefined,
      dateTo: scanOptions.dateTo ?? undefined,
      maxResults: scanOptions.maxResults,
      country: scanOptions.country ?? undefined,
      workspaceId: competitor.workspace_id,
    });

    // Update job con runId+datasetId+scan_options. Il webhook handler
    // matcha su apify_run_id e usa scan_options per ricostruire opts.
    // webhookRegistration: tracciamo per audit se il persistent webhook
    // e' stato registrato correttamente — se no l'utente vedra' i job
    // restare 'running' e potra' usare "Recupera dati" come fallback.
    await admin
      .from("mait_scrape_jobs")
      .update({
        apify_run_id: result.runId,
        dataset_id: result.datasetId,
        scan_options: {
          ...scanOptions,
          urlRegionList: result.urlRegionList,
          actorId: result.actorId,
          webhookRegistration: result.webhookRegistration ?? null,
        },
      })
      .eq("id", job.id);

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      run_id: result.runId,
      dataset_id: result.datasetId,
      status: "running",
      webhooks_configured: result.webhooksConfigured,
      message: result.webhooksConfigured
        ? "Scan avviato. Riceverai i risultati appena Apify completera' il run (la pagina si aggiornera' da sola)."
        : "Scan avviato MA senza webhook: l'app non ricevera' callback automatico, dovrai usare 'Recupera dati' al termine.",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Scrape start failed";
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
      "scan_google",
      `Google Ads scan start-failed: ${competitor.page_name}`,
    );
    const httpStatus =
      billingCode === "MISSING_KEY" || billingCode === "INVALID_KEY" ? 400 : 500;
    return NextResponse.json(
      { error: message, code: billingCode },
      { status: httpStatus },
    );
  }
}
