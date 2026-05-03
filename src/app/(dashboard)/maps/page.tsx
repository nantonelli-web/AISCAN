import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLocale, serverT } from "@/lib/i18n/server";
import { MapsPageClient } from "./maps-page-client";

export const dynamic = "force-dynamic";

export default async function MapsPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  // Pull every search + the place/review counts in one trip. The
  // counts come from a head-only aggregate so the dashboard can
  // surface "12 places, 80 reviews" without paying for the row
  // payload up front.
  const { data: searches, error } = await supabase
    .from("mait_maps_searches")
    .select(
      "id, search_term, location_query, language, country_code, max_places, max_reviews_per_place, label, is_active, last_scraped_at, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[/maps page]", error);
  }

  // Per-search place + review tally. Both queries are workspace-
  // scoped under RLS, so we just count rows per search_id.
  const ids = (searches ?? []).map((s) => s.id);
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
      const sid = (p as { search_id: string }).search_id;
      placeCounts.set(sid, (placeCounts.get(sid) ?? 0) + 1);
    }
    for (const r of rRows ?? []) {
      const inner = (r as { mait_maps_places: unknown }).mait_maps_places as
        | { search_id: string }
        | { search_id: string }[]
        | null;
      const sid = Array.isArray(inner) ? inner[0]?.search_id : inner?.search_id;
      if (sid) {
        reviewCounts.set(sid, (reviewCounts.get(sid) ?? 0) + 1);
      }
    }
  }

  const enriched = (searches ?? []).map((s) => ({
    ...s,
    places_count: placeCounts.get(s.id) ?? 0,
    reviews_count: reviewCounts.get(s.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <Link
        href="/monitoring"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("monitoring", "backLabel")}
      </Link>
      <header className="space-y-1">
        <h1 className="text-3xl font-serif tracking-tight">{t("maps", "title")}</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          {t("maps", "subtitle")}
        </p>
      </header>

      <MapsPageClient initialSearches={enriched as never[]} />
    </div>
  );
}
