import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
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
import { getLocale, serverT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BenchmarksPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const data = await computeBenchmarks(supabase, profile.workspace_id!);
  const locale = await getLocale();
  const t = serverT(locale);

  if (data.totals.totalAds === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">{t("benchmarks", "title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("benchmarks", "subtitle")}
          </p>
        </div>
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
      <div>
        <h1 className="text-2xl font-serif tracking-tight">{t("benchmarks", "title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("benchmarks", "comparativeAnalysis")} {formatNumber(data.totals.totalAds)} {t("benchmarks", "adsOf")}{" "}
          {data.competitors.length} {t("benchmarks", "competitorsWord")}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>

      {/* Volume per competitor */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "volumePerCompetitor")}</CardTitle>
          </CardHeader>
          <CardContent>
            <VolumeChart data={data.volumeByCompetitor} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "globalFormatMix")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormatPieChart data={data.formatMix} />
          </CardContent>
        </Card>
      </div>

      {/* Format per competitor */}
      <Card>
        <CardHeader>
          <CardTitle>{t("benchmarks", "formatPerCompetitor")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FormatStackedChart data={data.formatByCompetitor} />
        </CardContent>
      </Card>

      {/* CTA + Platform */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "topCta")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.topCtas}
              dataKey="count"
              label={t("benchmarks", "adsLabel")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "platformDistribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PlatformChart data={data.platformDistribution} />
          </CardContent>
        </Card>
      </div>

      {/* Duration + Copy length + Refresh rate */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "avgCampaignDurationChart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.avgDurationByCompetitor}
              dataKey="days"
              label={t("benchmarks", "daysLabel")}
              color="#5b7ea3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "avgCopyLengthChart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.avgCopyLengthByCompetitor}
              dataKey="chars"
              label={t("benchmarks", "charsLabel")}
              color="#6b8e6b"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("benchmarks", "refreshRateChart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.refreshRate}
              dataKey="adsPerWeek"
              label={t("benchmarks", "adsPerWeekLabel")}
              color="#a06b5b"
            />
          </CardContent>
        </Card>
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
