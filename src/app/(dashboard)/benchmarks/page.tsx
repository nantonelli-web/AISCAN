import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeBenchmarks } from "@/lib/analytics/benchmarks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import {
  VolumeChart,
  FormatPieChart,
  FormatStackedChart,
  HorizontalBarChart,
  PlatformChart,
} from "@/components/dashboard/benchmark-charts";
import { PrintButton } from "@/components/ui/print-button";
import { getLocale, serverT } from "@/lib/i18n/server";
import { MetaIcon } from "@/components/ui/meta-icon";
import Link from "next/link";

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

export default async function BenchmarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const channel = sp.channel === "google" ? "google" : "meta";
  const rawClient = typeof sp.client === "string" ? sp.client : null;
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  // Load clients + competitors so we can scope benchmarks to a project
  const [{ data: clientsData }, { data: competitorsData }] = await Promise.all([
    admin
      .from("mait_clients")
      .select("id, name, color")
      .eq("workspace_id", profile.workspace_id!)
      .order("name"),
    supabase
      .from("mait_competitors")
      .select("id, client_id")
      .eq("workspace_id", profile.workspace_id!),
  ]);
  const clients = (clientsData ?? []) as { id: string; name: string; color: string }[];
  const allCompetitors = (competitorsData ?? []) as { id: string; client_id: string | null }[];

  // Validate the active filter. "unassigned" is allowed as a pseudo-client
  // id for brands not tied to any project.
  const activeClient: "unassigned" | string | null =
    rawClient === "unassigned"
      ? "unassigned"
      : rawClient && clients.some((c) => c.id === rawClient)
        ? rawClient
        : null;

  const competitorIdsFilter: string[] | undefined = activeClient === null
    ? undefined
    : allCompetitors
        .filter((c) =>
          activeClient === "unassigned"
            ? c.client_id === null
            : c.client_id === activeClient
        )
        .map((c) => c.id);

  const data = await computeBenchmarks(
    supabase,
    profile.workspace_id!,
    channel,
    competitorIdsFilter
  );

  const channels = [
    { key: "meta" as const, label: "Meta Ads", icon: <MetaIcon className="size-3.5" /> },
    { key: "google" as const, label: "Google Ads", icon: <GoogleIcon className="size-3.5" /> },
  ];

  // Keep channel param when switching client, and vice versa
  function hrefFor(ch: string | null, cl: string | null): string {
    const params = new URLSearchParams();
    if (ch) params.set("channel", ch);
    if (cl) params.set("client", cl);
    const qs = params.toString();
    return qs ? `/benchmarks?${qs}` : "/benchmarks";
  }

  const hasUnassigned = allCompetitors.some((c) => c.client_id === null);

  const clientFilter = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mr-1">
        {t("benchmarks", "filterByProject")}
      </span>
      <Link
        href={hrefFor(channel, null)}
        className={
          activeClient === null
            ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors"
            : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        }
      >
        {t("benchmarks", "allProjects")}
      </Link>
      {clients.map((c) => (
        <Link
          key={c.id}
          href={hrefFor(channel, c.id)}
          className={
            activeClient === c.id
              ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors"
              : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          }
        >
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: c.color }}
          />
          {c.name}
        </Link>
      ))}
      {hasUnassigned && (
        <Link
          href={hrefFor(channel, "unassigned")}
          className={
            activeClient === "unassigned"
              ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors"
              : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          }
        >
          {t("clients", "unassigned")}
        </Link>
      )}
    </div>
  );

  if (data.totals.totalAds === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">{t("benchmarks", "title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("benchmarks", "subtitle")}
          </p>
        </div>

        {/* Channel selector */}
        <div className="flex items-center gap-2">
          {channels.map((ch) => (
            <Link
              key={ch.key}
              href={hrefFor(ch.key, activeClient)}
              className={
                channel === ch.key
                  ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors"
                  : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              }
            >
              {ch.icon}
              {ch.label}
            </Link>
          ))}
        </div>

        {clientFilter}

        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("benchmarks", "noData")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">{t("benchmarks", "title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("benchmarks", "comparativeAnalysis")} {formatNumber(data.totals.totalAds)} {t("benchmarks", "adsOf")}{" "}
            {data.volumeByCompetitor.length} {t("benchmarks", "competitorsWord")}
          </p>
        </div>
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>

      {/* Channel selector */}
      <div className="flex items-center gap-2 print:hidden">
        {channels.map((ch) => (
          <Link
            key={ch.key}
            href={hrefFor(ch.key, activeClient)}
            className={
              channel === ch.key
                ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors"
                : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            }
          >
            {ch.icon}
            {ch.label}
          </Link>
        ))}
      </div>

      <div className="print:hidden">{clientFilter}</div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("benchmarks", "totalAds")} value={formatNumber(data.totals.totalAds)} />
        <Stat label={t("benchmarks", "activeAds")} value={formatNumber(data.totals.activeAds)} />
        <Stat
          label={t("benchmarks", "avgCampaignDuration")}
          value={`${data.totals.avgDuration}gg`}
        />
        <Stat
          label={t("benchmarks", "avgCopyLength")}
          value={`${data.totals.avgCopyLength} chr`}
        />
        <Stat
          label={t("benchmarks", "aiGeneratedPercent")}
          value={`${data.totals.aiGeneratedPercent}%`}
        />
        <Stat
          label={t("benchmarks", "advantagePlusPercent")}
          value={`${data.totals.advantagePlusPercent}%`}
        />
      </div>

      {/* Volume per competitor */}
      <Card>
        <CardHeader>
          <CardTitle>{t("benchmarks", "volumePerCompetitor")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descVolume")}</p>
          <VolumeChart data={data.volumeByCompetitor} />
        </CardContent>
      </Card>

      {/* Format mix per brand */}
      <Card>
        <CardHeader>
          <CardTitle>{t("benchmarks", "globalFormatMix")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descFormatPie")}</p>
          <div className={`grid gap-6 ${data.formatMixByCompetitor.length <= 2 ? "grid-cols-2" : data.formatMixByCompetitor.length <= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"}`}>
            {data.formatMixByCompetitor.map((entry) => (
              <div key={entry.competitor} className="text-center">
                <p className="text-xs font-medium text-gold mb-2">{entry.competitor}</p>
                <FormatPieChart data={entry.data} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Format per competitor */}
      <Card>
        <CardHeader>
          <CardTitle>{t("benchmarks", "formatPerCompetitor")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descFormatStacked")}</p>
          <FormatStackedChart data={data.formatByCompetitor} />
        </CardContent>
      </Card>

      {/* CTA — now broken down per brand, same layout as format mix */}
      <Card>
        <CardHeader>
          <CardTitle>{t("benchmarks", "topCtaPerBrand")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descTopCtaPerBrand")}</p>
          {data.ctaMixByCompetitor.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">{t("benchmarks", "noData")}</p>
          ) : (
            <div className={`grid gap-6 ${data.ctaMixByCompetitor.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
              {data.ctaMixByCompetitor.map((entry) => (
                <div key={entry.competitor} className="space-y-2">
                  <p className="text-xs font-medium text-gold text-center">{entry.competitor}</p>
                  <HorizontalBarChart
                    data={entry.data}
                    dataKey="count"
                    label={t("benchmarks", "adsLabel")}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform distribution per brand */}
      <Card>
        <CardHeader>
          <CardTitle>{t("benchmarks", "platformDistribution")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descPlatform")}</p>
          <div className={`grid gap-6 ${data.platformByCompetitor.length <= 2 ? "grid-cols-2" : data.platformByCompetitor.length <= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"}`}>
            {data.platformByCompetitor.map((entry) => (
              <div key={entry.competitor} className="text-center">
                <p className="text-xs font-medium text-gold mb-2">{entry.competitor}</p>
                <PlatformChart data={entry.data} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Duration + Copy length + Refresh rate */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "avgCampaignDurationChart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descDuration")}</p>
            <HorizontalBarChart
              data={data.avgDurationByCompetitor}
              dataKey="days"
              label={t("benchmarks", "daysAxisLabel")}
              color="#5b7ea3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "avgCopyLengthChart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descCopyLength")}</p>
            <HorizontalBarChart
              data={data.avgCopyLengthByCompetitor}
              dataKey="chars"
              label={t("benchmarks", "charsAxisLabel")}
              color="#6b8e6b"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "refreshRateChart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descRefreshRate")}</p>
            <HorizontalBarChart
              data={data.refreshRate}
              dataKey="adsPerWeek"
              label={t("benchmarks", "adsPerWeekAxisLabel")}
              color="#a06b5b"
            />
          </CardContent>
        </Card>
      </div>

      {/* AI-generated + Advantage+ + Variants */}
      <div className="grid gap-6 lg:grid-cols-3">
        {data.aiGeneratedByCompetitor.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("benchmarks", "aiGeneratedChart")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descAiGenerated")}</p>
              <HorizontalBarChart
                data={data.aiGeneratedByCompetitor}
                dataKey="percent"
                label="%"
                color="#8a6bb0"
              />
            </CardContent>
          </Card>
        )}

        {data.advantagePlusByCompetitor.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("benchmarks", "advantagePlusChart")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descAdvantagePlus")}</p>
              <HorizontalBarChart
                data={data.advantagePlusByCompetitor}
                dataKey="percent"
                label="%"
                color="#5ba09b"
              />
            </CardContent>
          </Card>
        )}

        {data.avgVariantsByCompetitor.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("benchmarks", "avgVariantsChart")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descAvgVariants")}</p>
              <HorizontalBarChart
                data={data.avgVariantsByCompetitor}
                dataKey="variants"
                label={t("benchmarks", "variantsLabel")}
                color="#a06b5b"
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Targeted countries */}
      {data.topTargetedCountries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "topTargetedCountries")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descTopCountries")}</p>
            <HorizontalBarChart
              data={data.topTargetedCountries}
              dataKey="count"
              label={t("benchmarks", "adsLabel")}
              color="#6b8e6b"
            />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center pt-2 print:hidden">
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
          {label}
        </div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
