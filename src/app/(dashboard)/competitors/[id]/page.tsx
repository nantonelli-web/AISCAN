import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdCard } from "@/components/ads/ad-card";
import { TagButton } from "@/components/ads/tag-button";
import { ScanButton } from "./scan-button";
import { FrequencySelector } from "./frequency-selector";
import { JobHistory } from "./job-history";
import { formatDate } from "@/lib/utils";
import type { MaitAdExternal, MaitCompetitor, MaitScrapeJob } from "@/types";

export const dynamic = "force-dynamic";

export default async function CompetitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getSessionUser();
  const supabase = await createClient();

  const { data: competitor } = await supabase
    .from("mait_competitors")
    .select("*")
    .eq("id", id)
    .single();

  if (!competitor) notFound();
  const c = competitor as MaitCompetitor;

  const [{ data: ads }, { data: jobs }] = await Promise.all([
    supabase
      .from("mait_ads_external")
      .select("*")
      .eq("competitor_id", id)
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(120),
    supabase
      .from("mait_scrape_jobs")
      .select("*")
      .eq("competitor_id", id)
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  const adsList = (ads ?? []) as MaitAdExternal[];
  const jobsList = (jobs ?? []) as MaitScrapeJob[];
  const frequency = ((c.monitor_config as { frequency?: string })?.frequency ??
    "manual") as "manual" | "daily" | "weekly";

  return (
    <div className="space-y-6">
      <Link
        href="/competitors"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Tutti i competitor
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h1 className="text-3xl font-serif tracking-tight">{c.page_name}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={c.page_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-gold hover:underline"
            >
              {c.page_url}
            </a>
            {c.country && <Badge variant="muted">{c.country}</Badge>}
            {c.category && <Badge variant="muted">{c.category}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Ultimo scan: {formatDate(c.last_scraped_at)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <FrequencySelector competitorId={c.id} initial={frequency} />
          <TagButton competitorId={c.id} />
          <Button asChild variant="outline">
            <a href={`/api/export/ads.csv?competitor_id=${c.id}`}>
              <Download className="size-4" /> Export CSV
            </a>
          </Button>
          <ScanButton competitorId={c.id} />
        </div>
      </div>

      {jobsList.length > 0 && <JobHistory jobs={jobsList} />}

      {adsList.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nessuna ad ancora raccolta. Lancia uno <b>Scan now</b> per popolare
            la libreria.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {adsList.length} ads (max 120 più recenti)
          </p>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {adsList.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
