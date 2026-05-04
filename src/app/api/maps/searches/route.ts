import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  cleanMapsSearchTerm,
  cleanMapsLocationQuery,
} from "@/lib/maps/service";

const postSchema = z.object({
  search_term: z.string().min(1).max(200),
  location_query: z.string().min(1).max(200),
  language: z.string().length(2).optional(),
  country_code: z.string().length(2).optional(),
  max_places: z.number().int().min(1).max(100).optional(),
  max_reviews_per_place: z.number().int().min(0).max(50).optional(),
  label: z.string().max(160).nullable().optional(),
});

/** GET — list every Maps search with the place count summary. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("mait_maps_searches")
    .select(
      "id, search_term, location_query, language, country_code, max_places, max_reviews_per_place, label, is_active, last_scraped_at, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/maps/searches GET]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Per-search place + review counts, computed in parallel. Cheap on
  // the DB side (head+exact, no row transfer) and avoids a "fetched 0
  // places" surprise when the latest scan was empty.
  const ids = (data ?? []).map((s) => s.id);
  const placeCounts = new Map<string, number>();
  const reviewCounts = new Map<string, number>();
  if (ids.length > 0) {
    const [{ data: pRows }, { data: rRows }] = await Promise.all([
      supabase
        .from("mait_maps_places")
        .select("search_id")
        .in("search_id", ids),
      supabase
        .from("mait_maps_reviews")
        .select("place_id, mait_maps_places!inner(search_id)")
        .in("mait_maps_places.search_id", ids),
    ]);
    for (const p of pRows ?? []) {
      placeCounts.set(
        p.search_id as string,
        (placeCounts.get(p.search_id as string) ?? 0) + 1,
      );
    }
    for (const r of rRows ?? []) {
      const p = r.mait_maps_places as
        | { search_id: string }
        | { search_id: string }[]
        | null;
      const sid = Array.isArray(p) ? p[0]?.search_id : p?.search_id;
      if (sid) {
        reviewCounts.set(sid, (reviewCounts.get(sid) ?? 0) + 1);
      }
    }
  }

  const enriched = (data ?? []).map((s) => ({
    ...s,
    places_count: placeCounts.get(s.id) ?? 0,
    reviews_count: reviewCounts.get(s.id) ?? 0,
  }));

  return NextResponse.json({ searches: enriched });
}

/** POST — create a new Maps search. */
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
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id, role")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!["super_admin", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const term = cleanMapsSearchTerm(parsed.data.search_term);
  const loc = cleanMapsLocationQuery(parsed.data.location_query);
  if (!term || !loc) {
    return NextResponse.json({ error: "Search non valida" }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from("mait_maps_searches")
    .insert({
      workspace_id: profile.workspace_id,
      search_term: term,
      location_query: loc,
      language: (parsed.data.language ?? "it").toLowerCase(),
      country_code: (parsed.data.country_code ?? "IT").toUpperCase(),
      max_places: parsed.data.max_places ?? 20,
      max_reviews_per_place: parsed.data.max_reviews_per_place ?? 10,
      label: parsed.data.label ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    if (error?.code === "23505") {
      return NextResponse.json(
        {
          error:
            "Ricerca già esistente per questa combinazione termine/location/paese/lingua.",
        },
        { status: 409 },
      );
    }
    console.error("[api/maps/searches POST]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ id: inserted.id });
}
