"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdCard } from "@/components/ads/ad-card";
import { OrganicPostCard } from "@/components/organic/organic-post-card";
import { TikTokPostCard } from "@/components/organic/tiktok-post-card";
import { TopCollaboratorsPanel } from "@/components/organic/top-collaborators-panel";
import {
  aggregateCollaborators,
  isCollabPost,
} from "@/lib/organic/collaborations";
import { TiktokAdCard } from "@/components/ads/tiktok-ad-card";
import { SnapchatProfileCard } from "@/components/organic/snapchat-profile-card";
import { YoutubeChannelCard } from "@/components/organic/youtube-channel-card";
import { YoutubeVideoCard } from "@/components/organic/youtube-video-card";
import { BrandSerpRankCard } from "@/components/serp/brand-serp-rank-card";
import { ChannelCoverBand } from "@/components/organic/channel-cover-band";
import { TagButton } from "@/components/ads/tag-button";
import { AI_TAGS_ENABLED } from "@/config/features";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { MetaIcon } from "@/components/ui/meta-icon";
import { TikTokIcon } from "@/components/ui/tiktok-icon";
import { SnapchatIcon } from "@/components/ui/snapchat-icon";
import { YouTubeIcon } from "@/components/ui/youtube-icon";
import { Download, Loader2, Search as SearchIcon, MapPin, SlidersHorizontal, LayoutGrid } from "lucide-react";
import { GoogleIcon } from "@/components/ui/google-icon";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { CountryFilterDropdown } from "./country-filter-dropdown";
import { CreativesDateFilter } from "./creatives-date-filter";
import { InfoPopover } from "@/components/ui/info-popover";
import type { BrandSerpQueryRank, BrandIdentity } from "./brand-channels-section";
import type {
  MaitAdExternal,
  MaitOrganicPost,
  MaitTikTokPost,
  MaitSnapchatProfile,
  MaitYoutubeChannel,
  MaitYoutubeVideo,
} from "@/types";
import type { MaitTiktokAd } from "@/types/tiktok-ads";
import type { MaitSnapchatAd } from "@/types/snapchat-ads";
import { SnapchatAdCard } from "@/components/ads/snapchat-ad-card";

type Channel = "all" | "meta" | "google" | "instagram" | "tiktok" | "snapchat" | "youtube" | "serp" | "maps";
type Status = "all" | "active" | "inactive";

/* ─── Component ─── */

interface Props {
  competitorId: string;
  /** Brand's google_domain (eTLD+1 already), pulled from the brand
   *  row. Drives the SERP-tab visibility gate together with the
   *  channelTotals.serpQueries count. */
  googleDomain: string | null;
  /** Brand identity used for the per-channel cover bands (avatar,
   *  name, channel handle). Pre-computed in the parent so this client
   *  component does not need to issue a brand query. */
  brand: BrandIdentity;
  ads: MaitAdExternal[];
  organicPosts: MaitOrganicPost[];
  tiktokPosts: MaitTikTokPost[];
  /** Paid TikTok ads (DSA library + Creative Center co-mingled).
   *  Discriminated by `source` at row level. Rendered above the
   *  organic post grid in the TikTok tab. */
  tiktokAds: MaitTiktokAd[];
  /** Snapshot history for this competitor, ordered most-recent-first.
   *  [0] is the latest profile snapshot rendered as the SnapchatProfileCard;
   *  the rest feed the trend list. */
  snapchatProfiles: MaitSnapchatProfile[];
  /** Paid Snapchat ads scraped via Snap's official DSA REST API.
   *  Rendered above the organic snapshot block on the Snapchat tab,
   *  same pattern as TikTok Ads above TikTok organic posts. */
  snapchatAds: MaitSnapchatAd[];
  /** YouTube channel snapshots, most-recent-first. [0] is the latest
   *  rendered as the YoutubeChannelCard; older rows feed a small
   *  trend block (subscriber/video/view delta between scans). */
  youtubeChannels: MaitYoutubeChannel[];
  /** YouTube videos, most-recent-first. */
  youtubeVideos: MaitYoutubeVideo[];
  /** SERP queries linked to this brand via the M:N junction, with
   *  the brand's rank in the latest run already folded in. Empty
   *  when the brand has no linked queries — the tab is hidden in
   *  that case. */
  serpQueries: BrandSerpQueryRank[];
  /** DB-wide totals per channel — drive the filter chip badges so the
   *  user sees the real count for the brand, not the lazy-loaded
   *  array length (which is capped at 30 for performance). */
  channelTotals: {
    meta: number;
    google: number;
    instagram: number;
    tiktok: number;
    snapchat: number;
    /** Paid Snapchat ads count, surfaced alongside organic snapshots
     *  so the Snapchat chip reflects both surfaces. */
    snapchatAds: number;
    youtube: number;
    youtubeChannelSnaps: number;
    serpQueries: number;
  };
  /** DB-wide active-only counts per source — fed to the Status pill
   *  so the Active badge matches the brand reality, not the loaded
   *  sample. Inactive = total − active. */
  activeTotals: { meta: number; google: number };
  /** Filter-aware per-source counts. Drive the "(X of Y)" caption
   *  above each grid so Y reflects the user's active narrowing,
   *  not the brand-wide channel total. */
  filteredTotals: { meta: number; google: number };
  /** Period-vs-period comparison data — null quando confronto e
   *  spento. from/to sono le date del periodo precedente cosi la
   *  UI puo' renderizzare "vs Y (period dd/MM - dd/MM)" sotto al
   *  counter principale. */
  compareTotals: {
    meta: number;
    google: number;
    from: string;
    to: string;
  } | null;
  compareMode: "custom" | null;
  /** URL-driven filter state. Pills navigate the URL; the server
   *  re-runs the ads query with these applied so the 30-row cap
   *  operates AFTER filtering. */
  tab: "all" | "meta" | "google" | "instagram" | "tiktok" | "snapchat" | "youtube" | "serp" | "maps";
  statusFilter: "active" | "inactive" | null;
  countriesFilter: string[];
  /** ISO yyyy-MM-dd. null = no narrowing. Applies solo alle ads
   *  (organic/snapshot non hanno la stessa semantica di start/end). */
  dateFrom: string | null;
  dateTo: string | null;
  /** Brand-wide country list (from page shell, not the loaded
   *  sample) so the dropdown always shows every market — even
   *  the ones whose ads dropped out under the active filters. */
  availableCountries: { code: string; count: number; name: string }[];
  organicStats: {
    count: number;
    /** null when every post has likes hidden (Instagram setting) —
     *  rendered as em-dash instead of "0" or "-1" so the user sees
     *  "unknown" rather than wrong numbers. */
    avgLikes: number | null;
    avgComments: number | null;
    totalViews: number;
  };
  tiktokStats: {
    count: number;
    avgLikes: number | null;
    avgComments: number | null;
    totalViews: number;
  };
  youtubeStats: {
    count: number;
    avgLikes: number | null;
    avgComments: number | null;
    totalViews: number;
  };
  /** Light projection di TUTTI i post IG del brand (non solo i 30
   *  visibili nel grid) per il collab aggregate. */
  organicCollabPool: Array<{
    caption: string | null;
    mentions: string[] | null;
    tagged_users: string[] | null;
  }>;
  tiktokCollabPool: Array<{
    caption: string | null;
    mentions: string[] | null;
  }>;
}

