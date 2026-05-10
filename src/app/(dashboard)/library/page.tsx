import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { LibraryFilters } from "./filters";
import { LibraryItemsView } from "./library-items-view";
import { CollectionsTab } from "./collections-tab";
import { getLocale, serverT } from "@/lib/i18n/server";
import { PrintButton } from "@/components/ui/print-button";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { getCompetitors } from "@/lib/library/cached-data";
import { buildLibraryQuery, buildLibraryCountQuery } from "@/lib/library/build-query";
import { Library as LibraryIcon, FolderHeart } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  MaitAdExternal,
  MaitOrganicPost,
  MaitTikTokPost,
  MaitSnapchatProfile,
  MaitYoutubeVideo,
  MaitClient,
} from "@/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

interface SearchParams {
  q?: string;
  platform?: string;
  cta?: string;
  status?: string;
  format?: string;
  channel?: string;
  brand?: string;
  client?: string;
  collab?: string;
  /** "ads" (default) | "collections". Comanda quale tab e' attiva. */
  tab?: string;
}

type TabKey = "ads" | "collections";

function parseTab(raw: string | undefined): TabKey {
  return raw === "collections" ? "collections" : "ads";
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const { profile } = await getSessionUser();
  const workspaceId = profile.workspace_id!;
  const locale = await getLocale();
  const t = serverT(locale);

  // Tab switcher (sempre visibile in cima)
  const tabSwitcher = (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1 print:hidden">
      <Link
        href={{ pathname: "/library", query: { tab: "ads" } }}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors",
          tab === "ads"
            ? "bg-gold text-gold-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted",
        )}
      >
        <LibraryIcon className="size-3.5" />
        {t("library", "tabAds")}
      </Link>
      <Link
        href={{ pathname: "/library", query: { tab: "collections" } }}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors",
          tab === "collections"
            ? "bg-gold text-gold-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted",
        )}
      >
        <FolderHeart className="size-3.5" />
        {t("library", "tabCollections")}
      </Link>
    </div>
  );

  // ─── Tab COLLECTIONS ────────────────────────────────
  if (tab === "collections") {
    return (
      <div className="space-y-6">
        <DynamicBackLink fallbackHref="/brands" label={t("library", "backLabel")} />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-serif tracking-tight">
              {t("library", "title")}
            </h1>
            <p className="text-sm text-muted-foreground text-pretty">
              {t("library", "subtitle")}
            </p>
          </div>
          <PrintButton label={t("common", "print")} variant="outline" />
        </div>
        {tabSwitcher}
        <CollectionsTab workspaceId={workspaceId} t={t} />
      </div>
    );
  }

  // ─── Tab ADS (default) ──────────────────────────────
  const supabase = await createClient();
  const isInstagram = sp.channel === "instagram";
  const isTiktok = sp.channel === "tiktok";
  const isSnapchat = sp.channel === "snapchat";
  const isYoutube = sp.channel === "youtube";
  const admin = createAdminClient();

  const [competitors, { data: clientsData }] = await Promise.all([
    getCompetitors(workspaceId),
    admin
      .from("mait_clients")
      .select("id, name, color, workspace_id")
      .eq("workspace_id", workspaceId)
      .order("name"),
  ]);

  const clients = (clientsData ?? []) as MaitClient[];
  const projectBrandIds: string[] | null = sp.client
    ? competitors
        .filter((c) =>
          sp.client === "unassigned"
            ? c.client_id === null
            : c.client_id === sp.client,
        )
        .map((c) => c.id)
    : null;

  const filterArgs = {
    workspaceId,
    channel: sp.channel,
    brand: sp.brand,
    projectBrandIds,
    q: sp.q,
    format: sp.format,
    platform: sp.platform,
    cta: sp.cta,
    status: sp.status,
    collab: sp.collab === "1",
  };
  const [{ data: contentData }, { count: totalCount }] = await Promise.all([
    buildLibraryQuery(supabase, { ...filterArgs, offset: 0, limit: PAGE_SIZE }),
    buildLibraryCountQuery(supabase, filterArgs),
  ]);

  const initialList = (contentData ?? []) as unknown[];
  const totalAvailable = totalCount ?? initialList.length;
  const initialHasMore = initialList.length < totalAvailable;

  const showBrandLabel = !sp.brand;
  const brandNameById = Object.fromEntries(
    competitors.map((c) => [c.id, c.page_name]),
  );

  const showSourceSections =
    !sp.channel && !isInstagram && !isTiktok && !isSnapchat && !isYoutube;

  const initial = (() => {
    if (isInstagram)
      return { kind: "instagram" as const, items: initialList as MaitOrganicPost[] };
    if (isTiktok)
      return { kind: "tiktok" as const, items: initialList as MaitTikTokPost[] };
    if (isSnapchat)
      return { kind: "snapchat" as const, items: initialList as MaitSnapchatProfile[] };
    if (isYoutube)
      return { kind: "youtube" as const, items: initialList as MaitYoutubeVideo[] };
    return { kind: "ads" as const, items: initialList as MaitAdExternal[] };
  })();

  return (
    <div className="space-y-6">
      <DynamicBackLink fallbackHref="/brands" label={t("library", "backLabel")} />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-serif tracking-tight">
            {t("library", "title")}
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {t("library", "subtitle")}
          </p>
        </div>
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>

      {tabSwitcher}

      <div className="print:hidden">
        <LibraryFilters
          initial={sp}
          competitors={competitors}
          clients={clients}
        />
      </div>

      {initialList.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("library", "noAdsFiltered")}
          </CardContent>
        </Card>
      ) : (
        <LibraryItemsView
          key={`${sp.channel ?? "all"}|${sp.brand ?? ""}|${sp.client ?? ""}|${sp.q ?? ""}|${sp.platform ?? ""}|${sp.cta ?? ""}|${sp.status ?? ""}|${sp.format ?? ""}|${sp.collab ?? ""}`}
          initial={initial}
          initialHasMore={initialHasMore}
          pageSize={PAGE_SIZE}
          totalCount={totalAvailable}
          searchParams={sp}
          brandNameById={brandNameById}
          showBrandLabel={showBrandLabel}
          showSourceSections={showSourceSections}
        />
      )}

      <div className="flex justify-center pt-4 print:hidden">
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>
    </div>
  );
}
