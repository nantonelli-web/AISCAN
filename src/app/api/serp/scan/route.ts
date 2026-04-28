import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeSerpQuery } from "@/lib/serp/service";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";

export const maxDuration = 300; // seconds

const schema = z.object({
  query_id: z.string().uuid(),
});

/**
 * Scan a SERP query. Unlike the Class A scans (Meta/IG/TikTok/Snap/YT)
 * this endpoint does NOT touch a competitor — the entity scanned is
 * the query itself. The optional brand association lives in
 * mait_serp_query_brands and is resolved at render time, not at scan
 * time.
 */
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

  const { data: queryRow, error: qErr } = await supabase
    .from("mait_serp_queries")
    .select("id, workspace_id, query, country, language, device, label")
    .eq("id", parsed.data.query_id)
    .single();

  if (qErr || !queryRow) {
    return NextResponse.json({ error: "Query not found" }, { status: 404 });
  }

  const admin = createAdminClient();

  const credits = await consumeCredits(
    user.id,
    "scan_serp",
    `SERP scan: "${queryRow.query}"`,
  );
  if (!credits.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credits.balance, cost: 1 },
      { status: 402 },
    );
  }

  try {
    const result = await scrapeSerpQuery({
      query: queryRow.query,
      countryCode: queryRow.country,
      languageCode: queryRow.language,
      device: queryRow.device === "MOBILE" ? "MOBILE" : "DESKTOP",
    });

    // Insert the run row first so we have a stable id to reference
    // from each result row (FK).
    const { data: runRow, error: runErr } = await admin
      .from("mait_serp_runs")
      .insert({
        workspace_id: queryRow.workspace_id,
        query_id: queryRow.id,
        apify_run_id: result.runId,
        organic_count: result.organicCount,
        paid_count: result.paidCount,
        paid_products_count: result.paidProductsCount,
        has_ai_overview: result.hasAiOverview,
        related_queries: result.relatedQueries,
        people_also_ask: result.peopleAlsoAsk,
        raw_data: result.rawResponse,
        cost_cu: result.costCu,
      })
      .select("id")
      .single();

    if (runErr || !runRow) {
      throw runErr ?? new Error("Failed to insert SERP run");
    }

    // Bulk-insert all normalised results in one round-trip.
    if (result.results.length > 0) {
      const rows = result.results.map((r) => ({
        ...r,
        workspace_id: queryRow.workspace_id,
        run_id: runRow.id,
        query_id: queryRow.id,
      }));
      const { error: insErr } = await admin
        .from("mait_serp_results")
        .insert(rows);
      if (insErr) {
        console.error(`[SERP route] Results insert error:`, insErr);
        throw insErr;
      }
    }

    await admin
      .from("mait_serp_queries")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", queryRow.id);

    return NextResponse.json({
      ok: true,
      run_id: runRow.id,
      query_id: queryRow.id,
      results_count: result.results.length,
      organic_count: result.organicCount,
      paid_count: result.paidCount,
      paid_products_count: result.paidProductsCount,
      has_ai_overview: result.hasAiOverview,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "SERP scrape failed";
    console.error(`[SERP route] FAILED:`, e);
    await refundCredits(
      user.id,
      "scan_serp",
      `SERP scan: "${queryRow.query}"`,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
