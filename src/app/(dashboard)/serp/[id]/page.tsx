import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Megaphone,
  ShoppingBag,
  Sparkles,
  Globe,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getLocale, serverT } from "@/lib/i18n/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

interface BrandRef {
  id: string;
  page_name: string;
  google_domain: string | null;
}

export default async function SerpQueryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [{ data: query, error }, { data: brands }, { data: latestRun }] =
    await Promise.all([
      supabase
        .from("mait_serp_queries")
        .select(
          "id, workspace_id, query, country, language, device, label, last_scraped_at, created_at",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("mait_serp_query_brands")
        .select("competitor_id, mait_competitors(id, page_name, google_domain)")
        .eq("query_id", id),
      supabase
        .from("mait_serp_runs")
        .select(
          "id, scraped_at, organic_count, paid_count, paid_products_count, has_ai_overview, related_queries, people_also_ask",
        )
        .eq("query_id", id)
        .order("scraped_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (error || !query) notFound();

  // Supabase types the embedded relation as an array even when the
  // FK guarantees a single row. Cast through unknown and accept
  // either shape so the runtime data lands cleanly.
  const brandList: BrandRef[] = (brands ?? [])
    .map((b) => {
      const c = (b as { mait_competitors: BrandRef | BrandRef[] | null })
        .mait_competitors;
      if (!c) return null;
      return Array.isArray(c) ? c[0] ?? null : c;
    })
    .filter((b): b is BrandRef => !!b);

  // Fast path for "no scan yet": render the empty state without the
  // results query.
  let results: {
    id: string;
    result_type: string;
    position: number | null;
    url: string | null;
    normalized_domain: string | null;
    displayed_url: string | null;
    title: string | null;
    description: string | null;
    image_url: string | null;
    date_text: string | null;
  }[] = [];

  if (latestRun?.id) {
    const { data: r } = await supabase
      .from("mait_serp_results")
      .select(
        "id, result_type, position, url, normalized_domain, displayed_url, title, description, image_url, date_text",
      )
      .eq("run_id", latestRun.id)
      .order("position", { ascending: true, nullsFirst: false });
    results = r ?? [];
  }

  // Build a domain lookup so we can highlight rows that match a
  // linked brand (or any brand in the workspace, since the user
  // probably wants to know "is any of my tracked brands ranking?").
  const brandDomains = new Map<string, BrandRef>();
  for (const b of brandList) {
    if (b.google_domain) {
      brandDomains.set(b.google_domain.toLowerCase(), b);
    }
  }

  // Group results by type for cleaner rendering.
  const organicResults = results.filter((r) => r.result_type === "organic");
  const paidResults = results.filter((r) => r.result_type === "paid");
  const paidProducts = results.filter((r) => r.result_type === "paid_product");
  const aiSources = results.filter((r) => r.result_type === "ai_source");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/serp"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {t("serp", "backToSerp")}
        </Link>
      </div>

      {/* ─── Hero ──────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-start gap-3">
          <Search className="size-6 text-gold mt-1 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-serif tracking-tight break-words">
              {query.query}
            </h1>
            {query.label && (
              <p className="text-sm text-muted-foreground mt-1">{query.label}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            <Globe className="size-3 mr-1" />
            {query.country}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {query.language}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {query.device}
          </Badge>
          {brandList.map((b) => (
            <Badge key={b.id} variant="gold" className="text-[10px]">
              {b.page_name}
            </Badge>
          ))}
        </div>
      </section>

      {/* ─── Latest scan summary ───────────────────────────── */}
      {latestRun ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-semibold tabular-nums">
                {latestRun.organic_count}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("serp", "organicResults")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-semibold tabular-nums">
                {latestRun.paid_count}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("serp", "paidResults")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-semibold tabular-nums">
                {latestRun.paid_products_count}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("serp", "paidProducts")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-semibold">
                {latestRun.has_ai_overview ? "✓" : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("serp", "aiOverview")}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {t("serp", "noScanYet")}
          </CardContent>
        </Card>
      )}

      {/* ─── Paid results ─────────────────────────────────── */}
      {paidResults.length > 0 && (
        <ResultGroup
          title={t("serp", "paidResults")}
          icon={<Megaphone className="size-4 text-gold" />}
          items={paidResults}
          brandDomains={brandDomains}
        />
      )}

      {/* ─── Paid products ────────────────────────────────── */}
      {paidProducts.length > 0 && (
        <ResultGroup
          title={t("serp", "paidProducts")}
          icon={<ShoppingBag className="size-4 text-gold" />}
          items={paidProducts}
          brandDomains={brandDomains}
        />
      )}

      {/* ─── Organic results ──────────────────────────────── */}
      {organicResults.length > 0 && (
        <ResultGroup
          title={t("serp", "organicResults")}
          icon={<Search className="size-4 text-gold" />}
          items={organicResults}
          brandDomains={brandDomains}
        />
      )}

      {/* ─── AI sources ───────────────────────────────────── */}
      {aiSources.length > 0 && (
        <ResultGroup
          title={t("serp", "aiSources")}
          icon={<Sparkles className="size-4 text-gold" />}
          items={aiSources}
          brandDomains={brandDomains}
        />
      )}
    </div>
  );
}

function ResultGroup({
  title,
  icon,
  items,
  brandDomains,
}: {
  title: string;
  icon: React.ReactNode;
  items: {
    id: string;
    position: number | null;
    url: string | null;
    normalized_domain: string | null;
    displayed_url: string | null;
    title: string | null;
    description: string | null;
    date_text: string | null;
  }[];
  brandDomains: Map<string, BrandRef>;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {items.map((r) => {
            const brand = r.normalized_domain
              ? brandDomains.get(r.normalized_domain.toLowerCase())
              : null;
            return (
              <div
                key={r.id}
                className={
                  brand
                    ? "p-4 bg-gold/5 border-l-2 border-l-gold/60"
                    : "p-4"
                }
              >
                <div className="flex items-start gap-3">
                  <span className="text-[11px] text-muted-foreground tabular-nums w-6 shrink-0 pt-0.5">
                    {r.position != null ? `#${r.position}` : "—"}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.title && (
                        <a
                          href={r.url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium hover:text-gold transition-colors line-clamp-1"
                        >
                          {r.title}
                        </a>
                      )}
                      {brand && (
                        <Badge variant="gold" className="text-[10px]">
                          {brand.page_name}
                        </Badge>
                      )}
                    </div>
                    {r.displayed_url && (
                      <p className="text-[11px] text-muted-foreground/80 truncate">
                        {r.displayed_url}
                      </p>
                    )}
                    {r.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {r.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-0.5">
                      {r.normalized_domain && (
                        <span className="tabular-nums">
                          {r.normalized_domain}
                        </span>
                      )}
                      {r.date_text && <span>{r.date_text}</span>}
                      {r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-gold flex items-center gap-1 ml-auto"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
