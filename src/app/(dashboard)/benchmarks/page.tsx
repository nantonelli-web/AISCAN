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

export const dynamic = "force-dynamic";

export default async function BenchmarksPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const data = await computeBenchmarks(supabase, profile.workspace_id!);

  if (data.totals.totalAds === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">Benchmarks</h1>
          <p className="text-sm text-muted-foreground">
            Confronto competitivo basato sulle ads scrappate.
          </p>
        </div>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nessun dato disponibile. Aggiungi dei competitor e lancia almeno uno
            scan per popolare i benchmark.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">Benchmarks</h1>
        <p className="text-sm text-muted-foreground">
          Analisi comparativa su {formatNumber(data.totals.totalAds)} ads di{" "}
          {data.competitors.length} competitor.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ads totali" value={formatNumber(data.totals.totalAds)} />
        <Stat label="Ads attive" value={formatNumber(data.totals.activeAds)} />
        <Stat
          label="Durata media campagna"
          value={`${data.totals.avgDuration}gg`}
        />
        <Stat
          label="Lungh. media copy"
          value={`${data.totals.avgCopyLength} chr`}
        />
      </div>

      {/* Volume per competitor */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Volume ads per competitor</CardTitle>
          </CardHeader>
          <CardContent>
            <VolumeChart data={data.volumeByCompetitor} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Format mix (globale)</CardTitle>
          </CardHeader>
          <CardContent>
            <FormatPieChart data={data.formatMix} />
          </CardContent>
        </Card>
      </div>

      {/* Format per competitor */}
      <Card>
        <CardHeader>
          <CardTitle>Format mix per competitor</CardTitle>
        </CardHeader>
        <CardContent>
          <FormatStackedChart data={data.formatByCompetitor} />
        </CardContent>
      </Card>

      {/* CTA + Platform */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top CTA</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.topCtas}
              dataKey="count"
              label="Ads"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuzione piattaforma</CardTitle>
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
            <CardTitle>Durata media campagna</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.avgDurationByCompetitor}
              dataKey="days"
              label="Giorni"
              color="#5b7ea3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lunghezza media copy</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.avgCopyLengthByCompetitor}
              dataKey="chars"
              label="Caratteri"
              color="#6b8e6b"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Refresh rate (90gg)</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={data.refreshRate}
              dataKey="adsPerWeek"
              label="Ads/settimana"
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
