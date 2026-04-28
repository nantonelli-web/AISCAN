import Link from "next/link";
import { Plus, ExternalLink, Pencil } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getLocale, serverT } from "@/lib/i18n/server";
import { CollapsibleClientSection } from "./collapsible-client-section";
import { PrintButton } from "@/components/ui/print-button";
import type { MaitCompetitor, MaitClient } from "@/types";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [{ data: competitors }, { data: clientsData }, { data: recentJobs }] = await Promise.all([
    supabase
      .from("mait_competitors")
      .select("id, workspace_id, client_id, page_name, page_id, page_url, category, country, instagram_username, google_advertiser_id, google_domain, profile_picture_url, monitor_config, last_scraped_at, created_at")
      .eq("workspace_id", profile.workspace_id!)
      .order("page_name"),
    admin
      .from("mait_clients")
      .select("id, name, color, workspace_id")
      .eq("workspace_id", profile.workspace_id!)
      .order("name"),
    // Pull every succeeded scan for the workspace ordered most-recent
    // first; the loop below keeps only the first occurrence per
    // competitor so we get the latest scan window per brand without
    // running one query per row.
    admin
      .from("mait_scrape_jobs")
      .select("competitor_id, date_from, date_to, started_at, source")
      .eq("workspace_id", profile.workspace_id!)
      .eq("status", "succeeded")
      .order("started_at", { ascending: false }),
  ]);

  const list = (competitors ?? []) as MaitCompetitor[];
  const clients = (clientsData ?? []) as MaitClient[];

  // Build a per-competitor map of the latest scan window. Cron jobs
  // and full-archive manual scans store NULL for both bounds — those
  // rows are kept in the map but the UI just renders the run date
  // without a period suffix. `source` (added in migration 0027) lets
  // the card show WHICH channel was scanned last; legacy rows have
  // it null and the badge falls back to "—".
  const lastScanByCompetitor = new Map<
    string,
    { from: string | null; to: string | null; source: string | null }
  >();
  for (const j of recentJobs ?? []) {
    const cid = (j as { competitor_id: string | null }).competitor_id;
    if (!cid || lastScanByCompetitor.has(cid)) continue;
    lastScanByCompetitor.set(cid, {
      from: (j as { date_from: string | null }).date_from ?? null,
      to: (j as { date_to: string | null }).date_to ?? null,
      source: (j as { source: string | null }).source ?? null,
    });
  }

  // Group brands by client
  const grouped = new Map<string | null, MaitCompetitor[]>();
  for (const c of list) {
    const key = c.client_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }

  // Build ordered sections: clients first (alphabetical), then unassigned
  const sections: { client: MaitClient | null; brands: MaitCompetitor[] }[] = [];
  for (const client of clients) {
    const brands = grouped.get(client.id) ?? [];
    if (brands.length > 0) {
      sections.push({ client, brands });
    }
  }
  const unassigned = grouped.get(null) ?? [];
  if (unassigned.length > 0) {
    sections.push({ client: null, brands: unassigned });
  }
  // Also add empty clients so they're visible
  for (const client of clients) {
    if (!sections.some((s) => s.client?.id === client.id)) {
      sections.push({ client, brands: [] });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">{t("competitors", "title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("competitors", "subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PrintButton label={t("common", "print")} variant="outline" />
          <Button asChild className="print:hidden">
            <Link href="/competitors/new">
              <Plus className="size-4" /> {t("competitors", "addCompetitor")}
            </Link>
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("competitors", "noCompetitors")} {t("competitors", "noCompetitorsClickAdd")}
          </CardContent>
        </Card>
      ) : sections.length > 0 && (clients.length > 0 || unassigned.length < list.length) ? (
        // Grouped view — each client section collapsible for discretion
        <div className="space-y-6">
          {sections.map((section) => {
            const clientKey = section.client?.id ?? "unassigned";
            return (
              <CollapsibleClientSection
                key={clientKey}
                clientKey={clientKey}
                clientName={section.client?.name ?? t("clients", "unassigned")}
                clientColor={section.client?.color ?? "#9ca3af"}
                brandCount={section.brands.length}
              >
                {section.brands.length === 0 ? (
                  <p className="text-xs text-muted-foreground ml-5 mb-4">
                    {t("clients", "emptyClient")}
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 ml-5">
                    {section.brands.map((c) => (
                      <BrandCard
                        key={c.id}
                        brand={c}
                        lastScan={lastScanByCompetitor.get(c.id) ?? null}
                        t={t}
                      />
                    ))}
                  </div>
                )}
              </CollapsibleClientSection>
            );
          })}
        </div>
      ) : (
        // Flat view (no clients created yet)
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <BrandCard
              key={c.id}
              brand={c}
              lastScan={lastScanByCompetitor.get(c.id) ?? null}
              t={t}
            />
          ))}
        </div>
      )}

      {list.length > 0 && (
        <div className="flex justify-center pt-4 print:hidden">
          <PrintButton label={t("common", "print")} variant="outline" />
        </div>
      )}
    </div>
  );
}

// Channel display label — keeps "Meta Ads" / "Google Ads" full names
// the user already sees in the ScanDropdown, and Title-cases the
// social channels for visual symmetry. Falls back to "—" for legacy
// jobs scanned before migration 0027 added the source column.
function channelLabel(source: string | null): string {
  switch (source) {
    case "meta": return "Meta Ads";
    case "google": return "Google Ads";
    case "instagram": return "Instagram";
    case "tiktok": return "TikTok";
    case "snapchat": return "Snapchat";
    case "youtube": return "YouTube";
    default: return "—";
  }
}

function BrandCard({
  brand: c,
  lastScan,
  t,
}: {
  brand: MaitCompetitor;
  /** Latest succeeded scan record for the brand. `from`/`to` describe
   *  the date window the user requested (NULL means full-archive),
   *  `source` is the channel that ran (NULL for legacy pre-0027 jobs). */
  lastScan: {
    from: string | null;
    to: string | null;
    source: string | null;
  } | null;
  t: (section: string, key: string) => string;
}) {
  const hasPeriod = lastScan && lastScan.from && lastScan.to;
  return (
    <Card className="hover:border-gold/50 transition-colors h-full relative">
      <Link href={`/competitors/${c.id}`} className="absolute inset-0 z-0" />
      <CardContent className="p-5 space-y-3 relative z-10 pointer-events-none">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{c.page_name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {c.page_url}
            </p>
          </div>
          <ExternalLink className="size-4 text-muted-foreground shrink-0" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {c.country && <Badge variant="muted">{c.country}</Badge>}
          {c.category && <Badge variant="muted">{c.category}</Badge>}
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {t("competitors", "lastScan")} {formatDate(c.last_scraped_at)}
              {lastScan?.source && (
                <>
                  {" — "}
                  <span className="text-foreground/80 font-medium">
                    {channelLabel(lastScan.source)}
                  </span>
                </>
              )}
            </p>
            {hasPeriod && (
              <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                {t("competitors", "scanPeriod")}{" "}
                {formatDate(lastScan.from)} → {formatDate(lastScan.to)}
              </p>
            )}
          </div>
          <Link
            href={`/competitors/${c.id}/edit?from=brands`}
            className="size-7 rounded-md border border-border hover:bg-muted hover:border-gold/40 grid place-items-center text-muted-foreground hover:text-gold transition-colors pointer-events-auto"
            title={t("editCompetitor", "title")}
          >
            <Pencil className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
