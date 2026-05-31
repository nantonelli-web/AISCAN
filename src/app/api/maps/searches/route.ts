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

  // Per-search place + review counts via SQL GROUP BY (RPC) instead of
  // streaming every place + review row in the workspace to count them.
  const placeCounts = new Map<string, number>();
  const reviewCounts = new Map<string, number>();
  if ((data ?? []).length > 0) {
    const { data: profileRow } = await supabase
      .from("mait_users")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();
    const workspaceId = profileRow?.workspace_id as string | undefined;
    if (workspaceId) {
      const { data: countRows } = await supabase.rpc(
        "mait_maps_search_counts",
        { p_workspace_id: workspaceId },
      );
      for (const row of (countRows ?? []) as {
        search_id: string;
        place_count: number;
        review_count: number;
      }[]) {
        placeCounts.set(row.search_id, Number(row.place_count));
        reviewCounts.set(row.search_id, Number(row.review_count));
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
      // compass/crawler-google-places vuole il codice paese ISO-2
      // minuscolo. Mantengo lowercase anche nel DB cosi le ricerche
      // esistenti restano coerenti col formato richiesto dall actor.
      country_code: (parsed.data.country_code ?? "it").toLowerCase(),
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
