import { createClient } from "@/lib/supabase/server";
import { computeBenchmarks, type InferredAudience, type InferredObjective } from "@/lib/analytics/benchmarks";
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
}: {
  workspaceId: string;
  channel: "meta" | "google";
  competitorIdsFilter: string[] | undefined;
}) {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const data = await computeBenchmarks(
    supabase,
    workspaceId,
    channel,
    competitorIdsFilter
  );

  if (data.totals.totalAds === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          {t("benchmarks", "noData")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {t("benchmarks", "comparativeAnalysis")} {formatNumber(data.totals.totalAds)} {t("benchmarks", "adsOf")}{" "}
        {data.volumeByCompetitor.length} {t("benchmarks", "competitorsWord")}
      </p>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("benchmarks", "totalAds")} value={formatNumber(data.totals.totalAds)} />
        <Stat label={t("benchmarks", "activeAds")} value={formatNumber(data.totals.activeAds)} />
        <Stat label={t("benchmarks", "avgCampaignDuration")} value={`${data.totals.avgDuration}gg`} />
        <Stat label={t("benchmarks", "avgCopyLength")} value={`${data.totals.avgCopyLength} chr`} />
        <Stat label={t("benchmarks", "aiGeneratedPercent")} value={`${data.totals.aiGeneratedPercent}%`} />
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
