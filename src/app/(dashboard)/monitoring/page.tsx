import Link from "next/link";
import {
  Search,
  MapPin,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { MetaIcon } from "@/components/ui/meta-icon";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { TikTokIcon } from "@/components/ui/tiktok-icon";
import { SnapchatIcon } from "@/components/ui/snapchat-icon";
import { YouTubeIcon } from "@/components/ui/youtube-icon";
import { getLocale, serverT } from "@/lib/i18n/server";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";

export const dynamic = "force-dynamic";

/* ─── Inline Google logo (mirrors scan-dropdown.tsx) ─── */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
    </svg>
  );
}

/**
 * Monitoring landing — channel-first entry point. The user lands here
 * with the question "what channel do I want to inspect across all my
 * brands?", picks a card, and is dropped into a workspace-level view
 * of that channel with a brand filter.
 *
 * The mirror flow is brand-first: brand detail page → channel tab.
 * Both surfaces hit the same data model so a query / search / scan
 * created from one is visible from the other.
 *
 * Cards link to existing workspace surfaces:
 *   - Meta / Google / Instagram / TikTok / Snapchat / YouTube → /library?channel=X
 *   - Google SERP → /serp
 *   - Google Maps → /maps
 */
export default async function MonitoringLandingPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  // Per-tool counts. Head-only queries — RLS scopes them to the
  // user's workspace. Run in parallel to keep the landing snappy.
  const [
    { count: metaCount },
    { count: googleCount },
    { count: instagramCount },
    { count: tiktokCount },
    { count: snapchatCount },
    { count: youtubeCount },
    { count: serpCount },
    { count: mapsCount },
  ] = await Promise.all([
    supabase
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("source", "meta"),
    supabase
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("source", "google"),
    supabase
      .from("mait_organic_posts")
      .select("id", { count: "exact", head: true })
      .eq("platform", "instagram"),
    supabase
      .from("mait_tiktok_posts")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("mait_snapchat_profiles")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("mait_youtube_videos")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("mait_serp_queries")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("mait_maps_searches")
      .select("id", { count: "exact", head: true }),
  ]);

  // Tools grouped by category — colour-coded via .channel-rail in
  // globals.css. The user explicitly requested grouped colours
  // (paid / organic / monitoring) instead of per-platform native
  // colours, so the visual category dominates the read.
  type Tool = {
    key: string;
    href: string;
    title: string;
    description: string;
    iconNode: React.ReactNode;
    count: number;
    countLabel: string;
  };
  const paidTools: Tool[] = [
    {
      key: "meta",
      href: "/library?channel=meta",
      title: t("monitoring", "metaTitle"),
      description: t("monitoring", "metaDescription"),
      iconNode: <MetaIcon className="size-5" />,
      count: metaCount ?? 0,
      countLabel: t("monitoring", "adsCountLabel"),
    },
    {
      key: "google",
      href: "/library?channel=google",
      title: t("monitoring", "googleAdsTitle"),
      description: t("monitoring", "googleAdsDescription"),
      iconNode: <GoogleLogo className="size-5" />,
      count: googleCount ?? 0,
      countLabel: t("monitoring", "adsCountLabel"),
    },
  ];
  const organicTools: Tool[] = [
    {
      key: "instagram",
      href: "/library?channel=instagram",
      title: t("monitoring", "instagramTitle"),
      description: t("monitoring", "instagramDescription"),
      iconNode: <InstagramIcon className="size-5" />,
      count: instagramCount ?? 0,
      countLabel: t("monitoring", "postsCountLabel"),
    },
    {
      key: "tiktok",
      href: "/library?channel=tiktok",
      title: t("monitoring", "tiktokTitle"),
      description: t("monitoring", "tiktokDescription"),
      iconNode: <TikTokIcon className="size-5" />,
      count: tiktokCount ?? 0,
      countLabel: t("monitoring", "postsCountLabel"),
    },
    {
      key: "snapchat",
      href: "/library?channel=snapchat",
      title: t("monitoring", "snapchatTitle"),
      description: t("monitoring", "snapchatDescription"),
      iconNode: <SnapchatIcon className="size-5" />,
      count: snapchatCount ?? 0,
      countLabel: t("monitoring", "snapshotsCountLabel"),
    },
    {
      key: "youtube",
      href: "/library?channel=youtube",
      title: t("monitoring", "youtubeTitle"),
      description: t("monitoring", "youtubeDescription"),
      iconNode: <YouTubeIcon className="size-5" />,
      count: youtubeCount ?? 0,
      countLabel: t("monitoring", "videosCountLabel"),
    },
  ];
  const monitoringTools: Tool[] = [
    {
      key: "serp",
      href: "/serp",
      title: t("monitoring", "serpTitle"),
      description: t("monitoring", "serpDescription"),
      iconNode: <Search className="size-5" />,
      count: serpCount ?? 0,
      countLabel: t("monitoring", "serpCountLabel"),
    },
    {
      key: "maps",
      href: "/maps",
      title: t("monitoring", "mapsTitle"),
      description: t("monitoring", "mapsDescription"),
      iconNode: <MapPin className="size-5" />,
      count: mapsCount ?? 0,
      countLabel: t("monitoring", "mapsCountLabel"),
    },
  ];

  function CardGrid({ tools }: { tools: Tool[] }) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tools.map((tool) => (
          <Link key={tool.key} href={tool.href} className="block group">
            <Card
              className="h-full hover:shadow-md hover:border-gold/30 transition-all cursor-pointer channel-rail"
              data-channel={tool.key}
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="size-10 rounded-md bg-muted/50 grid place-items-center text-foreground/80">
                    {tool.iconNode}
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:text-gold group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {tool.title}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                    {tool.description}
                  </p>
                </div>
                <div className="flex items-baseline gap-1.5 pt-3 section-rule">
                  <span className="text-2xl font-semibold tabular-nums tracking-tight">
                    {tool.count}
                  </span>
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                    {tool.countLabel}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    );
  }

  // Section header for each category — the dot picks up the
  // channel-rail accent colour so the grouping logic is also
  // visible without scanning the card edges.
  function GroupHeading({
    label,
    tone,
  }: {
    label: string;
    tone: "paid" | "organic" | "monitoring";
  }) {
    const dotClass =
      tone === "paid"
        ? "bg-[#4f46e5]"
        : tone === "organic"
          ? "bg-[#10b981]"
          : "bg-[#8b5cf6]";
    return (
      <div className="flex items-center gap-2">
        <span className={`size-2.5 rounded-full ${dotClass}`} />
        <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          {label}
        </h2>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DynamicBackLink fallbackHref="/dashboard" label={t("common", "backToDashboard")} />
      {/* Subtitle width un-capped — the previous max-w-2xl cap
          truncated the line at ~50% of the page on wide screens
          even though the prose was fine. User feedback 2026-05-04
          flagged this for the second time across pages, so we
          remove the cap here (and elsewhere on the audit pass). */}
      <header className="space-y-1">
        <p className="eyebrow">{t("monitoring", "title").toUpperCase()}</p>
        <h1 className="text-3xl font-serif tracking-tight">
          {t("monitoring", "title")}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
          {t("monitoring", "subtitle")}
        </p>
      </header>

      {/* Three groups, each preceded by an eyebrow heading
          carrying the same accent dot used on the card rails.
          Reading flow: PAID first (revenue impact), then
          ORGANIC (audience), then MONITORING (presence). */}
      <section className="space-y-3">
        <GroupHeading
          label={t("monitoring", "groupPaid")}
          tone="paid"
        />
        <CardGrid tools={paidTools} />
      </section>

      <section className="space-y-3">
        <GroupHeading
          label={t("monitoring", "groupOrganic")}
          tone="organic"
        />
        <CardGrid tools={organicTools} />
      </section>

      <section className="space-y-3">
        <GroupHeading
          label={t("monitoring", "groupMonitoring")}
          tone="monitoring"
        />
        <CardGrid tools={monitoringTools} />
      </section>
    </div>
  );
}