export function ChannelTabs({
  competitorId,
  googleDomain,
  brand,
  ads,
  organicPosts,
  tiktokPosts,
  tiktokAds,
  snapchatProfiles,
  snapchatAds,
  youtubeChannels,
  youtubeVideos,
  serpQueries,
  channelTotals,
  activeTotals,
  filteredTotals,
  availableCountries,
  tab,
  statusFilter,
  countriesFilter,
  dateFrom,
  dateTo,
  compareTotals,
  compareMode,
  organicStats,
  tiktokStats,
  youtubeStats,
  organicCollabPool,
  tiktokCollabPool,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useT();

  // URL-derived filter state. Pills navigate to a new URL; the server
  // re-runs the query with the new filters so the 30-row cap is
  // applied AFTER filtering. No client-side state — ads come from
  // the server already filtered.
  const channel: Channel = tab;
  const status: Status = statusFilter ?? "all";
  const selectedCountries = useMemo(
    () => new Set(countriesFilter),
    [countriesFilter],
  );

  // Build a URL with one or more search params updated. Passing null
  // removes the param, so e.g. picking "All" on the Status pills
  // drops `status` from the URL entirely (cleaner bookmarkable state).
  function buildHref(updates: Record<string, string | null>): string {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // Split server-rendered ads by source so the "all" view can group
  // Meta and Google sections separately. Server has already applied
  // every active filter — no further client-side narrowing needed.
  // Strict equality on source: filteredTotals.meta is computed via
  // .eq("source", "meta") on the server, so the client filter must
  // match exactly. Using `!== "google"` would pick up legacy rows
  // with source=NULL and inflate metaAds.length past filteredTotals.meta,
  // which silently hid the Load more button on brands with any null-source rows.
  const serverMetaAds = ads.filter((a) => {
    const src = (a as unknown as Record<string, unknown>).source;
    return src === "meta";
  });
  const serverGoogleAds = ads.filter((a) => {
    const src = (a as unknown as Record<string, unknown>).source;
    return src === "google";
  });

  // 2026-05-19: filtri Paesi sempre visibili (utente: "non deve
  // cambiare il comportamento rispetto al canale selezionato").
  // Per Google/IG/TT/SC/YT/SERP/Maps il filtro paesi resta un
  // no-op a livello query — la coerenza visiva ha priorita' sulla
  // funzionalita' per evitare disorientamento utente.
  const showCountryFilter = availableCountries.length > 0;

  // ── Load more: client-appended ads beyond the initial 30 ──
  // The server-rendered Suspense child caps the first paint at 30
  // ads to keep the wire transfer light (each ad carries 50-200 KB
  // of raw_data). The "Load more" button calls /api/brands/{id}
  // /ads?offset=… to pull the next page client-side and append in
  // place — no full Suspense reload, no skeleton flash.
  //
  // Suspense key includes every filter, so when the user changes a
  // filter the entire ChannelTabs subtree re-mounts and these
  // client-side states reset to empty automatically.
  const [extraMeta, setExtraMeta] = useState<MaitAdExternal[]>([]);
  const [extraGoogle, setExtraGoogle] = useState<MaitAdExternal[]>([]);
  const [loadingMore, setLoadingMore] = useState<"meta" | "google" | null>(
    null,
  );

  const metaAds = useMemo(
    () => [...serverMetaAds, ...extraMeta],
    [serverMetaAds, extraMeta],
  );
  const googleAds = useMemo(
    () => [...serverGoogleAds, ...extraGoogle],
    [serverGoogleAds, extraGoogle],
  );

  async function loadMore(source: "meta" | "google") {
    setLoadingMore(source);
    try {
      const params = new URLSearchParams();
      params.set("source", source);
      params.set(
        "offset",
        String(source === "meta" ? metaAds.length : googleAds.length),
      );
      params.set("limit", "30");
      if (statusFilter) params.set("status", statusFilter);
      if (countriesFilter.length > 0) {
        params.set("countries", countriesFilter.join(","));
      }
      const res = await fetch(
        `/api/brands/${competitorId}/ads?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { ads: MaitAdExternal[] };
      const next = json.ads ?? [];
      if (source === "meta") setExtraMeta((prev) => [...prev, ...next]);
      else setExtraGoogle((prev) => [...prev, ...next]);
    } catch {
      // Silent on failure — the button stays clickable for retry.
    } finally {
      setLoadingMore(null);
    }
  }

  // Channel badge counts honour the active Status filter: when the
  // user picks "Active", each channel chip shows its DB-wide active
  // subset (so 396 Meta → 84 if only 84 are currently active). The
  // "all" tab sums the paid subset under filter + the unfiltered
  // Instagram total since organic has no ACTIVE/INACTIVE concept.
  const metaCount =
    status === "all"
      ? channelTotals.meta
      : status === "active"
        ? activeTotals.meta
        : Math.max(0, channelTotals.meta - activeTotals.meta);
  const googleCount =
    status === "all"
      ? channelTotals.google
      : status === "active"
        ? activeTotals.google
        : Math.max(0, channelTotals.google - activeTotals.google);
  const instagramCount = channelTotals.instagram;
  const tiktokCount = channelTotals.tiktok;
  // Snapchat chip count = organic snapshots + paid ads (the tab
  // hosts both surfaces, so the badge must reflect both).
  const snapchatCount = channelTotals.snapchat + channelTotals.snapchatAds;
  const youtubeCount = channelTotals.youtube;
  const serpCount = channelTotals.serpQueries;
  // SERP tab: show whenever the brand has a googleDomain, even with
  // zero queries linked. The tab content provides the entry point
  // to create a brand-attached query — without this gate the
  // bidirectional flow (brand → SERP) would be inaccessible until
  // the user manually navigated to /serp first.

  // SERP tab visibility gate (project memory): show only when the
  // brand has a google_domain configured AND at least one query is
  // linked via the M:N junction. Without google_domain there is
  // nothing to match SERP results against; without linked queries
  // there is nothing to render.
  const serpTabVisible = !!googleDomain;

  const tabs: { key: Channel; label: string; count: number; icon?: React.ReactNode }[] = [
    {
      key: "all",
      label: t("competitors", "channelAll"),
      count:
        metaCount +
        googleCount +
        instagramCount +
        tiktokCount +
        snapchatCount +
        youtubeCount,
    },
    { key: "meta", label: "Meta Ads", count: metaCount, icon: <MetaIcon className="size-4" colored /> },
    { key: "google", label: "Google Ads", count: googleCount, icon: <GoogleIcon className="size-4" colored /> },
    { key: "instagram", label: "Instagram", count: instagramCount, icon: <InstagramIcon className="size-4" colored /> },
    { key: "tiktok", label: "TikTok", count: tiktokCount, icon: <TikTokIcon className="size-4" colored /> },
    { key: "snapchat", label: "Snapchat", count: snapchatCount, icon: <SnapchatIcon className="size-4" colored /> },
    { key: "youtube", label: "YouTube", count: youtubeCount, icon: <YouTubeIcon className="size-4" colored /> },
    ...(serpTabVisible
      ? [
          {
            key: "serp" as Channel,
            label: t("brandSerp", "tabLabel"),
            count: serpCount,
            icon: <SearchIcon className="size-4" />,
          },
        ]
      : []),
    // Maps tab: workspace-level (POI ranking via Nominatim); sempre
    // visibile come SERP, il contenuto e' un placeholder fino a che
    // l'aggregazione brand-level non e' implementata.
    {
      key: "maps" as Channel,
      label: "Google Maps",
      count: 0,
      icon: <MapPin className="size-4" />,
    },
  ];

  // Status pills — paid channels only. Instagram, TikTok, Snapchat,
  // YouTube and SERP are organic-style/standalone channels with no
  // ACTIVE/INACTIVE concept.
  const showStatusFilter =
    channel !== "instagram" &&
    channel !== "tiktok" &&
    channel !== "snapchat" &&
    channel !== "youtube" &&
    channel !== "serp";
  const statusPills: { key: Status; label: string }[] = [
    { key: "all", label: t("competitors", "channelAll") },
    { key: "active", label: t("competitors", "statusActive") },
    { key: "inactive", label: t("competitors", "statusInactive") },
  ];

  // Filter out channels with 0 items (except "all"). SERP is the
  // exception: when serpTabVisible is true (brand has googleDomain
  // set) we show the tab even with zero queries — the tab content
  // hosts the "Create query" entry point that bootstraps the first
  // linked query, so hiding it would break the flow.
  const visibleTabs = tabs.filter(
    (entry) =>
      entry.key === "all" ||
      entry.count > 0 ||
      (entry.key === "serp" && serpTabVisible) ||
      // Maps sempre visibile come tab nel pivot (placeholder fino a
      // che l'aggregazione brand-level non e' pronta). Coerente con
      // /benchmarks dove e' sempre nel pivot Monitoring.
      entry.key === "maps",
  );

  const showMeta = channel === "all" || channel === "meta";
  const showGoogle = channel === "all" || channel === "google";
  const showInstagram = channel === "all" || channel === "instagram";
  const showTiktok = channel === "all" || channel === "tiktok";
  const showSnapchat = channel === "all" || channel === "snapchat";
  const showYoutube = channel === "all" || channel === "youtube";
  // SERP only renders on the dedicated tab — never on "all". The
  // brand-detail "all" view is for media/posts, not for ranking
  // tables, so we keep the surfaces separate.
  const showSerp = channel === "serp" && serpTabVisible;

  const visibleAds = channel === "meta" ? metaAds : channel === "google" ? googleAds : channel === "all" ? ads : [];
  const visibleOrganic = showInstagram ? organicPosts : [];
  const visibleTiktok = showTiktok ? tiktokPosts : [];

  // ─── Collaborazioni L1 (2026-05-07) ─────────────────────────
  // Aggregato dei collaboratori ricorrenti (account taggati/menzionati
  // ≠ brand stesso) per piattaforma. Il pannello viene renderizzato
  // sopra il grid post in ciascuna scheda. La detection per-post
  // (badge "Collab" sul thumbnail) e' delegata al card component.
  // Aggregati collab calcolati sull'INTERA history del brand
  // (organicCollabPool / tiktokCollabPool) e non sui 30 post
  // visibili nel grid. Questo perche' un brand puo' avere collab
  // significativi piu' indietro nel tempo che andrebbero persi se
  // contassimo solo l'ultimo mese (verificato 2026-05-07: Elena
  // Miro TikTok aveva 0 collab nei 30 ultimi ma 5+ nei 50 totali).
  const igCollaborators = useMemo(
    () =>
      aggregateCollaborators(
        organicCollabPool.map((p) => ({
          mentions: p.mentions,
          tagged_users: p.tagged_users,
          caption: p.caption,
          platform: "instagram",
        })),
        brand.instagramUsername,
        "instagram",
      ),
    [organicCollabPool, brand.instagramUsername],
  );
  const igCollabPosts = useMemo(
    () =>
      organicCollabPool.filter((p) =>
        isCollabPost(
          p.mentions,
          p.tagged_users,
          brand.instagramUsername,
          p.caption,
        ),
      ).length,
    [organicCollabPool, brand.instagramUsername],
  );
  const ttCollaborators = useMemo(
    () =>
      aggregateCollaborators(
        tiktokCollabPool.map((p) => ({
          mentions: p.mentions,
          caption: p.caption,
          platform: "tiktok",
        })),
        brand.tiktokUsername,
        "tiktok",
      ),
    [tiktokCollabPool, brand.tiktokUsername],
  );
  const ttCollabPosts = useMemo(
    () =>
      tiktokCollabPool.filter((p) =>
        isCollabPost(p.mentions, null, brand.tiktokUsername, p.caption),
      ).length,
    [tiktokCollabPool, brand.tiktokUsername],
  );
  const visibleSnapchat = showSnapchat ? snapchatProfiles : [];
  const latestSnapchat = visibleSnapchat[0] ?? null;
  const visibleYoutubeVideos = showYoutube ? youtubeVideos : [];
  const latestYoutubeChannel = showYoutube ? youtubeChannels[0] ?? null : null;
  const visibleSerpQueries = showSerp ? serpQueries : [];

  // Status / Country chip class — pillole piccole per i modificatori
  // secondari. Channel ha una sua classe piu' grossa sotto (l'utente
  // ha chiesto esplicitamente "channel piu' grande" come PRIMARY pivot).
  const chipClass = (selected: boolean) =>
    selected
      ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold/15 text-gold border border-gold/30 transition-colors cursor-pointer"
      : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer";

  // Channel chip class — PIVOT primario, deve dominare. Padding
  // generoso (px-5 py-3), font-size sm semibold, icona size-5, badge
  // count piu' leggibile. Background gold solido per il selected
  // (non gold/15) cosi' lo stato attivo si distingue dai pill piccoli.
  const channelChipClass = (selected: boolean) =>
    selected
      ? "inline-flex items-center gap-2.5 px-5 py-3 text-sm font-semibold rounded-lg bg-gold text-gold-foreground border border-gold shadow-sm transition-colors cursor-pointer"
      : "inline-flex items-center gap-2.5 px-5 py-3 text-sm font-medium rounded-lg border border-border text-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer";

  // Render helper per una pillola canale (paid / organic / monitoring).
  const renderChannelChip = (p: { key: Channel; label: string; count: number; icon?: React.ReactNode }) => (
    <Link
      key={p.key}
      href={buildHref({
        tab: p.key === "all" ? null : p.key,
        // Switching to Instagram or Google disables the country
        // filter (no scan_countries on those rows). Drop the
        // selection rather than carrying an invisible filter forward.
        ...(p.key === "instagram" || p.key === "google"
          ? { countries: null }
          : {}),
      })}
      className={channelChipClass(channel === p.key)}
    >
      <span className="[&_svg]:size-5 inline-flex">{p.icon}</span>
      <span>{p.label}</span>
      {p.key !== "all" && p.count > 0 && (
        <span className={cn(
          "text-xs tabular-nums px-1.5 py-0.5 rounded",
          channel === p.key
            ? "bg-gold-foreground/15 text-gold-foreground"
            : "bg-muted text-muted-foreground",
        )}>
          {p.count}
        </span>
      )}
    </Link>
  );

  // Split visibleTabs in 3 gruppi semantici — Paid / Organic /
  // Monitoring — coerente con la pivot di /benchmarks. "All" sta
  // da solo a sinistra come catch-all.
  const allTab = visibleTabs.find((t) => t.key === "all");
  const paidTabs = visibleTabs.filter(
    (t) => t.key === "meta" || t.key === "google",
  );
  const organicTabs = visibleTabs.filter(
    (t) =>
      t.key === "instagram" ||
      t.key === "tiktok" ||
      t.key === "snapchat" ||
      t.key === "youtube",
  );
  const monitoringTabs = visibleTabs.filter(
    (t) => t.key === "serp" || t.key === "maps",
  );
  const sectionLabel =
    "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0";

  // Helper: % delta tra current e prev. Inverso non serve qui
  // (counts only). Restituisce null se prev=0 o entrambi null.
  function pctDelta(curr: number, prev: number): number | null {
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }
  // Pill inline per renderizzare il delta "+18% vs prec" colorato
  // verde/rosso/neutral. Replica mini-version di Adv Performance.
  function DeltaPill({ delta }: { delta: number | null }) {
    if (delta == null) return null;
    const sign = delta > 0 ? "+" : "";
    const tone =
      delta > 0
        ? "tone-success bg-success-soft/40"
        : delta < 0
          ? "tone-warning bg-warning-soft/40"
          : "text-muted-foreground bg-muted";
    return (
      <span
        className={`inline-flex items-center text-[10.5px] font-semibold px-1.5 py-0.5 rounded ${tone}`}
      >
        {sign}
        {Math.round(delta * 10) / 10}%
      </span>
    );
  }
  // Helper: date "2026-04-14" → "14/04"
  function shortDate(iso: string): string {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}` : iso;
  }

  // Filtri: ogni gruppo ha un titolo standalone (CANALI / PERIODO DI
  // ANALISI / PAESI / STATO) — coerenza richiesta utente. Righe
  // separate da horizontal divider, niente sub-card frame.
  // 2026-05-19: time controls sempre visibili (utente: "non deve
  // cambiare il comportamento rispetto al canale selezionato").
  // Il filtro data si applica anche ai post organici (posted_at).
  const showTimeControls = true;
  // Compare URL state: legacy "previous" rimosso (utente lo ha
  // chiesto), il confronto adesso e' sempre "custom" — date inputs
  // espliciti nel DateFilter sotto.
  const sp = useSearchParams();
  const urlCompareFrom = sp.get("compareFrom");
  const urlCompareTo = sp.get("compareTo");
  const compareEnabled = compareMode === "custom" && !!urlCompareFrom && !!urlCompareTo;
  const filtersNode = (
    <div className="space-y-5">
      {/* ─── CANALI ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-foreground font-bold">
          {t("competitors", "channelsHeader")}
        </h3>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {paidTabs.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className={sectionLabel}>
                {t("benchmarks", "paidChannels")}
              </span>
              {paidTabs.map((p) => renderChannelChip(p))}
            </div>
          )}
          {organicTabs.length > 0 && (
            <>
              <div className="hidden lg:block h-6 w-px bg-border" />
              <div className="flex items-center gap-2 flex-wrap">
                <span className={sectionLabel}>
                  {t("benchmarks", "organicChannels")}
                </span>
                {organicTabs.map((p) => renderChannelChip(p))}
              </div>
            </>
          )}
          {monitoringTabs.length > 0 && (
            <>
              <div className="hidden lg:block h-6 w-px bg-border" />
              <div className="flex items-center gap-2 flex-wrap">
                <span className={sectionLabel}>
                  {t("benchmarks", "monitoringChannels")}
                </span>
                {monitoringTabs.map((p) => renderChannelChip(p))}
              </div>
            </>
          )}
        </div>
        {/* "Tutti i canali" — catch-all sotto i 3 gruppi (richiesta
            utente 2026-05-19: era in cima e confondeva la gerarchia,
            adesso e' un fallback evidente in fondo). */}
        {allTab && (
          <div className="pt-1">
            <Link
              href={buildHref({ tab: null })}
              className={chipClass(channel === "all")}
            >
              <span>{t("competitors", "channelAllExplicit")}</span>
              {allTab.count > 0 && (
                <span className="text-[10px] tabular-nums opacity-70 ml-1">
                  {allTab.count}
                </span>
              )}
            </Link>
          </div>
        )}
      </section>

      {/* ─── PERIODO DI ANALISI (con confronto integrato) ───── */}
      {showTimeControls && (
        <>
          <div className="h-px bg-border" />
          <section className="space-y-3">
            <h3 className="text-[11px] uppercase tracking-wider text-foreground font-bold">
              {t("competitors", "timeControlsHeader")}
            </h3>
            <CreativesDateFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              compareFrom={urlCompareFrom}
              compareTo={urlCompareTo}
              compareEnabled={compareEnabled}
            />
            {/* Status del confronto se attivo: mostra le date di
                confronto in modo esplicito sotto. */}
            {compareEnabled && compareTotals && (
              <p className="text-[11px] text-muted-foreground pl-1">
                {t("competitors", "compareActive")}:{" "}
                <span className="font-mono">
                  {shortDate(compareTotals.from)} → {shortDate(compareTotals.to)}
                </span>
              </p>
            )}
          </section>
        </>
      )}

      {/* ─── PAESI ──────────────────────────────────────────── */}
      {showCountryFilter && (
        <>
          <div className="h-px bg-border" />
          <section className="space-y-3 print:hidden">
            <h3 className="text-[11px] uppercase tracking-wider text-foreground font-bold">
              {t("competitors", "countriesHeader")}
            </h3>
            <CountryFilterDropdown
              availableCountries={availableCountries}
              selected={selectedCountries}
              onChange={(next) => {
                const codes = [...next];
                router.push(
                  buildHref({
                    countries: codes.length > 0 ? codes.join(",") : null,
                  }),
                );
              }}
            />
          </section>
        </>
      )}

      {/* ─── STATO ──────────────────────────────────────────── */}
      {showStatusFilter && (
        <>
          <div className="h-px bg-border" />
          <section className="space-y-3 print:hidden">
            <h3 className="text-[11px] uppercase tracking-wider text-foreground font-bold">
              {t("competitors", "statusHeader")}
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              {statusPills.map((p) => (
                <Link
                  key={p.key}
                  href={buildHref({
                    status: p.key === "all" ? null : p.key,
                  })}
                  className={cn(
                    chipClass(status === p.key),
                    status !== p.key && p.key === "active" && "hover:tone-success",
                    status !== p.key && p.key === "inactive" && "hover:tone-neutral",
                  )}
                >
                  {p.key === "active" && (
                    <span className="size-1.5 rounded-full bg-current shrink-0 tone-success" />
                  )}
                  {p.key === "inactive" && (
                    <span className="size-1.5 rounded-full bg-current shrink-0 tone-neutral" />
                  )}
                  {p.label}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ─── Creativita & Insight — solo filtri.
          Sezione collapsible separata da Risultati cosi i 2 concetti
          (impostazioni vs output) sono distinguibili a colpo
          d'occhio. Tone info, default chiuso. */}
      <CollapsibleSectionCard
        icon={<SlidersHorizontal className="size-5" />}
        title={t("brandHero", "creativesHeader")}
        subtitle={t("brandHero", "creativesSubtitle")}
        tone="info"
        defaultOpen={true}
        persistKey={`brand-${competitorId}:creatives`}
      >
        {filtersNode}
      </CollapsibleSectionCard>

      {/* ─── Risultati — output filtrato.
          Stesso pattern visivo di Creativita ma tone neutral. Le
          grids (Meta/Google/IG/TT/SN/YT/SERP/Maps) vivono qui dentro
          come da feedback utente: "il riquadro Creativita finisce
          prima dei Risultati, e Risultati devono stare fuori dal
          riquadro filtri". */}
      <CollapsibleSectionCard
        icon={<LayoutGrid className="size-5" />}
        title={t("competitors", "resultsHeader")}
        subtitle={t("competitors", "resultsSubtitle")}
        tone="neutral"
        defaultOpen={true}
        persistKey={`brand-${competitorId}:results`}
      >
        <div className="space-y-5">

      {/* ─── Ads section ─── */}
      {channel === "all" ? (
        <>
          {/* All: grouped by channel. The (X of Y) suffix tells the
              user that the grid is a recent slice — Y is the real DB
              total, X is the loaded sample (capped at 30). */}
          {metaAds.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <MetaIcon className="size-4" colored />
                  <p className="text-sm font-medium">Meta Ads</p>
                  <span className="text-xs text-muted-foreground">
                    ({metaAds.length}
                    {filteredTotals.meta > metaAds.length
                      ? ` ${t("competitors", "ofTotal")} ${filteredTotals.meta}`
                      : ""}
                    )
                  </span>
                  {compareTotals && (
                    <span className="inline-flex items-center gap-1.5">
                      <DeltaPill
                        delta={pctDelta(filteredTotals.meta, compareTotals.meta)}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        vs {compareTotals.meta} {t("competitors", "comparePrev")}
                      </span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {AI_TAGS_ENABLED && <TagButton competitorId={competitorId} />}
                  <a
                    href={`/api/export/ads.csv?competitor_id=${competitorId}`}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Download className="size-3" />
                    {t("competitors", "exportCsv")}
                  </a>
                </div>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {metaAds.map((ad) => (
                  <AdCard key={ad.id} ad={ad} competitorId={competitorId} />
                ))}
              </div>
              {filteredTotals.meta > metaAds.length && (
                <div className="flex justify-center pt-3 print:hidden">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => loadMore("meta")}
                    disabled={loadingMore !== null}
                    className="gap-2 cursor-pointer min-w-[240px] h-12 text-sm font-medium"
                  >
                    {loadingMore === "meta" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {t("competitors", "loadingMore")}
                      </>
                    ) : (
                      `${t("competitors", "loadMore")} (${filteredTotals.meta - metaAds.length})`
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {googleAds.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <GoogleIcon className="size-4" colored />
                <p className="text-sm font-medium">Google Ads</p>
                <span className="text-xs text-muted-foreground">
                  ({googleAds.length}
                  {filteredTotals.google > googleAds.length
                    ? ` ${t("competitors", "ofTotal")} ${filteredTotals.google}`
                    : ""}
                  )
                </span>
                {compareTotals && (
                  <span className="inline-flex items-center gap-1.5">
                    <DeltaPill
                      delta={pctDelta(filteredTotals.google, compareTotals.google)}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      vs {compareTotals.google} {t("competitors", "comparePrev")}
                    </span>
                  </span>
                )}
                <InfoPopover
                  ariaLabel="Google Ads count"
                  content={
                    <div className="space-y-2">
                      <p className="font-semibold text-foreground">
                        {t("benchmarks", "googleCountDiffTitle")}
                      </p>
                      <p>{t("benchmarks", "googleCountDiffBody1")}</p>
                      <p>{t("benchmarks", "googleCountDiffBody2")}</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>{t("benchmarks", "googleCountDiffBullet1")}</li>
                        <li>{t("benchmarks", "googleCountDiffBullet2")}</li>
                      </ul>
                      <p className="text-muted-foreground">
                        {t("benchmarks", "googleCountDiffBody3")}
                      </p>
                    </div>
                  }
                />
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {googleAds.map((ad) => (
                  <AdCard key={ad.id} ad={ad} competitorId={competitorId} />
                ))}
              </div>
              {filteredTotals.google > googleAds.length && (
                <div className="flex justify-center pt-3 print:hidden">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => loadMore("google")}
                    disabled={loadingMore !== null}
                    className="gap-2 cursor-pointer min-w-[240px] h-12 text-sm font-medium"
                  >
                    {loadingMore === "google" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {t("competitors", "loadingMore")}
                      </>
                    ) : (
                      `${t("competitors", "loadMore")} (${filteredTotals.google - googleAds.length})`
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Filtered: single channel */}
          {(channel === "meta" || channel === "google") && visibleAds.length > 0 && (
            <div className="space-y-4">
              {/* Channel cover band — gradient with the channel's
                  brand colour + the brand identity overlaid. Same
                  visual treatment as the YouTube banner so every
                  channel section opens with a recognisable header. */}
              <div className="rounded-xl overflow-hidden border border-border">
                <ChannelCoverBand
                  channel={channel}
                  brandName={brand.name}
                  brandAvatar={brand.avatar}
                  brandHandle={
                    channel === "google"
                      ? brand.googleDomain ?? undefined
                      : undefined
                  }
                  caption={`${(channel === "meta" ? filteredTotals.meta : filteredTotals.google).toLocaleString()} ads`}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  <span>
                    {visibleAds.length}
                    {(() => {
                      const total =
                        channel === "meta" ? filteredTotals.meta : filteredTotals.google;
                      return total > visibleAds.length
                        ? ` ${t("competitors", "ofTotal")} ${total}`
                        : "";
                    })()}
                    {" "}ads
                  </span>
                  {compareTotals && (
                    <span className="inline-flex items-center gap-1.5">
                      <DeltaPill
                        delta={pctDelta(
                          channel === "meta" ? filteredTotals.meta : filteredTotals.google,
                          channel === "meta" ? compareTotals.meta : compareTotals.google,
                        )}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        vs{" "}
                        {channel === "meta" ? compareTotals.meta : compareTotals.google}{" "}
                        {t("competitors", "comparePrev")}
                      </span>
                    </span>
                  )}
                  {channel === "google" && (
                    <InfoPopover
                      ariaLabel="Google Ads count"
                      content={
                        <div className="space-y-2">
                          <p className="font-semibold text-foreground">
                            {t("benchmarks", "googleCountDiffTitle")}
                          </p>
                          <p>{t("benchmarks", "googleCountDiffBody1")}</p>
                          <p>{t("benchmarks", "googleCountDiffBody2")}</p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>{t("benchmarks", "googleCountDiffBullet1")}</li>
                            <li>{t("benchmarks", "googleCountDiffBullet2")}</li>
                          </ul>
                          <p className="text-muted-foreground">
                            {t("benchmarks", "googleCountDiffBody3")}
                          </p>
                        </div>
                      }
                    />
                  )}
                </p>
                <div className="flex items-center gap-3">
                  {AI_TAGS_ENABLED && <TagButton competitorId={competitorId} />}
                  <a
                    href={`/api/export/ads.csv?competitor_id=${competitorId}`}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Download className="size-3" />
                    {t("competitors", "exportCsv")}
                  </a>
                </div>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleAds.map((ad) => (
                  <AdCard key={ad.id} ad={ad} competitorId={competitorId} />
                ))}
              </div>
              {(() => {
                if (channel !== "meta" && channel !== "google") return null;
                const total =
                  channel === "meta" ? filteredTotals.meta : filteredTotals.google;
                if (total <= visibleAds.length) return null;
                const remaining = total - visibleAds.length;
                return (
                  <div className="flex justify-center pt-3 print:hidden">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => loadMore(channel)}
                      disabled={loadingMore !== null}
                      className="gap-2 cursor-pointer min-w-[240px] h-12 text-sm font-medium"
                    >
                      {loadingMore === channel ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t("competitors", "loadingMore")}
                        </>
                      ) : (
                        `${t("competitors", "loadMore")} (${remaining})`
                      )}
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Empty state for single channel */}
          {(channel === "meta" || channel === "google") && visibleAds.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                {channel === "meta" ? t("competitors", "noMetaAds") : t("competitors", "noGoogleAds")}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ─── Instagram section ─── */}
      {showInstagram && (
        <div className="space-y-4">
          {/* Channel cover band — only on the focused IG view, not on
              "all" (where the inline channel divider already does the
              section break). Caption ora include follower count (se
              disponibile dallo scan profilo IG) + numero post totali.
              Followers e' il segnale piu' rilevante per posizionare il
              brand sul canale organico — appare per primo. */}
          {channel === "instagram" && (
            <div className="rounded-xl overflow-hidden border border-border">
              <ChannelCoverBand
                channel="instagram"
                brandName={brand.name}
                brandAvatar={brand.avatar}
                brandHandle={
                  brand.instagramUsername
                    ? brand.instagramProfile?.verified
                      ? `@${brand.instagramUsername} ✓`
                      : `@${brand.instagramUsername}`
                    : undefined
                }
                caption={(() => {
                  const parts: string[] = [];
                  const f = brand.instagramProfile?.followersCount;
                  if (typeof f === "number") {
                    parts.push(
                      `${formatNumber(f)} ${t("organic", "followers")}`,
                    );
                  }
                  parts.push(
                    `${channelTotals.instagram.toLocaleString()} ${t("organic", "totalPosts")}`,
                  );
                  return parts.join(" · ");
                })()}
              />
            </div>
          )}
          {/* Engagement stats — follower count come PRIMA tile cosi
              domina visivamente (e il post-volume scende a secondo). */}
          {organicStats.count > 0 && channel === "instagram" && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {typeof brand.instagramProfile?.followersCount === "number" && (
                <Card>
                  <CardContent className="py-4 text-center">
                    <p className="text-2xl font-semibold">
                      {formatNumber(brand.instagramProfile.followersCount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("organic", "followers")}
                    </p>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {channelTotals.instagram}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("organic", "totalPosts")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {organicStats.avgLikes != null ? formatNumber(organicStats.avgLikes) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("organic", "avgLikes")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {organicStats.avgComments != null ? formatNumber(organicStats.avgComments) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("organic", "avgComments")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">{formatNumber(organicStats.totalViews)}</p>
                  <p className="text-xs text-muted-foreground">{t("organic", "totalViews")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">{igCollabPosts}</p>
                  <p className="text-xs text-muted-foreground">{t("organic", "collabPosts")}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {visibleOrganic.length === 0 ? (
            channel === "instagram" && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  {t("organic", "noPostsYet")}
                </CardContent>
              </Card>
            )
          ) : (
            <>
              {/* Section header on the all-tab so the user can tell
                  these cards are Instagram posts, not "more ads
                  that loaded by themselves". Same grammar as the
                  Meta/Google headers above so the rhythm matches. */}
              {channel === "all" && (
                <div className="flex items-center gap-2 pt-4 border-t border-border">
                  <InstagramIcon className="size-4" colored />
                  <p className="text-sm font-medium">Instagram</p>
                  <span className="text-xs text-muted-foreground">
                    ({visibleOrganic.length}
                    {channelTotals.instagram > visibleOrganic.length
                      ? ` ${t("competitors", "ofTotal")} ${channelTotals.instagram}`
                      : ""}
                    )
                  </span>
                </div>
              )}
              {channel === "instagram" && (
                <p className="text-sm text-muted-foreground">
                  {visibleOrganic.length}
                  {channelTotals.instagram > visibleOrganic.length
                    ? ` ${t("competitors", "ofTotal")} ${channelTotals.instagram}`
                    : ""}
                  {" "}{t("organic", "postsCount")}
                </p>
              )}
              {channel === "instagram" && igCollaborators.length > 0 && (
                <TopCollaboratorsPanel
                  collaborators={igCollaborators}
                  totalCollabPosts={igCollabPosts}
                  totalPosts={organicCollabPool.length}
                />
              )}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleOrganic.map((post) => (
                  <OrganicPostCard
                    key={post.id}
                    post={post}
                    selfHandle={brand.instagramUsername}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── TikTok section ─── */}
      {showTiktok && (
        <div className="space-y-4">
          {channel === "tiktok" && (
            <div className="rounded-xl overflow-hidden border border-border">
              <ChannelCoverBand
                channel="tiktok"
                brandName={brand.name}
                brandAvatar={brand.avatar}
                brandHandle={brand.tiktokUsername ? `@${brand.tiktokUsername}` : undefined}
                caption={`${channelTotals.tiktok.toLocaleString()} ${t("organic", "totalPosts")}`}
              />
            </div>
          )}
          {tiktokStats.count > 0 && channel === "tiktok" && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {channelTotals.tiktok}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("organic", "totalPosts")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {tiktokStats.avgLikes != null ? formatNumber(tiktokStats.avgLikes) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("organic", "avgLikes")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">
                    {tiktokStats.avgComments != null ? formatNumber(tiktokStats.avgComments) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("organic", "avgComments")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">{formatNumber(tiktokStats.totalViews)}</p>
                  <p className="text-xs text-muted-foreground">{t("organic", "totalViews")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-semibold">{ttCollabPosts}</p>
                  <p className="text-xs text-muted-foreground">{t("organic", "collabPosts")}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Paid TikTok Ads (DSA + CC) — only on the focused TikTok
              tab so the "all" view doesn't double up on the channel
              divider. Renders nothing when zero ads collected so a
              brand without paid scans doesn't see an empty section. */}
          {channel === "tiktok" && tiktokAds.length > 0 && (
            <div className="space-y-3 pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <TikTokIcon className="size-4" colored />
                <h3 className="text-sm font-semibold">
                  {t("tiktokAds", "title")}
                </h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {tiktokAds.length} ads
                </span>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {tiktokAds.map((a) => (
                  <TiktokAdCard key={a.id} ad={a} />
                ))}
              </div>
            </div>
          )}

          {visibleTiktok.length === 0 ? (
            channel === "tiktok" && tiktokAds.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  {t("organic", "noPostsYet")}
                </CardContent>
              </Card>
            )
          ) : (
            <>
              {channel === "all" && (
                <div className="flex items-center gap-2 pt-4 border-t border-border">
                  <TikTokIcon className="size-4" colored />
                  <p className="text-sm font-medium">TikTok</p>
                  <span className="text-xs text-muted-foreground">
                    ({visibleTiktok.length}
                    {channelTotals.tiktok > visibleTiktok.length
                      ? ` ${t("competitors", "ofTotal")} ${channelTotals.tiktok}`
                      : ""}
                    )
                  </span>
                </div>
              )}
              {channel === "tiktok" && (
                <p className="text-sm text-muted-foreground">
                  {visibleTiktok.length}
                  {channelTotals.tiktok > visibleTiktok.length
                    ? ` ${t("competitors", "ofTotal")} ${channelTotals.tiktok}`
                    : ""}
                  {" "}{t("organic", "postsCount")}
                </p>
              )}
              {channel === "tiktok" && ttCollaborators.length > 0 && (
                <TopCollaboratorsPanel
                  collaborators={ttCollaborators}
                  totalCollabPosts={ttCollabPosts}
                  totalPosts={tiktokCollabPool.length}
                />
              )}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleTiktok.map((post) => (
                  <TikTokPostCard
                    key={post.id}
                    post={post}
                    selfHandle={brand.tiktokUsername}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Snapchat section ─── */}
      {showSnapchat && (
        <div className="space-y-4">
          {/* Paid Snapchat ads block — sits ABOVE the organic snapshot
              (same pattern as TikTok Ads above TikTok organic posts).
              Hidden in the all-tab to keep that surface compact;
              revealed only on the dedicated Snapchat tab. */}
          {channel === "snapchat" && snapchatAds.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {t("snapchatAds", "title")}
                </p>
                <span className="text-xs text-muted-foreground">
                  {snapchatAds.length} ads
                </span>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {snapchatAds.map((a) => (
                  <SnapchatAdCard key={a.id} ad={a} />
                ))}
              </div>
              {/* Coverage notice — Snap's API exposes only EU ads from
                  the last 12 months. Said upfront so a user scanning
                  a US-focused brand doesn't read the empty result as
                  a bug. */}
              <p className="text-[11px] text-muted-foreground italic">
                {t("snapchatAds", "coverageNote")}
              </p>
            </div>
          )}
          {latestSnapchat ? (
            <>
              {channel === "all" && (
                <div className="flex items-center gap-2 pt-4 border-t border-border">
                  <SnapchatIcon className="size-4" colored />
                  <p className="text-sm font-medium">Snapchat</p>
                  <span className="text-xs text-muted-foreground">
                    ({t("snapchat", "latestSnapshot")})
                  </span>
                </div>
              )}
              {channel === "snapchat" && (
                <p className="text-sm text-muted-foreground">
                  {t("snapchat", "latestSnapshot")}
                </p>
              )}
              <SnapchatProfileCard profile={latestSnapchat} />

              {/* Trend list — snapshots #2..N. Compact rows, just the
                  date + spotlight/highlight/lens deltas, so the user
                  can see how the brand grew across scans. Hidden in
                  the all-tab to keep the surface small. */}
              {channel === "snapchat" && visibleSnapchat.length > 1 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                    {t("snapchat", "snapshotHistory")}
                  </p>
                  <div className="rounded-lg border border-border bg-muted/20 divide-y divide-border">
                    {visibleSnapchat.slice(1).map((s, i) => {
                      const next = visibleSnapchat[i]; // newer one
                      const dSpot = s.spotlight_count - next.spotlight_count;
                      const dHl = s.highlight_count - next.highlight_count;
                      const dLens = s.lens_count - next.lens_count;
                      const fmt = (n: number) =>
                        n === 0 ? "·" : n > 0 ? `+${formatNumber(n)}` : formatNumber(n);
                      return (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-4 px-4 py-2 text-xs"
                        >
                          <span className="text-muted-foreground tabular-nums">
                            {new Date(s.scraped_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                          <div className="flex items-center gap-4 tabular-nums">
                            <span>
                              {t("snapchat", "spotlightCount")}: <b>{formatNumber(s.spotlight_count)}</b>{" "}
                              <span className="text-muted-foreground">({fmt(-dSpot)})</span>
                            </span>
                            <span>
                              {t("snapchat", "highlightCount")}: <b>{formatNumber(s.highlight_count)}</b>{" "}
                              <span className="text-muted-foreground">({fmt(-dHl)})</span>
                            </span>
                            <span>
                              {t("snapchat", "lensCount")}: <b>{formatNumber(s.lens_count)}</b>{" "}
                              <span className="text-muted-foreground">({fmt(-dLens)})</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {channel === "snapchat" && visibleSnapchat.length === 1 && (
                <p className="text-xs text-muted-foreground italic">
                  {t("snapchat", "trendNoteSingle")}
                </p>
              )}
            </>
          ) : (
            // Empty state only when BOTH organic and paid surfaces are
            // empty — having paid ads but no profile snapshot is a
            // legitimate state (the user ran Snapchat Ads scan but
            // never the organic profile scan), so don't drown the
            // ads block with a "no data" card on top.
            channel === "snapchat" && snapchatAds.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  {t("snapchat", "noSnapshotYet")}
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}

      {/* ─── YouTube section ─── */}
      {showYoutube && (
        <div className="space-y-4">
          {latestYoutubeChannel ? (
            <>
              {channel === "all" && (
                <div className="flex items-center gap-2 pt-4 border-t border-border">
                  <YouTubeIcon className="size-4" colored />
                  <p className="text-sm font-medium">YouTube</p>
                  <span className="text-xs text-muted-foreground">
                    ({t("youtube", "latestSnapshot")})
                  </span>
                </div>
              )}

              <YoutubeChannelCard channel={latestYoutubeChannel} />

              {channel === "youtube" && youtubeStats.count > 0 && (
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                  <Card>
                    <CardContent className="py-4 text-center">
                      <p className="text-2xl font-semibold">
                        {channelTotals.youtube}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("organic", "totalPosts")}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4 text-center">
                      <p className="text-2xl font-semibold">
                        {youtubeStats.avgLikes != null ? formatNumber(youtubeStats.avgLikes) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("organic", "avgLikes")}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4 text-center">
                      <p className="text-2xl font-semibold">
                        {youtubeStats.avgComments != null ? formatNumber(youtubeStats.avgComments) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("organic", "avgComments")}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4 text-center">
                      <p className="text-2xl font-semibold">{formatNumber(youtubeStats.totalViews)}</p>
                      <p className="text-xs text-muted-foreground">{t("organic", "totalViews")}</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {visibleYoutubeVideos.length > 0 && (
                <>
                  {channel === "youtube" && (
                    <p className="text-sm text-muted-foreground">
                      {visibleYoutubeVideos.length}
                      {channelTotals.youtube > visibleYoutubeVideos.length
                        ? ` ${t("competitors", "ofTotal")} ${channelTotals.youtube}`
                        : ""}
                      {" "}{t("organic", "postsCount")}
                    </p>
                  )}
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visibleYoutubeVideos.map((v) => (
                      <YoutubeVideoCard key={v.id} video={v} />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            channel === "youtube" && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  {t("youtube", "noVideosYet")}
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}

      {/* ─── SERP brand-rank section ──────────────────────── */}
      {/* Maps placeholder: brand-detail aggregation non implementata.
          Cover band + card descrittiva con CTA verso la sezione
          workspace-level /maps dove l'utente puo' gestire i POI. */}
      {channel === "maps" && (
        <div className="space-y-4">
          <div className="rounded-xl overflow-hidden border border-border">
            <ChannelCoverBand
              channel="maps"
              brandName={brand.name}
              brandHandle={brand.googleDomain ?? undefined}
              caption=""
            />
          </div>
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <div className="size-12 rounded-full bg-info-soft tone-info grid place-items-center mx-auto">
                <MapPin className="size-5" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("competitors", "mapsComingSoon")}
              </p>
              <Link
                href="/maps"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 h-8 text-xs hover:border-gold/40 hover:text-gold transition-colors cursor-pointer"
              >
                <MapPin className="size-3.5" />
                Google Maps
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {showSerp && (
        <div className="space-y-4">
          <div className="rounded-xl overflow-hidden border border-border">
            <ChannelCoverBand
              channel="serp"
              brandName={brand.name}
              brandHandle={brand.googleDomain ?? undefined}
              caption={`${visibleSerpQueries.length} ${visibleSerpQueries.length === 1 ? t("brandSerp", "querySingular") : t("brandSerp", "queryPlural")}`}
            />
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {visibleSerpQueries.length}{" "}
              {visibleSerpQueries.length === 1
                ? t("brandSerp", "querySingular")
                : t("brandSerp", "queryPlural")}
              {googleDomain && (
                <>
                  {" — "}
                  <span className="text-foreground/80">
                    {t("brandSerp", "matchingDomain")} {googleDomain}
                  </span>
                </>
              )}
            </p>
            {/* New-query CTA — navigates to the workspace SERP page
                with brandId + new=1 so the create form opens with
                this brand pre-attached. Same data model on both
                surfaces, single create flow to maintain. */}
            <Link
              href={`/serp?brandId=${competitorId}&new=1`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 h-8 text-xs hover:border-gold/40 hover:text-gold transition-colors"
            >
              <SearchIcon className="size-3.5" />
              {t("brandSerp", "createForBrand")}
            </Link>
          </div>
          {visibleSerpQueries.length > 0 ? (
            <div className="space-y-3">
              {visibleSerpQueries.map((q) => (
                <BrandSerpRankCard key={q.query_id} rank={q} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                {t("brandSerp", "noLinkedYet")}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Empty state for "all" when nothing exists */}
      {channel === "all" &&
        ads.length === 0 &&
        organicPosts.length === 0 &&
        tiktokPosts.length === 0 &&
        snapchatProfiles.length === 0 &&
        snapchatAds.length === 0 &&
        youtubeChannels.length === 0 &&
        youtubeVideos.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              {t("competitors", "noAdsCollected")}
            </CardContent>
          </Card>
        )}
        </div>
      </CollapsibleSectionCard>
    </div>
  );
}
