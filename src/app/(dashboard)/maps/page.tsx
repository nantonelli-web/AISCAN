import { Lightbulb } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getLocale, serverT } from "@/lib/i18n/server";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { MapsPageClient } from "./maps-page-client";

export const dynamic = "force-dynamic";

export default async function MapsPage() {
  const supabase = await createClient();
  const { profile } = await getSessionUser();
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

  // Per-search place + review tally via SQL GROUP BY (RPC) instead of
  // streaming every place AND every review row in the workspace into Node
  // just to count them — reviews are the largest table and grow with
  // every re-scan.
  const placeCounts = new Map<string, number>();
  const reviewCounts = new Map<string, number>();
  if ((searches ?? []).length > 0 && profile.workspace_id) {
    const { data: countRows } = await supabase.rpc("mait_maps_search_counts", {
      p_workspace_id: profile.workspace_id,
    });
    for (const row of (countRows ?? []) as {
      search_id: string;
      place_count: number;
      review_count: number;
    }[]) {
      placeCounts.set(row.search_id, Number(row.place_count));
      reviewCounts.set(row.search_id, Number(row.review_count));
    }
  }

  const enriched = (searches ?? []).map((s) => ({
    ...s,
    places_count: placeCounts.get(s.id) ?? 0,
    reviews_count: reviewCounts.get(s.id) ?? 0,
  }));

  return (
    <div className="space-y-8">
      {/* Maps è uno strumento brand-driven raggiunto dal tab Maps del
          dettaglio brand; il back torna ai Brand. */}
      <DynamicBackLink fallbackHref="/brands" label={t("common", "backToBrands")} />
      <header className="space-y-1">
        <h1 className="text-3xl font-serif tracking-tight">{t("maps", "title")}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {t("maps", "subtitle")}
        </p>
      </header>

      {/* Explainer: Maps va oltre la scheda del brand — ricerca per
          categoria/località e mappatura competitor locali. */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3.5">
        <div className="size-8 rounded-lg bg-gold/15 text-gold grid place-items-center shrink-0">
          <Lightbulb className="size-4" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">{t("maps", "explainerTitle")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
            {t("maps", "explainerBody")}
          </p>
        </div>
      </div>

      <MapsPageClient initialSearches={enriched as never[]} />
    </div>
  );
}
