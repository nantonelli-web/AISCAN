import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Globe,
  Star,
  Phone,
  ExternalLink,
  Building2,
  MessageSquare,
  CheckCircle2,
  Lock,
  AlertOctagon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getLocale, serverT } from "@/lib/i18n/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface BrandRef {
  id: string;
  page_name: string;
  google_domain: string | null;
}

interface PlaceRow {
  id: string;
  place_id: string;
  title: string | null;
  category_name: string | null;
  categories: string[] | null;
  address: string | null;
  city: string | null;
  country_code: string | null;
  website: string | null;
  normalized_domain: string | null;
  phone: string | null;
  total_score: number | null;
  reviews_count: number;
  price: string | null;
  rank: number | null;
  permanently_closed: boolean;
  temporarily_closed: boolean;
  image_url: string | null;
  url: string | null;
  reviews: ReviewRow[];
}

interface ReviewRow {
  id: string;
  text: string | null;
  text_translated: string | null;
  stars: number | null;
  detailed_ratings: Record<string, unknown> | null;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  is_local_guide: boolean;
  reviewer_review_count: number | null;
  published_at: string | null;
  publish_at_text: string | null;
  response_from_owner_text: string | null;
  language: string | null;
}

export default async function MapsSearchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [{ data: search, error }, { data: placesRaw }, { data: brandRows }] =
    await Promise.all([
      supabase
        .from("mait_maps_searches")
        .select(
          "id, workspace_id, search_term, location_query, language, country_code, max_places, max_reviews_per_place, label, last_scraped_at, created_at",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("mait_maps_places")
        .select(
          "id, place_id, title, category_name, categories, address, city, country_code, website, normalized_domain, phone, total_score, reviews_count, price, rank, permanently_closed, temporarily_closed, image_url, url",
        )
        .eq("search_id", id)
        .order("rank", { ascending: true, nullsFirst: false }),
      supabase
        .from("mait_competitors")
        .select("id, page_name, google_domain")
        .eq("workspace_id", profile.workspace_id!),
    ]);

  if (error || !search) notFound();

  const places = (placesRaw ?? []) as Omit<PlaceRow, "reviews">[];
  // Pull reviews for the places we just loaded — single round trip
  // since we already have the place IDs.
  const placeIds = places.map((p) => p.id);
  let reviewsByPlace = new Map<string, ReviewRow[]>();
  if (placeIds.length > 0) {
    const { data: reviewsRaw } = await supabase
      .from("mait_maps_reviews")
      .select(
        "id, place_id, text, text_translated, stars, detailed_ratings, reviewer_name, reviewer_photo_url, is_local_guide, reviewer_review_count, published_at, publish_at_text, response_from_owner_text, language",
      )
      .in("place_id", placeIds)
      .order("published_at", { ascending: false, nullsFirst: false });
    reviewsByPlace = new Map<string, ReviewRow[]>();
    for (const r of (reviewsRaw ?? []) as (ReviewRow & {
      place_id: string;
    })[]) {
      const list = reviewsByPlace.get(r.place_id) ?? [];
      list.push(r);
      reviewsByPlace.set(r.place_id, list);
    }
  }

  // Brand domain → BrandRef map for the highlight banner.
  const brandDomains = new Map<string, BrandRef>();
  for (const b of (brandRows ?? []) as BrandRef[]) {
    if (b.google_domain) {
      brandDomains.set(b.google_domain.toLowerCase(), b);
    }
  }

  // Aggregate stats for the search header.
  const totalReviews = places.reduce(
    (sum, p) => sum + (reviewsByPlace.get(p.id)?.length ?? 0),
    0,
  );
  const avgScore =
    places.length > 0
      ? places.reduce((sum, p) => sum + (p.total_score ?? 0), 0) /
        places.length
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/maps"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {t("maps", "backToMaps")}
        </Link>
      </div>

      {/* ─── Hero ───────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-start gap-3">
          <MapPin className="size-6 text-gold mt-1 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-serif tracking-tight break-words">
              {search.search_term}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              @ {search.location_query}
            </p>
            {search.label && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                {search.label}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            <Globe className="size-3 mr-1" />
            {search.country_code}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {search.language}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            ≤ {search.max_places} {t("maps", "places")}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            ≤ {search.max_reviews_per_place} {t("maps", "reviews")}/place
          </Badge>
        </div>
      </section>

      {/* ─── KPIs ──────────────────────────────────────── */}
      {places.length > 0 ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-semibold tabular-nums">
                {places.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("maps", "places")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-semibold tabular-nums">
                {totalReviews}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("maps", "reviewsScanned")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-semibold tabular-nums">
                {avgScore != null ? avgScore.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("maps", "avgScore")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-semibold tabular-nums">
                {formatNumber(
                  places.reduce((s, p) => s + (p.reviews_count ?? 0), 0),
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("maps", "lifetimeReviews")}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {t("maps", "noScanYet")}
          </CardContent>
        </Card>
      )}

      {/* ─── Places list ──────────────────────────────── */}
      {places.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-gold" />
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {t("maps", "places")}
            </h2>
            <span className="text-xs text-muted-foreground">
              ({places.length})
            </span>
          </div>
          <div className="space-y-3">
            {places.map((p) => {
              const reviews = reviewsByPlace.get(p.id) ?? [];
              const brand = p.normalized_domain
                ? brandDomains.get(p.normalized_domain.toLowerCase())
                : null;
              return (
                <Card
                  key={p.id}
                  className={brand ? "border-l-2 border-l-gold/60" : undefined}
                >
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start gap-4">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt={p.title ?? "place"}
                          className="size-16 rounded-md object-cover border border-border shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="size-16 rounded-md bg-muted border border-border shrink-0 grid place-items-center text-muted-foreground">
                          <Building2 className="size-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.rank && (
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              #{p.rank}
                            </span>
                          )}
                          <h3 className="text-base font-medium truncate">
                            {p.title ?? "—"}
                          </h3>
                          {brand && (
                            <Badge variant="gold" className="text-[10px]">
                              {brand.page_name}
                            </Badge>
                          )}
                          {p.permanently_closed && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-red-400 border-red-400/40"
                            >
                              <Lock className="size-3 mr-1" />
                              {t("maps", "permanentlyClosed")}
                            </Badge>
                          )}
                          {p.temporarily_closed && !p.permanently_closed && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-amber-400 border-amber-400/40"
                            >
                              <AlertOctagon className="size-3 mr-1" />
                              {t("maps", "temporarilyClosed")}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {p.total_score != null && (
                            <span className="flex items-center gap-1">
                              <Star className="size-3 text-gold fill-gold" />
                              <b className="text-foreground tabular-nums">
                                {p.total_score.toFixed(1)}
                              </b>
                              {p.reviews_count > 0 && (
                                <span>
                                  ({formatNumber(p.reviews_count)})
                                </span>
                              )}
                            </span>
                          )}
                          {p.category_name && <span>{p.category_name}</span>}
                          {p.price && <span>{p.price}</span>}
                        </div>
                        {p.address && (
                          <p className="text-xs text-muted-foreground">
                            {p.address}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          {p.website && (
                            <a
                              href={p.website}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-gold flex items-center gap-1"
                            >
                              <Globe className="size-3" />
                              {p.normalized_domain ??
                                p.website.replace(
                                  /^https?:\/\/(www\.)?/,
                                  "",
                                )}
                            </a>
                          )}
                          {p.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="size-3" />
                              {p.phone}
                            </span>
                          )}
                          {p.url && (
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-gold flex items-center gap-1 ml-auto"
                            >
                              {t("maps", "viewOnMaps")}
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reviews — compact list, max 5 inline. The user
                        can re-scan to refresh; further reviews are
                        out of scope for this iteration. */}
                    {reviews.length > 0 && (
                      <div className="space-y-2 pt-3 border-t border-border">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="size-3.5 text-muted-foreground" />
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {reviews.length} {t("maps", "reviews")}
                          </span>
                        </div>
                        <ul className="space-y-2">
                          {reviews.slice(0, 5).map((r) => (
                            <li
                              key={r.id}
                              className="rounded-md bg-muted/30 p-3 text-xs space-y-1"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                {r.reviewer_photo_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={r.reviewer_photo_url}
                                    alt={r.reviewer_name ?? "reviewer"}
                                    className="size-5 rounded-full border border-border"
                                    loading="lazy"
                                  />
                                ) : null}
                                <span className="font-medium">
                                  {r.reviewer_name ?? "—"}
                                </span>
                                {r.is_local_guide && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] py-0 px-1.5"
                                  >
                                    <CheckCircle2 className="size-2.5 mr-0.5" />
                                    LG
                                  </Badge>
                                )}
                                {r.stars != null && (
                                  <span className="flex items-center gap-0.5 text-gold tabular-nums">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <Star
                                        key={i}
                                        className={
                                          i < (r.stars ?? 0)
                                            ? "size-3 fill-gold"
                                            : "size-3 opacity-30"
                                        }
                                      />
                                    ))}
                                  </span>
                                )}
                                <span className="text-muted-foreground/70 ml-auto">
                                  {r.publish_at_text ??
                                    (r.published_at
                                      ? new Date(
                                          r.published_at,
                                        ).toLocaleDateString()
                                      : "")}
                                </span>
                              </div>
                              {(r.text || r.text_translated) && (
                                <p className="text-muted-foreground leading-relaxed">
                                  {r.text ?? r.text_translated}
                                </p>
                              )}
                              {r.response_from_owner_text && (
                                <div className="mt-2 pl-3 border-l-2 border-gold/40">
                                  <p className="text-[10px] uppercase tracking-wider text-gold">
                                    {t("maps", "ownerResponse")}
                                  </p>
                                  <p className="text-muted-foreground/90 leading-relaxed">
                                    {r.response_from_owner_text}
                                  </p>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                        {reviews.length > 5 && (
                          <p className="text-[10px] text-muted-foreground italic">
                            +{reviews.length - 5} {t("maps", "moreReviewsHint")}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
