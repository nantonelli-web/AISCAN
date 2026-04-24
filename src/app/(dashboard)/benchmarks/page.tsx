import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PrintButton } from "@/components/ui/print-button";
import { getLocale, serverT } from "@/lib/i18n/server";
import { MetaIcon } from "@/components/ui/meta-icon";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import Link from "next/link";
import { BenchmarkContent } from "./benchmark-content";
import { BrandFilter } from "./brand-filter";
import { CountryFilter } from "./country-filter";
import { DateRangeFilter } from "./date-range-filter";
import { parseCountryCodes } from "@/lib/meta/country-codes";

export const dynamic = "force-dynamic";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
    </svg>
  );
}

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

type Channel = "meta" | "google" | "instagram";

function parseChannel(raw: string | string[] | undefined): Channel {
  if (raw === "google") return "google";
  if (raw === "instagram") return "instagram";
  return "meta";
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
    { key: "meta" as const, label: "Meta Ads", icon: <MetaIcon className="size-3.5" /> },
    { key: "google" as const, label: "Google Ads", icon: <GoogleIcon className="size-3.5" /> },
  ];
  const organicChannels = [
    { key: "instagram" as const, label: "Instagram", icon: <InstagramIcon className="size-3.5" /> },
  ];

  function hrefForProject(ch: string, cl: string | null): string {
    const params = new URLSearchParams();
    params.set("channel", ch);
    if (cl) params.set("client", cl);
    // Brand subset + date range reset on channel/project switch because the
    // available brands differ across projects and the user typically wants
    // to re-scope when they pivot.
    const qs = params.toString();
    return qs ? `/benchmarks?${qs}` : "/benchmarks";
  }

  const hasUnassigned = allCompetitors.some((c) => c.client_id === null);

  const suspenseKey = `${channel}|${activeClient ?? "all"}|${activeCountryCodes.join(",")}|${activeBrandIds.join(",")}|${dateFrom}|${dateTo}`;

  const chipClass = (selected: boolean) =>
    selected
      ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors"
      : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">{t("benchmarks", "title")}</h1>
          <p className="text-sm text-muted-foreground">{t("benchmarks", "subtitle")}</p>
        </div>
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>

      {/* ─── Channels grouped by Paid / Organic ─── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-foreground font-bold">
            {t("benchmarks", "paidChannels")}
          </span>
          <div className="flex items-center gap-2">
            {paidChannels.map((ch) => (
              <Link key={ch.key} href={hrefForProject(ch.key, activeClient)} className={chipClass(channel === ch.key)}>
                {ch.icon}
                {ch.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-foreground font-bold">
            {t("benchmarks", "organicChannels")}
          </span>
          <div className="flex items-center gap-2">
            {organicChannels.map((ch) => (
              <Link key={ch.key} href={hrefForProject(ch.key, activeClient)} className={chipClass(channel === ch.key)}>
                {ch.icon}
                {ch.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Project row ─── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 print:hidden">
        <span className="text-[10px] uppercase tracking-wider text-foreground font-bold mr-1">
          {t("benchmarks", "filterByProject")}
        </span>
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

      {/* ─── Country + Brand — country drives the brand list ─── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-foreground font-bold">
            {t("benchmarks", "filterByCountry")}
          </span>
          {availableCountries.length > 0 ? (
            <CountryFilter
              availableCountries={availableCountries}
              activeCountryCodes={activeCountryCodes}
              channel={channel}
              client={activeClient}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          ) : (
            <span className="text-xs text-muted-foreground italic">—</span>
          )}
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-foreground font-bold">
            {t("benchmarks", "filterByBrand")}
          </span>
          <BrandFilter
            availableBrands={brandsInCountries.map((b) => ({ id: b.id, name: b.page_name }))}
            activeBrandIds={activeBrandIds}
            channel={channel}
            client={activeClient}
            countries={activeCountryCodes}
            totalCountries={availableCountries.length}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </div>
      </div>

      {/* ─── Date range last before the data ─── */}
      <DateRangeFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        channel={channel}
        client={activeClient}
        activeBrandIds={activeBrandIds}
        totalBrands={brandsInCountries.length}
        countries={activeCountryCodes}
        totalCountries={availableCountries.length}
      />

      <Suspense key={suspenseKey} fallback={<ContentSkeleton />}>
        <BenchmarkContent
          workspaceId={profile.workspace_id!}
          channel={channel}
          competitorIdsFilter={activeBrandIds}
          dateFrom={dateFrom}
          dateTo={dateTo}
          // Per-ad country filter only makes sense for Meta — Google
          // and Instagram do not carry a per-ad country signal, so
          // applying the filter would exclude all their ads. Also skip
          // the filter when every available country is selected (the
          // "no narrowing" case).
          countries={
            channel !== "meta" || ALL_COUNTRIES_SELECTED
              ? undefined
              : activeCountryCodes
          }
        />
      </Suspense>

      <div className="flex justify-center pt-2 print:hidden">
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>
    </div>
  );
}
