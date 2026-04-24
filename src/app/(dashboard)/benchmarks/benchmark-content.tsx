import { createClient } from "@/lib/supabase/server";
import {
  computeBenchmarks,
  computeOrganicBenchmarks,
  type InferredAudience,
  type InferredObjective,
} from "@/lib/analytics/benchmarks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import {
  VolumeChart,
  FormatPieChart,
  HorizontalBarChart,
  PlatformChart,
} from "@/components/dashboard/benchmark-charts";
import { getLocale, serverT } from "@/lib/i18n/server";

export async function BenchmarkContent({
  workspaceId,
  channel,
  competitorIdsFilter,
  dateFrom,
  dateTo,
  countries,
}: {
  workspaceId: string;
  channel: "meta" | "google" | "instagram";
  competitorIdsFilter: string[] | undefined;
  dateFrom: string;
  dateTo: string;
  /** ISO alpha-2 codes. When NOT covering every workspace country the
   *  filter is applied at ad level against scan_countries (the ISO codes
   *  we passed Apify at scrape time), so multi-country brands are
   *  comparable to single-country ones. Ads without scan_countries
   *  (legacy rows) are excluded until their brand is re-scanned. */
  countries?: string[];
}) {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  if (channel === "instagram") {
    return (
      <OrganicContent
        supabase={supabase}
        workspaceId={workspaceId}
        competitorIdsFilter={competitorIdsFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        t={t}
      />
    );
  }

  const data = await computeBenchmarks(
    supabase,
    workspaceId,
    channel,
    competitorIdsFilter,
    dateFrom,
    dateTo,
    countries
  );

  // Scan-coverage check — split selected brands into two buckets:
  //   * noScan     = brand was never scanned for this channel
  //   * gap        = scanned but oldest ad starts well after dateFrom
  // 3-day tolerance on the gap check covers ads that may have started
  // slightly after dateFrom for legitimate reasons (new brand activity,
  // not a scan gap).
  const TOLERANCE_DAYS = 3;
  const fromTs = new Date(dateFrom).getTime();
  const noScanBrands = data.coverageByCompetitor
    .filter((c) => c.earliestStart === null)
    .map((c) => c.competitor);
  const coverageGaps = data.coverageByCompetitor
    .filter((c) => c.earliestStart !== null)
    .map((c) => {
      const earliestTs = new Date(c.earliestStart!).getTime();
      const gapDays = Math.round((earliestTs - fromTs) / 86_400_000);
      return { ...c, gapDays };
    })
    .filter((c) => c.gapDays > TOLERANCE_DAYS);

  // Empty state handles the "no scans at all in this selection" case, but we
  // still show the no-scan list so the user knows *which* brands need a scan.
  if (data.totals.totalAds === 0) {
    return (
      <div className="space-y-6">
        {noScanBrands.length > 0 && (
          <NoScanWarning
            brands={noScanBrands}
            channelLabel={channel === "meta" ? "Meta Ads" : "Google Ads"}
            t={t}
          />
        )}
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
      <p className="text-sm text-muted-foreground">
        {t("benchmarks", "comparativeAnalysis")} {formatNumber(data.totals.totalAds)} {t("benchmarks", "adsOf")}{" "}
        {data.volumeByCompetitor.length} {t("benchmarks", "competitorsWord")}
      </p>

      {noScanBrands.length > 0 && (
        <NoScanWarning
          brands={noScanBrands}
          channelLabel={channel === "meta" ? "Meta Ads" : "Google Ads"}
          t={t}
        />
      )}

      {/* Scan coverage warning: surfaces when a scanned brand has ads
          that do not reach back to dateFrom. */}
      {coverageGaps.length > 0 && (
        <div className="rounded-lg border border-gold/40 bg-gold/5 px-4 py-3">
          <p className="text-xs font-semibold text-gold mb-1.5">
            {t("benchmarks", "coverageWarningTitle")}
          </p>
          <p className="text-[11px] text-muted-foreground mb-2">
            {t("benchmarks", "coverageWarningBody")}
          </p>
          <ul className="text-[11px] text-foreground space-y-0.5">
            {coverageGaps.map((c) => (
              <li key={c.competitor}>
                <span className="font-medium">{c.competitor}</span>
                <span className="text-muted-foreground">
                  {" — "}
                  {t("benchmarks", "coverageFrom")} {c.earliestStart ?? "—"}
                  {` (${c.gapDays} ${t("benchmarks", "coverageDaysShort")})`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Stat label={t("benchmarks", "totalAds")} value={formatNumber(data.totals.totalAds)} />
        <Stat label={t("benchmarks", "activeAds")} value={formatNumber(data.totals.activeAds)} />
        <Stat label={t("benchmarks", "avgCampaignDuration")} value={`${data.totals.avgDuration}gg`} />
        <Stat label={t("benchmarks", "avgCopyLength")} value={`${data.totals.avgCopyLength} chr`} />
        <Stat label={t("benchmarks", "advantagePlusPercent")} value={`${data.totals.advantagePlusPercent}%`} />
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

      {/* Audience insights (EU DSA) */}
      {data.audienceByCompetitor.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "audienceInsights")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {t("benchmarks", "audienceInsightsDesc")}
            </p>
            <div className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {t("benchmarks", "audienceInsightsDisclaimer")}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-foreground mb-2">
                  {t("benchmarks", "audienceReachChart")}
                </p>
                <HorizontalBarChart
                  data={data.audienceByCompetitor.map((c) => ({ name: c.competitor, reach: c.euReach }))}
                  dataKey="reach"
                  label={t("benchmarks", "reachAxisLabel")}
                  color="#2d8a87"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground mb-2">
                  {t("benchmarks", "audienceProfile")}
                </p>
                <div className="space-y-2">
                  {data.audienceByCompetitor.slice(0, 12).map((c) => (
                    <AudienceProfileRow
                      key={c.competitor}
                      competitor={c.competitor}
                      dominantAge={c.dominantAge}
                      genderLabel={c.genderLabel}
                      ageTotals={c.ageTotals}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* UTM analysis per brand — hidden pending further work on the
          audience/objective inference. Computation is still done in
          computeBenchmarks so nothing needs re-plumbing when we re-enable it. */}
      {false && (
        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "utmPerBrand")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descUtmPerBrand")}</p>
            <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] leading-relaxed text-orange-900">
              {t("benchmarks", "utmDisclaimer")}
            </div>
            {data.utmInsightsByCompetitor.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">{t("benchmarks", "utmNoData")}</p>
            ) : (
              <div className={`grid gap-4 ${data.utmInsightsByCompetitor.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
                {data.utmInsightsByCompetitor.map((entry) => (
                  <UtmInsightCard
                    key={entry.competitor}
                    competitor={entry.competitor}
                    audience={entry.audience}
                    objective={entry.objective}
                    audienceConfidence={entry.audienceConfidence}
                    objectiveConfidence={entry.objectiveConfidence}
                    sampleCampaign={entry.sampleCampaign}
                    audienceLabel={t("benchmarks", "utmAudience")}
                    objectiveLabel={t("benchmarks", "utmObjective")}
                    sampleLabel={t("benchmarks", "utmSampleCampaign")}
                    confLabel={t("benchmarks", "utmConfidence")}
                    audienceName={t("benchmarks", `audience_${entry.audience}`)}
                    objectiveName={t("benchmarks", `objective_${entry.objective}`)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* CTA per brand */}
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
                  <HorizontalBarChart data={entry.data} dataKey="count" label={t("benchmarks", "adsLabel")} />
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
            <HorizontalBarChart data={data.avgDurationByCompetitor} dataKey="days" label={t("benchmarks", "daysAxisLabel")} color="#5b7ea3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "avgCopyLengthChart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descCopyLength")}</p>
            <HorizontalBarChart data={data.avgCopyLengthByCompetitor} dataKey="chars" label={t("benchmarks", "charsAxisLabel")} color="#6b8e6b" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "refreshRateChart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("benchmarks", "descRefreshRate")}</p>
            <HorizontalBarChart data={data.refreshRate} dataKey="adsPerWeek" label={t("benchmarks", "adsPerWeekAxisLabel")} color="#d97757" />
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
              <HorizontalBarChart data={data.aiGeneratedByCompetitor} dataKey="percent" label="%" color="#8a6bb0" />
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
              <HorizontalBarChart data={data.advantagePlusByCompetitor} dataKey="percent" label="%" color="#5ba09b" />
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
              <HorizontalBarChart data={data.avgVariantsByCompetitor} dataKey="variants" label={t("benchmarks", "variantsLabel")} color="#d97757" />
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
            <HorizontalBarChart data={data.topTargetedCountries} dataKey="count" label={t("benchmarks", "adsLabel")} color="#6b8e6b" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Instagram / organic variant ─────────────────────────────
   Uses the existing computeOrganicBenchmarks so we can share the
   shape with the Compare page without duplicating logic here. */
async function OrganicContent({
  supabase,
  workspaceId,
  competitorIdsFilter,
  dateFrom,
  dateTo,
  t,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  workspaceId: string;
  competitorIdsFilter: string[] | undefined;
  dateFrom: string;
  dateTo: string;
  t: (section: string, key: string) => string;
}) {
  const data = await computeOrganicBenchmarks(
    supabase,
    workspaceId,
    competitorIdsFilter,
    dateFrom,
    dateTo
  );

  const TOLERANCE_DAYS = 3;
  const fromTs = new Date(dateFrom).getTime();
  const noScanBrands = data.coverageByCompetitor
    .filter((c) => c.earliestPost === null)
    .map((c) => c.competitor);
  const coverageGaps = data.coverageByCompetitor
    .filter((c) => c.earliestPost !== null)
    .map((c) => {
      const earliestTs = new Date(c.earliestPost!).getTime();
      const gapDays = Math.round((earliestTs - fromTs) / 86_400_000);
      return { ...c, gapDays };
    })
    .filter((c) => c.gapDays > TOLERANCE_DAYS);

  if (data.totals.totalPosts === 0) {
    return (
      <div className="space-y-6">
        {noScanBrands.length > 0 && (
          <NoScanWarning brands={noScanBrands} channelLabel="Instagram" t={t} />
        )}
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
      <p className="text-sm text-muted-foreground">
        {t("benchmarks", "comparativeAnalysis")} {formatNumber(data.totals.totalPosts)} {t("organic", "posts")}{" "}
        {t("benchmarks", "adsOf")} {data.postsByCompetitor.length} {t("benchmarks", "competitorsWord")}
      </p>

      {noScanBrands.length > 0 && (
        <NoScanWarning brands={noScanBrands} channelLabel="Instagram" t={t} />
      )}
      {coverageGaps.length > 0 && (
        <div className="rounded-lg border border-gold/40 bg-gold/5 px-4 py-3">
          <p className="text-xs font-semibold text-gold mb-1.5">
            {t("benchmarks", "coverageWarningTitle")}
          </p>
          <p className="text-[11px] text-muted-foreground mb-2">
            {t("benchmarks", "coverageWarningBody")}
          </p>
          <ul className="text-[11px] text-foreground space-y-0.5">
            {coverageGaps.map((c) => (
              <li key={c.competitor}>
                <span className="font-medium">{c.competitor}</span>
                <span className="text-muted-foreground">
                  {" — "}
                  {t("benchmarks", "coverageFrom")} {c.earliestPost ?? "—"}
                  {` (${c.gapDays} ${t("benchmarks", "coverageDaysShort")})`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Stat label={t("organic", "postsLabel")} value={formatNumber(data.totals.totalPosts)} />
        <Stat label={t("organic", "avgLikes")} value={formatNumber(data.totals.avgLikes)} />
        <Stat label={t("organic", "avgComments")} value={formatNumber(data.totals.avgComments)} />
        <Stat label={t("organic", "avgViews")} value={formatNumber(data.totals.avgViews)} />
        <Stat label={t("benchmarks", "avgCopyLength")} value={`${data.totals.avgCaptionLength} chr`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("organic", "postsPerBrand")}</CardTitle>
        </CardHeader>
        <CardContent>
          <HorizontalBarChart
            data={data.postsByCompetitor}
            dataKey="posts"
            label={t("organic", "postsLabel")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("benchmarks", "globalFormatMix")}</CardTitle>
        </CardHeader>
        <CardContent>
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

      {data.topHashtags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("organic", "topHashtags")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart data={data.topHashtags} dataKey="count" label={t("organic", "postsLabel")} color="#8a6bb0" />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("organic", "avgLikes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart data={data.avgLikesByCompetitor} dataKey="likes" label={t("organic", "avgLikes")} color="#d97757" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("organic", "avgComments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart data={data.avgCommentsByCompetitor} dataKey="comments" label={t("organic", "avgComments")} color="#5b7ea3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("organic", "postsPerWeek")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart data={data.postsPerWeekByCompetitor} dataKey="postsPerWeek" label={t("organic", "postsPerWeek")} color="#6b8e6b" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Warn the user that one or more of the selected brands has never been
 * scanned on the active channel — otherwise they would be invisibly
 * excluded from the charts below, making the comparison misleading.
 */
function NoScanWarning({
  brands,
  channelLabel,
  t,
}: {
  brands: string[];
  channelLabel: string;
  t: (section: string, key: string) => string;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-xs font-semibold text-red-700 mb-1.5">
        {t("benchmarks", "noScanWarningTitle").replace("{channel}", channelLabel)}
      </p>
      <p className="text-[11px] text-red-900/80 mb-2">
        {t("benchmarks", "noScanWarningBody").replace("{channel}", channelLabel)}
      </p>
      <ul className="text-[11px] text-red-950 space-y-0.5 list-disc list-inside">
        {brands.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

/** Compact per-brand audience profile: dominant age + gender + mini age bars. */
function AudienceProfileRow({
  competitor,
  dominantAge,
  genderLabel,
  ageTotals,
  t,
}: {
  competitor: string;
  dominantAge: string | null;
  genderLabel: "all" | "mostlyMale" | "mostlyFemale" | null;
  ageTotals: { ageRange: string; count: number }[];
  t: (section: string, key: string) => string;
}) {
  const total = ageTotals.reduce((s, a) => s + a.count, 0);
  const genderDisplay = genderLabel
    ? t("benchmarks", genderLabel === "all" ? "genderAll" : genderLabel === "mostlyMale" ? "genderMostlyMale" : "genderMostlyFemale")
    : "—";
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-foreground truncate">{competitor}</span>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
          {dominantAge && (
            <span>
              <span className="text-foreground font-semibold">{dominantAge}</span>
            </span>
          )}
          <span>{genderDisplay}</span>
        </div>
      </div>
      {total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-muted">
          {ageTotals.map((a, i) => {
            const pct = (a.count / total) * 100;
            const palette = ["#0e3590", "#2d8a87", "#d97757", "#8a6bb0", "#5b7ea3", "#6b8e6b", "#a38a4c"];
            return (
              <div
                key={a.ageRange}
                title={`${a.ageRange}: ${Math.round(pct)}%`}
                className="h-full"
                style={{ width: `${pct}%`, backgroundColor: palette[i % palette.length] }}
              />
            );
          })}
        </div>
      )}
      {ageTotals.length > 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[10px] text-muted-foreground">
          {ageTotals.map((a) => (
            <span key={a.ageRange} className="tabular-nums">
              {a.ageRange}: {Math.round((a.count / total) * 100)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function UtmInsightCard({
  competitor,
  audience,
  objective,
  audienceConfidence,
  objectiveConfidence,
  sampleCampaign,
  audienceLabel,
  objectiveLabel,
  sampleLabel,
  confLabel,
  audienceName,
  objectiveName,
}: {
  competitor: string;
  audience: InferredAudience;
  objective: InferredObjective;
  audienceConfidence: number;
  objectiveConfidence: number;
  sampleCampaign: string | null;
  audienceLabel: string;
  objectiveLabel: string;
  sampleLabel: string;
  confLabel: string;
  audienceName: string;
  objectiveName: string;
}) {
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-4 space-y-3">
      <p className="text-sm font-semibold text-orange-900">{competitor}</p>
      <InsightRow
        label={audienceLabel}
        value={audienceName}
        confidence={audienceConfidence}
        muted={audience === "unknown"}
        confLabel={confLabel}
      />
      <InsightRow
        label={objectiveLabel}
        value={objectiveName}
        confidence={objectiveConfidence}
        muted={objective === "unknown"}
        confLabel={confLabel}
      />
      {sampleCampaign && (
        <div className="pt-2 border-t border-orange-200/60">
          <p className="text-[10px] uppercase tracking-wider text-orange-800/70 mb-0.5">{sampleLabel}</p>
          <p className="text-[11px] font-mono text-orange-900 break-all">{sampleCampaign}</p>
        </div>
      )}
    </div>
  );
}

function InsightRow({
  label,
  value,
  confidence,
  muted,
  confLabel,
}: {
  label: string;
  value: string;
  confidence: number;
  muted: boolean;
  confLabel: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-orange-800/70 mb-0.5">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-medium ${muted ? "text-muted-foreground italic" : "text-orange-900"}`}>{value}</span>
        {!muted && (
          <span className="text-[10px] text-orange-800/80">{confidence}% {confLabel}</span>
        )}
      </div>
    </div>
  );
}
