import Link from "next/link";
import { Plus, Pencil, Users } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/kpi";
import { formatDate } from "@/lib/utils";
import { getLocale, serverT } from "@/lib/i18n/server";
import { CollapsibleClientSection } from "./collapsible-client-section";
import { PrintButton } from "@/components/ui/print-button";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { BrandCardDeleteButton } from "./brand-card-delete-button";
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
    <div className="space-y-8">
      <DynamicBackLink fallbackHref="/dashboard" label={t("common", "backToDashboard")} />
      <SectionHeader
        size="page"
        icon={<Users className="size-5" />}
        title={t("competitors", "title")}
        description={t("competitors", "subtitle")}
        action={
          <div className="flex items-center gap-3">
            <PrintButton label={t("common", "print")} variant="outline" />
            <Button asChild>
              <Link href="/competitors/new">
                <Plus className="size-4" /> {t("competitors", "addCompetitor")}
              </Link>
            </Button>
          </div>
        }
      />

      {/* Top-level metrics — quickly answer "how big is my workspace?".
          Three KPIs at a glance: brands tracked, clients (projects), and
          a pulse number (brands without a recent scan) that surfaces
          maintenance work the user should not lose track of. */}
      {list.length > 0 && (() => {
        const FRESHNESS_DAYS = 14;
        const cutoff = Date.now() - FRESHNESS_DAYS * 86_400_000;
        const stale = list.filter(
          (c) =>
            !c.last_scraped_at ||
            new Date(c.last_scraped_at).getTime() < cutoff,
        ).length;
        const projectCount = clients.length;
        return (
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat
              label={t("competitors", "kpiBrandsLabel")}
              value={String(list.length)}
              tone="info"
            />
            <MiniStat
              label={t("competitors", "kpiProjectsLabel")}
              value={String(projectCount)}
              tone="neutral"
            />
            <MiniStat
              label={t("competitors", "kpiStaleLabel")}
              value={String(stale)}
              tone={stale === 0 ? "success" : stale > list.length / 3 ? "danger" : "warning"}
              hint={t("competitors", "kpiStaleHint").replace("{n}", String(FRESHNESS_DAYS))}
            />
          </div>
        );
      })()}

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

function MiniStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  const toneText: Record<typeof tone, string> = {
    neutral: "text-foreground",
    info: "text-gold",
    success: "tone-success",
    warning: "tone-warning",
    danger: "tone-danger",
  };
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value mt-1 ${toneText[tone]}`}>{value}</div>
      {hint && (
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>
      )}
    </div>
  );
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

  // Freshness signal — colour codes how stale the last scan is. Eyes
  // catch the dot before the date string. Active = scanned in the
  // last 14d, paused = 14-30d, inactive = older or never. Maps neatly
  // to .status-pill from globals.css.
  const lastScanMs = c.last_scraped_at ? new Date(c.last_scraped_at).getTime() : null;
  const ageDays = lastScanMs ? Math.floor((Date.now() - lastScanMs) / 86_400_000) : null;
  const freshTone =
    ageDays === null ? "is-inactive"
    : ageDays <= 14 ? "is-active"
    : ageDays <= 30 ? "is-paused"
    : "is-inactive";
  const freshLabel =
    ageDays === null ? t("competitors", "freshNever")
    : ageDays === 0 ? t("competitors", "freshToday")
    : ageDays === 1 ? `${ageDays} ${t("competitors", "freshDay")}`
    : `${ageDays} ${t("competitors", "freshDays")}`;

  return (
    <Card className="h-full relative group hover:border-gold/40 hover:shadow-md transition-all">
      <Link href={`/competitors/${c.id}`} className="absolute inset-0 z-0" />
      <CardContent className="p-5 space-y-3.5 relative z-10 pointer-events-none">
        {/* Title row — brand identity dominates. Category badge
            removed 2026-05-04 alongside hiding the field in the
            new/edit forms; legacy brands had their value still
            rendered as a "Fashion" pill on the right which the
            user no longer wanted to see anywhere. */}
        <div className="flex items-start gap-2">
          <h3 className="font-semibold text-base leading-snug truncate min-w-0">
            {c.page_name}
          </h3>
        </div>

        {/* Secondary metadata — country chip + freshness pill.
            Both visually small and subordinate to the brand name.
            Channel-of-last-scan is no longer rendered as a dangling
            "· Instagram" here — moved into the footer line where
            it belongs grammatically ("Last scan: <date> · Instagram"). */}
        <div className="flex items-center gap-2 flex-wrap">
          {c.country && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
              {c.country}
            </span>
          )}
          <span className={`status-pill ${freshTone}`}>{freshLabel}</span>
        </div>

        {/* Scan window — only meaningful for ad scans (Meta /
            Google) where the user-chosen date range actually
            filters which ads come back. Organic scans (Instagram /
            TikTok / Snapchat / YouTube / SERP) pull the most-
            recent N items and ignore date_from/date_to entirely,
            so showing "Period: 20 Apr → 04 May" on them was
            misleading (user-flagged 2026-05-04). */}
        {hasPeriod && (lastScan.source === "meta" || lastScan.source === "google") && (
          <p className="text-[11px] text-muted-foreground/80">
            {t("competitors", "scanPeriod")}{" "}
            <span className="tabular-nums">
              {formatDate(lastScan.from)} → {formatDate(lastScan.to)}
            </span>
          </p>
        )}

        {/* Action row — pinned to the bottom via mt-auto on the
            card flexbox so cards in the same row align even when
            their metadata height differs. */}
        <div className="flex items-center justify-between gap-2 pt-2 section-rule">
          <span className="text-[11px] text-muted-foreground">
            {c.last_scraped_at ? (
              <>
                {t("competitors", "lastScan")} {formatDate(c.last_scraped_at)}
                {lastScan?.source && (
                  <>
                    {" · "}
                    <span className="text-foreground/70 font-medium">
                      {channelLabel(lastScan.source)}
                    </span>
                  </>
                )}
              </>
            ) : (
              <>{t("competitors", "lastScan")} —</>
            )}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              href={`/competitors/${c.id}/edit?from=brands`}
              className="size-7 rounded-md border border-border hover:bg-muted hover:border-gold/40 grid place-items-center text-muted-foreground hover:text-gold transition-colors pointer-events-auto"
              title={t("editCompetitor", "title")}
            >
              <Pencil className="size-3.5" />
            </Link>
            <BrandCardDeleteButton
              competitorId={c.id}
              competitorName={c.page_name}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
