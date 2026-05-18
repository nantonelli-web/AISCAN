import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrintButton } from "@/components/ui/print-button";
import { ExportPptxButton } from "@/components/ui/export-pptx-button";
import { getLocale, serverT } from "@/lib/i18n/server";
import { MetaIcon } from "@/components/ui/meta-icon";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { TikTokIcon } from "@/components/ui/tiktok-icon";
import { SnapchatIcon } from "@/components/ui/snapchat-icon";
import { YouTubeIcon } from "@/components/ui/youtube-icon";
import { Search as SearchIcon, MapPin } from "lucide-react";
import { GoogleIcon } from "@/components/ui/google-icon";
import Link from "next/link";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { BenchmarkContent } from "./benchmark-content";
import { BrandFilter } from "./brand-filter";
import { CountryFilter } from "./country-filter";
import { DateRangeFilter } from "./date-range-filter";
import { parseCountryCodes } from "@/lib/meta/country-codes";

export const dynamic = "force-dynamic";

// GoogleIcon centralizzato in @/components/ui/google-icon. Inline
// SVG locale rimosso 2026-05-18 dopo che la stessa SVG era copiata in
// 4 file diversi (drift garantito).

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`bg-muted/60 rounded animate-pulse ${className}`} />;
}

function ContentSkeleton() {
  return (
    <div className="space-y-8">
      <SkeletonBar className="h-4 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-2">
              <SkeletonBar className="h-3 w-16" />
              <SkeletonBar className="h-7 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <SkeletonBar className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <SkeletonBar className="h-[300px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

/**
 * Benchmarks supports Meta / Google / Instagram with full charts. The
 * newer channels (TikTok / Snapchat / YouTube / SERP) appear in the
 * channel selector for visual parity with Library and brand-detail,
 * but BenchmarkContent short-circuits to a "coming soon" card for
 * them — the per-channel aggregator is the next backend milestone,
 * and showing them here without the data would either crash the
 * compute pipeline (different table shape) or render a blank chart.
 */
type Channel =
  | "meta"
  | "google"
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "youtube"
  | "serp"
  | "maps";
type StatusFilter = "active" | "inactive" | null;

function parseChannel(raw: string | string[] | undefined): Channel {
  if (raw === "google") return "google";
  if (raw === "instagram") return "instagram";
  if (raw === "tiktok") return "tiktok";
  if (raw === "snapchat") return "snapchat";
  if (raw === "youtube") return "youtube";
  if (raw === "serp") return "serp";
  if (raw === "maps") return "maps";
  return "meta";
}

/** Channels for which BenchmarkContent has a real compute path. The
 *  selector shows the rest as well so the user has visual parity
 *  with the Library and brand-detail surfaces. Typed as a predicate
 *  so the BenchmarkContent call site narrows `channel` to the
 *  legacy "meta" | "google" | "instagram" union expected by the
 *  compute pipeline. */
function isBenchmarkImplemented(
  ch: Channel,
): ch is "meta" | "google" | "instagram" | "tiktok" {
  return (
    ch === "meta" || ch === "google" || ch === "instagram" || ch === "tiktok"
  );
}

function parseStatus(raw: string | string[] | undefined): StatusFilter {
  if (raw === "active") return "active";
  if (raw === "inactive") return "inactive";
  return null;
}

export default async function BenchmarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const channel = parseChannel(sp.channel);
  const rawClient = typeof sp.client === "string" ? sp.client : null;
  const rawBrands = typeof sp.brands === "string" ? sp.brands : null;
  const rawCountries = typeof sp.countries === "string" ? sp.countries : null;
  const rawFrom = typeof sp.from === "string" ? sp.from : null;
  const rawTo = typeof sp.to === "string" ? sp.to : null;
  // Status filter is meaningful only on paid channels — Instagram organic
  // posts have no ACTIVE / INACTIVE concept. We still parse it for both so
  // the URL stays clean if the user toggles back to a paid channel.
  const status = parseStatus(sp.status);

  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [{ data: clientsData }, { data: competitorsData }] = await Promise.all([
    admin
      .from("mait_clients")
      .select("id, name, color")
      .eq("workspace_id", profile.workspace_id!)
      .order("name"),
    supabase
      .from("mait_competitors")
      .select("id, page_name, client_id, country")
      .eq("workspace_id", profile.workspace_id!)
      .order("page_name"),
  ]);
  const clients = (clientsData ?? []) as { id: string; name: string; color: string }[];
  const allCompetitors = (competitorsData ?? []) as { id: string; page_name: string; client_id: string | null; country: string | null }[];

  const activeClient: "unassigned" | string | null =
    rawClient === "unassigned"
      ? "unassigned"
      : rawClient && clients.some((c) => c.id === rawClient)
        ? rawClient
        : null;

  // Brands within the active project. Country cascades on top of this.
  const projectBrands = allCompetitors.filter((c) => {
    if (activeClient === null) return true;
    if (activeClient === "unassigned") return c.client_id === null;
    return c.client_id === activeClient;
  });

  // Countries actually present on the projectBrands — localized for display.
  // `mait_competitors.country` can be a single ISO code OR a CSV list
  // ("IT, DE, UK, FR, ES") for brands that were scanned across multiple
  // countries. parseCountryCodes normalises both shapes to an array of
  // alpha-2 codes; anything it can't resolve is dropped.
  const countryNames = new Intl.DisplayNames([locale], { type: "region" });
  function safeCountryName(code: string): string {
    try {
      return countryNames.of(code) ?? code;
    } catch {
      return code;
    }
  }
  const countryCodeSet = new Set<string>();
  const brandCountries = new Map<string, string[]>();
  for (const b of projectBrands) {
    const codes = parseCountryCodes(b.country);
    brandCountries.set(b.id, codes);
    for (const c of codes) countryCodeSet.add(c);
  }
  const availableCountries = [...countryCodeSet]
    .map((code) => ({ code, name: safeCountryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const urlCountries = rawCountries
    ? rawCountries.split(",").map((c) => c.toUpperCase()).filter((c) => countryCodeSet.has(c))
    : null;
  const activeCountryCodes =
    urlCountries && urlCountries.length > 0 ? urlCountries : availableCountries.map((c) => c.code);

  // Brand matches the active country filter when AT LEAST ONE of its
  // countries is in the selection (multi-country brands appear under each
  // of their scan countries). Brands with no resolvable country appear
  // only when the user has "all countries" selected.
  const ALL_COUNTRIES_SELECTED =
    activeCountryCodes.length === availableCountries.length;
  const activeCountrySet = new Set(activeCountryCodes);
  const brandsInCountries = projectBrands.filter((b) => {
    const codes = brandCountries.get(b.id) ?? [];
    if (codes.length === 0) return ALL_COUNTRIES_SELECTED;
    return codes.some((c) => activeCountrySet.has(c));
  });
  const brandsInCountriesIds = new Set(brandsInCountries.map((b) => b.id));
  const urlBrandIds = rawBrands
    ? rawBrands.split(",").filter((id) => brandsInCountriesIds.has(id))
    : null;
  const activeBrandIds =
    urlBrandIds && urlBrandIds.length > 0 ? urlBrandIds : brandsInCountries.map((b) => b.id);

  const today = new Date();
  const thirtyAgo = new Date(today);
  thirtyAgo.setDate(today.getDate() - 30);
  const defaultFrom = isoDate(thirtyAgo);
  const defaultTo = isoDate(today);
  const dateFrom = rawFrom && isValidIsoDate(rawFrom) ? rawFrom : defaultFrom;
  const dateTo = rawTo && isValidIsoDate(rawTo) ? rawTo : defaultTo;

  const paidChannels = [
    { key: "meta" as const, label: "Meta Ads", icon: <MetaIcon className="size-4" colored /> },
    { key: "google" as const, label: "Google Ads", icon: <GoogleIcon className="size-4" colored /> },
  ];
  // Organic + monitoring group all the brand-level surfaces beyond
  // paid ads. The compute backend currently only handles Instagram;
  // the rest render the coming-soon placeholder. Listing them here
  // mirrors the channel coverage of the Library and brand-detail
  // surfaces so the user does not feel that the new channels
  // disappear once they reach Benchmarks.
  const organicChannels = [
    { key: "instagram" as const, label: "Instagram", icon: <InstagramIcon className="size-4" colored /> },
    { key: "tiktok" as const, label: "TikTok", icon: <TikTokIcon className="size-4" colored /> },
    { key: "snapchat" as const, label: "Snapchat", icon: <SnapchatIcon className="size-4" colored /> },
    { key: "youtube" as const, label: "YouTube", icon: <YouTubeIcon className="size-4" colored /> },
  ];
  const monitoringChannels = [
    { key: "serp" as const, label: "Google SERP", icon: <SearchIcon className="size-3.5" /> },
    { key: "maps" as const, label: "Google Maps", icon: <MapPin className="size-3.5" /> },
  ];

  function hrefForProject(ch: string, cl: string | null): string {
    const params = new URLSearchParams();
    params.set("channel", ch);
    if (cl) params.set("client", cl);
    // Status is the only orthogonal narrow that survives a channel/project
    // pivot — brand subset + date range get reset because the available
    // brands differ across projects. Status applies to any paid channel,
    // so preserving it keeps the user's intent when they bounce around.
    if (status && ch !== "instagram") params.set("status", status);
    const qs = params.toString();
    return qs ? `/benchmarks?${qs}` : "/benchmarks";
  }

  // Build a Status pill href that preserves channel/project/country/brand/
  // dates and only swaps the `status` value. Removing the param entirely
  // (the "All" pill) is what restores the unfiltered view.
  function hrefForStatus(s: StatusFilter): string {
    const params = new URLSearchParams();
    params.set("channel", channel);
    if (activeClient) params.set("client", activeClient);
    if (rawCountries) params.set("countries", rawCountries);
    if (rawBrands) params.set("brands", rawBrands);
    if (rawFrom) params.set("from", rawFrom);
    if (rawTo) params.set("to", rawTo);
    if (s) params.set("status", s);
    return `/benchmarks?${params.toString()}`;
  }

  const hasUnassigned = allCompetitors.some((c) => c.client_id === null);

  const suspenseKey = `${channel}|${activeClient ?? "all"}|${activeCountryCodes.join(",")}|${activeBrandIds.join(",")}|${dateFrom}|${dateTo}|${status ?? "all"}`;

  // PPTX export endpoint (with current filters). Disabilitato per i
  // channel non supportati dall'export (snapchat / youtube / serp).
  const pptxExportSupported =
    channel === "meta" ||
    channel === "google" ||
    channel === "instagram" ||
    channel === "tiktok";
  const pptxParams = new URLSearchParams();
  pptxParams.set("channel", channel);
  if (activeBrandIds.length > 0)
    pptxParams.set("brands", activeBrandIds.join(","));
  if (!ALL_COUNTRIES_SELECTED)
    pptxParams.set("countries", activeCountryCodes.join(","));
  pptxParams.set("from", dateFrom);
  pptxParams.set("to", dateTo);
  if (status) pptxParams.set("status", status);
  const pptxEndpoint = `/api/benchmarks/export/pptx?${pptxParams.toString()}`;

  // Big pill — solid gold for active so it stands out. Used for
  // every primary filter row (channel, project, status). Replaces
  // the previous low-contrast bg-gold/15 text-gold style which the
  // user kept flagging as "non si vede".
  const chipClass = (selected: boolean) =>
    selected
      ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold text-gold-foreground border border-gold font-medium transition-colors"
      : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:text-foreground hover:bg-muted transition-colors";
  const sectionLabel =
    "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0";

  return (
    <div className="space-y-6">
      <DynamicBackLink fallbackHref="/dashboard" label={t("common", "backToDashboard")} />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t("benchmarks", "title").toUpperCase()}
          </p>
          <h1 className="text-3xl font-serif tracking-tight">{t("benchmarks", "title")}</h1>
          <p className="text-sm text-muted-foreground max-w-2xl text-pretty">{t("benchmarks", "subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {pptxExportSupported && (
            <ExportPptxButton endpoint={pptxEndpoint} />
          )}
          <PrintButton label={t("common", "print")} variant="outline" />
        </div>
      </div>

      {/* ─── Channel pivot — primary filter ─────────────────
          Wrapped in a Card with a real title so it reads as the
          dominant pivot. Paid / Organic / Monitoring stay split
          but inside one card with vertical dividers between
          groups. Big solid-gold active pills, generous gap-2. */}
      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t("benchmarks", "channelHeading")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={sectionLabel}>{t("benchmarks", "paidChannels")}</span>
              {paidChannels.map((ch) => (
                <Link key={ch.key} href={hrefForProject(ch.key, activeClient)} className={chipClass(channel === ch.key)}>
                  {ch.icon}
                  {ch.label}
                </Link>
              ))}
            </div>
            <div className="hidden lg:block h-6 w-px bg-border" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className={sectionLabel}>{t("benchmarks", "organicChannels")}</span>
              {organicChannels.map((ch) => (
                <Link key={ch.key} href={hrefForProject(ch.key, activeClient)} className={chipClass(channel === ch.key)}>
                  {ch.icon}
                  {ch.label}
                </Link>
              ))}
            </div>
            <div className="hidden lg:block h-6 w-px bg-border" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className={sectionLabel}>{t("benchmarks", "monitoringChannels")}</span>
              {monitoringChannels.map((ch) => (
                <Link key={ch.key} href={hrefForProject(ch.key, activeClient)} className={chipClass(channel === ch.key)}>
                  {ch.icon}
                  {ch.label}
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Status — paid channels only ────────────────────
          Status is a one-row refinement that only makes sense on
          paid surfaces; embedded as its own Card so the user
          reads "stato della creativita'" as distinct from
          channel and project narrowing. */}
      {(channel === "meta" || channel === "google") && (
        <Card className="print:hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t("benchmarks", "filterByStatus")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={hrefForStatus(null)} className={chipClass(status === null)}>
                {t("benchmarks", "statusAll")}
              </Link>
              <Link href={hrefForStatus("active")} className={chipClass(status === "active")}>
                <span className="size-1.5 rounded-full tone-success bg-current shrink-0" />
                {t("benchmarks", "statusActive")}
              </Link>
              <Link href={hrefForStatus("inactive")} className={chipClass(status === "inactive")}>
                <span className="size-1.5 rounded-full tone-neutral bg-current shrink-0" />
                {t("benchmarks", "statusInactive")}
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Project + Country + Brand + Date — refinements ──
          All grouped under one "Filtri" card with sub-rows.
          Each sub-row gets its own eyebrow label. The visual
          weight differential is: card title (text-sm semibold) >
          sub-row eyebrow (text-[10px] uppercase) > pill content. */}
      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t("benchmarks", "filtersHeading")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {/* Project row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className={sectionLabel}>{t("benchmarks", "filterByProject")}</span>
            <Link href={hrefForProject(channel, null)} className={chipClass(activeClient === null)}>
              {t("benchmarks", "allProjects")}
            </Link>
            {clients.map((c) => (
              <Link key={c.id} href={hrefForProject(channel, c.id)} className={chipClass(activeClient === c.id)}>
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                {c.name}
              </Link>
            ))}
            {hasUnassigned && (
              <Link href={hrefForProject(channel, "unassigned")} className={chipClass(activeClient === "unassigned")}>
                {t("clients", "unassigned")}
              </Link>
            )}
          </div>

          <div className="h-px bg-border" />

          {/* Country + Brand row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <span className={sectionLabel}>{t("benchmarks", "filterByCountry")}</span>
              {availableCountries.length > 0 ? (
                <CountryFilter
                  availableCountries={availableCountries}
                  activeCountryCodes={activeCountryCodes}
                  channel={channel}
                  client={activeClient}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  status={status}
                />
              ) : (
                <span className="text-xs text-muted-foreground italic">—</span>
              )}
            </div>
            <div className="hidden md:block h-6 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className={sectionLabel}>{t("benchmarks", "filterByBrand")}</span>
              <BrandFilter
                availableBrands={brandsInCountries.map((b) => ({ id: b.id, name: b.page_name }))}
                activeBrandIds={activeBrandIds}
                channel={channel}
                client={activeClient}
                countries={activeCountryCodes}
                totalCountries={availableCountries.length}
                dateFrom={dateFrom}
                dateTo={dateTo}
                status={status}
              />
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Date range row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className={sectionLabel}>{t("benchmarks", "filterByDate")}</span>
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              channel={channel}
              client={activeClient}
              activeBrandIds={activeBrandIds}
              totalBrands={brandsInCountries.length}
              countries={activeCountryCodes}
              totalCountries={availableCountries.length}
              status={status}
            />
          </div>
        </CardContent>
      </Card>

      <Suspense key={suspenseKey} fallback={<ContentSkeleton />}>
        {isBenchmarkImplemented(channel) ? (
          <BenchmarkContent
            workspaceId={profile.workspace_id!}
            channel={channel}
            competitorIdsFilter={activeBrandIds}
            dateFrom={dateFrom}
            dateTo={dateTo}
            // Per-ad country filter ora supportato sia su Meta che su
            // Google (l'attore silva95gustavo popola scan_countries da
            // regionStats[].regionCode). Skip Instagram organic — non
            // ha scope per-country. Skip se l'utente ha tutto
            // selezionato ("no narrowing").
            countries={
              channel === "instagram" || ALL_COUNTRIES_SELECTED
                ? undefined
                : activeCountryCodes
            }
            statusFilter={
              channel === "instagram" ? undefined : (status ?? undefined)
            }
          />
        ) : (
          <Card>
            <CardContent className="py-16 text-center space-y-3">
              <div className="size-12 rounded-full bg-gold/10 grid place-items-center mx-auto">
                <span className="text-gold text-xl">★</span>
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <p className="text-sm font-medium">
                  {t("benchmarks", "channelComingSoonTitle")}
                </p>
                <p className="text-xs text-muted-foreground text-pretty">
                  {t("benchmarks", "channelComingSoonHelp")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </Suspense>

      <div className="flex justify-center pt-2 print:hidden">
        <div className="flex items-center gap-2">
          {pptxExportSupported && (
            <ExportPptxButton endpoint={pptxEndpoint} />
          )}
          <PrintButton label={t("common", "print")} variant="outline" />
        </div>
      </div>
    </div>
  );
}
