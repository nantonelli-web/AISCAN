import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeMapsPlaces } from "@/lib/maps/service";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";

export const maxDuration = 300; // seconds

const schema = z.object({
  search_id: z.string().uuid(),
});

/**
 * Scan a Maps search (Class B). Returns N places, each with bundled
 * reviews — same actor run, no second call. Places upsert on
 * (workspace, search, place_id); reviews upsert on
 * (workspace, place, review_id).
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

  const { data: searchRow, error: sErr } = await supabase
    .from("mait_maps_searches")
    .select(
      "id, workspace_id, search_term, location_query, language, country_code, max_places, max_reviews_per_place, label",
    )
    .eq("id", parsed.data.search_id)
    .single();

  if (sErr || !searchRow) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  const admin = createAdminClient();

  const credits = await consumeCredits(
    user.id,
    "scan_maps",
    `Maps scan: "${searchRow.search_term}" @ ${searchRow.location_query}`,
  );
  if (!credits.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credits.balance, cost: 2 },
      { status: 402 },
    );
  }

  try {
    const result = await scrapeMapsPlaces({
      searchTerm: searchRow.search_term,
      locationQuery: searchRow.location_query,
      language: searchRow.language,
      countryCode: searchRow.country_code,
      maxPlaces: searchRow.max_places,
      maxReviewsPerPlace: searchRow.max_reviews_per_place,
      workspaceId: searchRow.workspace_id,
    });

    if (result.places.length === 0) {
      // Actor returned an empty result. Mark search as scanned but
      // let the user know — refund the credit so a brand-new search
      // with no results doesn't burn the user.
      await admin
        .from("mait_maps_searches")
        .update({ last_scraped_at: new Date().toISOString() })
        .eq("id", searchRow.id);
      await refundCredits(
        user.id,
        "scan_maps",
        `Maps scan (no results): "${searchRow.search_term}"`,
      );
      return NextResponse.json({
        ok: true,
        run_id: null,
        search_id: searchRow.id,
        places_count: 0,
        reviews_count: 0,
        message: "Nessun place trovato per questa ricerca.",
      });
    }

    // Upsert places one by one so we can grab the assigned `id`
    // and use it for the bundled reviews insert. Could batch with
    // an RPC but the per-scan place count is bounded (≤100) so the
    // round-trip cost is acceptable.
    const placeRows = result.places.map((p) => ({
      workspace_id: searchRow.workspace_id,
      search_id: searchRow.id,
      place_id: p.place_id,
      cid: p.cid,
      fid: p.fid,
      kgmid: p.kgmid,
      title: p.title,
      sub_title: p.sub_title,
      description: p.description,
      category_name: p.category_name,
      categories: p.categories,
      price: p.price,
      address: p.address,
      street: p.street,
      city: p.city,
      postal_code: p.postal_code,
      state: p.state,
      country_code: p.country_code,
      neighborhood: p.neighborhood,
      location_lat: p.location_lat,
      location_lng: p.location_lng,
      plus_code: p.plus_code,
      website: p.website,
      normalized_domain: p.normalized_domain,
      phone: p.phone,
      total_score: p.total_score,
      reviews_count: p.reviews_count,
      images_count: p.images_count,
      rank: p.rank,
      is_advertisement: p.is_advertisement,
      permanently_closed: p.permanently_closed,
      temporarily_closed: p.temporarily_closed,
      opening_hours: p.opening_hours,
      additional_info: p.additional_info,
      popular_times: p.popular_times,
      popular_times_live_text: p.popular_times_live_text,
      popular_times_live_percent: p.popular_times_live_percent,
      image_url: p.image_url,
      url: p.url,
      search_page_url: p.search_page_url,
      reserve_table_url: p.reserve_table_url,
      google_food_url: p.google_food_url,
      hotel_stars: p.hotel_stars,
      hotel_description: p.hotel_description,
      raw_data: p.raw_data,
      scraped_at: new Date().toISOString(),
    }));

    const { data: upsertedPlaces, error: placesErr } = await admin
      .from("mait_maps_places")
      .upsert(placeRows, { onConflict: "workspace_id,search_id,place_id" })
      .select("id, place_id");

    if (placesErr) {
      console.error(`[Maps route] Places upsert error:`, placesErr);
      throw placesErr;
    }

    // Map google place_id → AISCAN row id for the reviews insert.
    const placeIdMap = new Map<string, string>();
    for (const row of upsertedPlaces ?? []) {
      placeIdMap.set(row.place_id, row.id);
    }

    // Flatten and tag reviews with the AISCAN place id.
    const reviewRows: Record<string, unknown>[] = [];
    for (const p of result.places) {
      const placeRowId = placeIdMap.get(p.place_id);
      if (!placeRowId) continue;
      for (const r of p.reviews) {
        reviewRows.push({
          workspace_id: searchRow.workspace_id,
          place_id: placeRowId,
          review_id: r.review_id,
          review_url: r.review_url,
          text: r.text,
          text_translated: r.text_translated,
          stars: r.stars,
          detailed_ratings: r.detailed_ratings,
          context: r.context,
          likes_count: r.likes_count,
          language: r.language,
          translated_language: r.translated_language,
          review_image_urls: r.review_image_urls,
          reviewer_name: r.reviewer_name,
          reviewer_url: r.reviewer_url,
          reviewer_id: r.reviewer_id,
          reviewer_photo_url: r.reviewer_photo_url,
          reviewer_review_count: r.reviewer_review_count,
          is_local_guide: r.is_local_guide,
          response_from_owner_text: r.response_from_owner_text,
          response_from_owner_date: r.response_from_owner_date,
          published_at: r.published_at,
          publish_at_text: r.publish_at_text,
          last_edited_at: r.last_edited_at,
          raw_data: r.raw_data,
          scraped_at: new Date().toISOString(),
        });
      }
    }

    if (reviewRows.length > 0) {
      const { error: reviewsErr } = await admin
        .from("mait_maps_reviews")
        .upsert(reviewRows, { onConflict: "workspace_id,place_id,review_id" });
      if (reviewsErr) {
        console.error(`[Maps route] Reviews upsert error:`, reviewsErr);
        throw reviewsErr;
      }
    }

    // Snapshot rank history: append-only, una riga per place per
    // questo scan. Migration 0038. Ci serve per i delta "⬆3 / ⬇1"
    // sul detail. Failure qui non rompe lo scan — log e continua.
    const snapshotRows = result.places.map((p) => ({
      workspace_id: searchRow.workspace_id,
      search_id: searchRow.id,
      place_id: p.place_id,
      rank: p.rank,
      total_score: p.total_score,
      reviews_count: p.reviews_count,
      permanently_closed: p.permanently_closed,
      temporarily_closed: p.temporarily_closed,
      is_advertisement: p.is_advertisement,
    }));
    if (snapshotRows.length > 0) {
      const { error: snapErr } = await admin
        .from("mait_maps_place_snapshots")
        .insert(snapshotRows);
      if (snapErr) {
        console.error(`[Maps route] Snapshot insert error (non-fatal):`, snapErr);
      }
    }

    await admin
      .from("mait_maps_searches")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", searchRow.id);

    return NextResponse.json({
      ok: true,
      search_id: searchRow.id,
      places_count: placeRows.length,
      reviews_count: reviewRows.length,
      apify_run_id: result.runId,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Maps scrape failed";
    const billingCode =
      e && typeof e === "object" && "code" in (e as object)
        ? ((e as { code: unknown }).code as string)
        : null;
    console.error(`[Maps route] FAILED:`, e);
    await refundCredits(
      user.id,
      "scan_maps",
      `Maps scan: "${searchRow.search_term}"`,
    );
    const httpStatus =
      billingCode === "MISSING_KEY" || billingCode === "INVALID_KEY" ? 400 : 500;
    return NextResponse.json({ error: message, code: billingCode }, { status: httpStatus });
  }
}
