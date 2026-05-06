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
  HelpCircle,
  Compass,
  MessageCircleQuestion,
  PieChart,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getLocale, serverT } from "@/lib/i18n/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkedBrandsEditor } from "@/components/serp/linked-brands-editor";

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
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [
    { data: query, error },
    { data: brands },
    { data: allCompetitors },
    { data: latestRun },
    { data: snapshotRows },
  ] = await Promise.all([
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
    // Tutti i competitor del workspace per popolare il picker del
    // LinkedBrandsEditor (Phase C 2026-05-06).
    supabase
      .from("mait_competitors")
      .select("id, page_name, google_domain")
      .eq("workspace_id", profile.workspace_id!)
      .order("page_name", { ascending: true }),
    supabase
      .from("mait_serp_runs")
      .select(
        "id, scraped_at, organic_count, paid_count, paid_products_count, has_ai_overview, related_queries, people_also_ask",
      )
      .eq("query_id", id)
      .order("scraped_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Rank history (Migration 0039): ultimi 200 snapshot ordinati
    // recente-first per calcolare delta best_position vs scan
    // precedente. 200 ≈ 10 scan x 20 domini → cap generoso.
    supabase
      .from("mait_serp_result_snapshots")
      .select("normalized_domain, result_type, best_position, captured_at")
      .eq("query_id", id)
      .order("captured_at", { ascending: false })
      .limit(200),
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

  // Brand presence: per ogni competitor tracciato del workspace
  // (non solo i linked) cerco il match domain nei risultati
  // organic. Restituisce best position per ogni brand matchato.
  const trackedDomains = (allCompetitors ?? []).filter(
    (c): c is BrandRef => !!c.google_domain,
  );
  const brandBestPosition = new Map<string, { brand: BrandRef; pos: number }>();
  for (const r of organicResults) {
    if (!r.normalized_domain || r.position == null) continue;
    const d = r.normalized_domain.toLowerCase();
    const matched = trackedDomains.find(
      (b) => b.google_domain?.toLowerCase() === d,
    );
    if (!matched) continue;
    const existing = brandBestPosition.get(matched.id);
    if (!existing || r.position < existing.pos) {
      brandBestPosition.set(matched.id, { brand: matched, pos: r.position });
    }
  }
  const matchedBrandsCount = brandBestPosition.size;
  const trackedBrandsCount = trackedDomains.length;
  const topBrandMatch = [...brandBestPosition.values()].sort(
    (a, b) => a.pos - b.pos,
  )[0];

  // AI Overview brand citation (Feature SERP #5): match dei domain
  // delle AI sources contro i tracked brands. Battleground SEO
  // 2026 — citazione nell'AI Overview pesa quanto top 3 organic.
  const aiBrandCitations: Array<{
    brand: BrandRef;
    url: string | null;
  }> = [];
  for (const r of aiSources) {
    if (!r.normalized_domain) continue;
    const d = r.normalized_domain.toLowerCase();
    const matched = trackedDomains.find(
      (b) => b.google_domain?.toLowerCase() === d,
    );
    if (matched && !aiBrandCitations.some((x) => x.brand.id === matched.id)) {
      aiBrandCitations.push({ brand: matched, url: r.url });
    }
  }

  // Share of SERP page 1: aggregato top N domini sui risultati
  // organic (i piu' rappresentativi del "vero" ranking, esclusi
  // ads e shopping). Top 7 + "altri" se servono.
  const domainCounts = new Map<string, number>();
  for (const r of organicResults) {
    const d = r.normalized_domain?.toLowerCase();
    if (!d) continue;
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  // Delta rank: per ogni dominio organic ricostruisco la
  // best_position dello snapshot precedente. snapshotRows e' gia
  // ordinato desc per captured_at; il primo per (domain, type) e'
  // lo scan attuale (skip), il secondo e' il precedente.
  const seenDomain = new Set<string>();
  const previousBestByDomain = new Map<string, number>();
  for (const s of (snapshotRows ?? []) as {
    normalized_domain: string;
    result_type: string;
    best_position: number | null;
  }[]) {
    if (s.result_type !== "organic") continue;
    const key = s.normalized_domain.toLowerCase();
    if (!seenDomain.has(key)) {
      seenDomain.add(key);
      continue; // questo e' lo snapshot del scan attuale
    }
    if (!previousBestByDomain.has(key) && s.best_position != null) {
      previousBestByDomain.set(key, s.best_position);
    }
  }

  // Per dominio aggrega anche la best_position attuale (per calcolare
  // il delta vs previousBestByDomain).
  const currentBestByDomain = new Map<string, number>();
  for (const r of organicResults) {
    if (!r.normalized_domain || r.position == null) continue;
    const d = r.normalized_domain.toLowerCase();
    const existing = currentBestByDomain.get(d);
    if (existing == null || r.position < existing) {
      currentBestByDomain.set(d, r.position);
    }
  }

  const sortedDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([domain, count]) => {
      const prev = previousBestByDomain.get(domain);
      const curr = currentBestByDomain.get(domain);
      const delta = prev != null && curr != null ? prev - curr : null;
      return {
        domain,
        count,
        share: organicResults.length > 0 ? (count / organicResults.length) * 100 : 0,
        brand: brandDomains.get(domain) ?? null,
        bestPosition: curr ?? null,
        delta,
      };
    });

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
        </div>
        <LinkedBrandsEditor
          queryId={query.id}
          initialLinkedIds={brandList.map((b) => b.id)}
          allCompetitors={(allCompetitors ?? []) as BrandRef[]}
          labels={{
            title: t("serp", "linkedBrandsTitle"),
            addBrand: t("serp", "addBrand"),
            noneLinked: t("serp", "noneLinked"),
            saveError: t("serp", "saveError"),
            removed: t("serp", "brandRemoved"),
            added: t("serp", "brandAdded"),
          }}
        />
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
          {/* AI Overview card — most opaque of the four because the
              concept (Google's generative answer at the top of SERPs)
              isn't universal yet. We surface:
                • Big value: number of cited AI sources when an
                  Overview exists, em-dash otherwise — keeps visual
                  rhythm with the three numeric cards beside it.
                • Subtitle: explicit state in human language so the
                  user doesn't have to interpret a glyph.
                • Help icon: native HTML title tooltip with the full
                  "what is this and why it matters" explanation so
                  curious users can learn without leaving the page. */}
          <Card>
            <CardContent className="py-4 text-center space-y-1">
              <p
                className={
                  latestRun.has_ai_overview
                    ? "text-2xl font-semibold tabular-nums tone-success"
                    : "text-2xl font-semibold text-muted-foreground"
                }
              >
                {latestRun.has_ai_overview ? aiSources.length : "—"}
              </p>
              <p className="text-xs text-muted-foreground inline-flex items-center justify-center gap-1.5">
                <span>{t("serp", "aiOverview")}</span>
                {/* CSS-only tooltip — no JS, no delay, zero layout
                    shift. The native HTML title attribute on the
                    parent span has a ~1.5s OS delay and renders the
                    text inconsistently across browsers, so we render
                    our own popover via the Tailwind `group-hover`
                    pattern. The popover floats above the rest of the
                    grid via z-50 and a wide max-width so the long
                    explanation reads cleanly. */}
                <span
                  tabIndex={0}
                  aria-label={t("serp", "aiOverviewHelpTitle")}
                  className="relative group inline-flex outline-none"
                >
                  <HelpCircle className="size-3.5 text-muted-foreground/70 group-hover:text-foreground group-focus:text-foreground transition-colors" />
                  <span
                    role="tooltip"
                    className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 transition-opacity pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-72 sm:w-80 rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-3 text-left whitespace-normal"
                  >
                    <span className="block text-xs font-semibold mb-1.5 text-foreground">
                      {t("serp", "aiOverviewHelpTitle")}
                    </span>
                    <span className="block text-[11px] leading-relaxed text-muted-foreground">
                      {t("serp", "aiOverviewHelpBody")}
                    </span>
                  </span>
                </span>
              </p>
              <p
                className={
                  latestRun.has_ai_overview
                    ? "text-[11px] tone-success font-medium"
                    : "text-[11px] text-muted-foreground italic"
                }
              >
                {latestRun.has_ai_overview
                  ? `${aiSources.length === 1 ? t("serp", "aiOverviewSourceSingular") : t("serp", "aiOverviewSourcePlural")}`
                  : t("serp", "aiOverviewAbsent")}
              </p>
              {latestRun.has_ai_overview &&
                trackedBrandsCount > 0 &&
                (aiBrandCitations.length > 0 ? (
                  <div className="flex flex-wrap gap-1 justify-center pt-1">
                    {aiBrandCitations.map(({ brand }) => (
                      <Badge
                        key={brand.id}
                        variant="gold"
                        className="text-[9px] py-0 px-1.5"
                      >
                        {brand.page_name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic">
                    {t("serp", "aiOverviewNoBrandCited")}
                  </p>
                ))}
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

      {/* ─── Brand presence summary ───────────────────────── */}
      {trackedBrandsCount > 0 && organicResults.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-gold" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                {t("serp", "brandPresence")}
              </h2>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug max-w-3xl">
              {t("serp", "brandPresenceDescription")}
            </p>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {matchedBrandsCount}
                  <span className="text-base text-muted-foreground font-normal">
                    {" "}
                    /{trackedBrandsCount}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("serp", "matchedBrands")}
                </p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {topBrandMatch ? `#${topBrandMatch.pos}` : "—"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {topBrandMatch
                    ? topBrandMatch.brand.page_name
                    : t("serp", "noBrandMatch")}
                </p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {brandBestPosition.size > 0
                    ? Math.round(
                        [...brandBestPosition.values()].reduce(
                          (s, x) => s + x.pos,
                          0,
                        ) / brandBestPosition.size,
                      )
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("serp", "avgBrandPosition")}
                </p>
              </div>
            </div>
            {brandBestPosition.size > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[...brandBestPosition.values()]
                  .sort((a, b) => a.pos - b.pos)
                  .map(({ brand, pos }) => (
                    <Badge
                      key={brand.id}
                      variant="gold"
                      className="text-[10px]"
                    >
                      #{pos} {brand.page_name}
                    </Badge>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Share of SERP page 1 ─────────────────────────── */}
      {sortedDomains.length > 0 && (
        <ShareOfSerpPanel
          domains={sortedDomains}
          totalOrganic={organicResults.length}
          title={t("serp", "shareOfSerp")}
          description={t("serp", "shareOfSerpDescription")}
        />
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

      {/* ─── People Also Ask ──────────────────────────────── */}
      {Array.isArray(latestRun?.people_also_ask) &&
        latestRun.people_also_ask.length > 0 && (
          <PeopleAlsoAskPanel
            items={
              latestRun.people_also_ask as Array<{
                question: string | null;
                answer: string | null;
                title: string | null;
                url: string | null;
              }>
            }
            title={t("serp", "peopleAlsoAsk")}
            description={t("serp", "peopleAlsoAskDescription")}
          />
        )}

      {/* ─── Related queries ──────────────────────────────── */}
      {Array.isArray(latestRun?.related_queries) &&
        latestRun.related_queries.length > 0 && (
          <RelatedQueriesPanel
            items={
              latestRun.related_queries as Array<{
                title: string | null;
                url: string | null;
              }>
            }
            title={t("serp", "relatedQueries")}
            description={t("serp", "relatedQueriesDescription")}
          />
        )}
    </div>
  );
}

/**
 * Share of SERP page 1: top domini per share % dei risultati
 * organic. Highlight col gold per i domini matched a un brand
 * tracciato. Bar a larghezza proporzionale al share.
 */
function ShareOfSerpPanel({
  domains,
  totalOrganic,
  title,
  description,
}: {
  domains: Array<{
    domain: string;
    count: number;
    share: number;
    brand: BrandRef | null;
    bestPosition: number | null;
    delta: number | null;
  }>;
  totalOrganic: number;
  title: string;
  description: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <PieChart className="size-4 text-gold" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">
          ({totalOrganic} organic)
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug max-w-3xl">
        {description}
      </p>
      <Card>
        <CardContent className="p-4 space-y-2.5">
          {domains.map((d) => (
            <div key={d.domain} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={
                      d.brand
                        ? "font-semibold text-gold truncate"
                        : "text-foreground truncate"
                    }
                  >
                    {d.domain}
                  </span>
                  {d.brand && (
                    <Badge variant="gold" className="text-[9px] py-0 px-1.5">
                      {d.brand.page_name}
                    </Badge>
                  )}
                  {d.bestPosition != null && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      best #{d.bestPosition}
                    </span>
                  )}
                  {d.delta != null && d.delta !== 0 && (
                    <span
                      className={`flex items-center gap-0.5 text-[10px] tabular-nums ${
                        d.delta > 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {d.delta > 0 ? (
                        <TrendingUp className="size-3" />
                      ) : (
                        <TrendingDown className="size-3" />
                      )}
                      {Math.abs(d.delta)}
                    </span>
                  )}
                  {d.delta === 0 && (
                    <span className="flex items-center text-[10px] text-muted-foreground">
                      <Minus className="size-3" />
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {d.count}{" "}
                  <span className="text-foreground font-medium">
                    ({d.share.toFixed(0)}%)
                  </span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={
                    d.brand ? "h-full bg-gold" : "h-full bg-muted-foreground/40"
                  }
                  style={{ width: `${Math.max(d.share, 2)}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * People Also Ask: domande suggerite da Google con risposta ed
 * eventuale source. Content-strategy gold — ogni domanda e' un
 * intento di ricerca a cui il brand puo' rispondere via blog/FAQ.
 */
function PeopleAlsoAskPanel({
  items,
  title,
  description,
}: {
  items: Array<{
    question: string | null;
    answer: string | null;
    title: string | null;
    url: string | null;
  }>;
  title: string;
  description: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="size-4 text-gold" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug max-w-3xl">
        {description}
      </p>
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {items.map((q, idx) => (
            <details key={idx} className="group">
              <summary className="p-4 cursor-pointer flex items-start gap-3 hover:bg-muted/30 transition-colors">
                <HelpCircle className="size-4 text-gold/70 mt-0.5 shrink-0" />
                <span className="text-sm font-medium flex-1">
                  {q.question ?? "—"}
                </span>
              </summary>
              {(q.answer || q.title || q.url) && (
                <div className="px-4 pb-4 pl-11 space-y-1.5">
                  {q.answer && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {q.answer}
                    </p>
                  )}
                  {(q.title || q.url) && (
                    <a
                      href={q.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-gold hover:underline inline-flex items-center gap-1"
                    >
                      {q.title ?? q.url}
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              )}
            </details>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * Related queries: ricerche correlate suggerite da Google in fondo
 * alla SERP. Buona miniera per keyword expansion e ad-group.
 */
function RelatedQueriesPanel({
  items,
  title,
  description,
}: {
  items: Array<{ title: string | null; url: string | null }>;
  title: string;
  description: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Compass className="size-4 text-gold" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug max-w-3xl">
        {description}
      </p>
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-1.5">
            {items.map((q, idx) =>
              q.title ? (
                <a
                  key={idx}
                  href={q.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-gold/40 hover:text-gold transition-colors"
                >
                  {q.title}
                </a>
              ) : null,
            )}
          </div>
        </CardContent>
      </Card>
    </section>
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
