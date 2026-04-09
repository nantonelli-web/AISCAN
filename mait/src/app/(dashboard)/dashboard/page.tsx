import Link from "next/link";
import { Eye, Users, Sparkles, ArrowRight } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdCard } from "@/components/ads/ad-card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import type { MaitAdExternal, MaitCompetitor } from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const wsId = profile.workspace_id!;

  const [
    { count: totalAds },
    { count: activeAds },
    { count: competitorsCount },
    { data: recentAds },
    { data: competitors },
    { data: topCompRows },
  ] = await Promise.all([
    supabase
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId),
    supabase
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId)
      .eq("status", "ACTIVE"),
    supabase
      .from("mait_competitors")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId),
    supabase
      .from("mait_ads_external")
      .select("*")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("mait_competitors")
      .select("id, page_name")
      .eq("workspace_id", wsId),
    supabase
      .from("mait_ads_external")
      .select("competitor_id")
      .eq("workspace_id", wsId)
      .eq("status", "ACTIVE"),
  ]);

  const compMap = new Map<string, string>(
    (competitors ?? []).map((c) => [c.id as string, c.page_name as string])
  );
  const counts = new Map<string, number>();
  for (const row of (topCompRows ?? []) as { competitor_id: string | null }[]) {
    if (!row.competitor_id) continue;
    counts.set(row.competitor_id, (counts.get(row.competitor_id) ?? 0) + 1);
  }
  const topComps = [...counts.entries()]
    .map(([id, n]) => ({ id, n, name: compMap.get(id) ?? "—" }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">
          Buongiorno{profile.name ? `, ${profile.name.split(" ")[0]}` : ""}.
        </h1>
        <p className="text-sm text-muted-foreground">
          Panoramica del tuo workspace MAIT.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<Eye className="size-4 text-gold" />}
          label="Ads totali"
          value={formatNumber(totalAds ?? 0)}
        />
        <Stat
          icon={<Sparkles className="size-4 text-gold" />}
          label="Ads attive"
          value={formatNumber(activeAds ?? 0)}
        />
        <Stat
          icon={<Users className="size-4 text-gold" />}
          label="Competitor monitorati"
          value={formatNumber(competitorsCount ?? 0)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Latest ads</CardTitle>
            <Link
              href="/library"
              className="text-xs text-gold hover:underline flex items-center gap-1"
            >
              Vedi tutto <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {(!recentAds || recentAds.length === 0) ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nessuna ad ancora. Aggiungi un competitor e lancia uno scan.
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {(recentAds as MaitAdExternal[]).slice(0, 8).map((a) => (
                  <AdCard key={a.id} ad={a} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 competitor (active)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topComps.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nessun dato ancora.
              </p>
            )}
            {topComps.map((tc) => (
              <Link
                key={tc.id}
                href={`/competitors/${tc.id}`}
                className="flex items-center justify-between p-3 rounded-md border border-border hover:border-gold/50 transition-colors"
              >
                <span className="font-medium text-sm truncate">{tc.name}</span>
                <Badge variant="gold">{tc.n} ads</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center">
          {icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            {label}
          </div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
