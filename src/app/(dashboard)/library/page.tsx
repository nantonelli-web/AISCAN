import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { LibraryFilters } from "./filters";
import { LibraryItemsView } from "./library-items-view";
import { getLocale, serverT } from "@/lib/i18n/server";
import { PrintButton } from "@/components/ui/print-button";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { getCompetitors } from "@/lib/library/cached-data";
import { buildLibraryQuery } from "@/lib/library/build-query";
import type {
  MaitAdExternal,
  MaitOrganicPost,
  MaitTikTokPost,
  MaitSnapchatProfile,
  MaitYoutubeVideo,
  MaitClient,
} from "@/types";

export const dynamic = "force-dynamic";

// Initial page size restored to 120 (was briefly 60 during the
// Load More refactor — the user reported the count drop as
// confusing). 120 matches the historical default; subsequent
// Load More calls fetch +120 each.
const PAGE_SIZE = 120;

interface SearchParams {
  q?: string;
  platform?: string;
  cta?: string;
  status?: string;
  format?: string;
  channel?: string;
  brand?: string;
  client?: string;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const isInstagram = sp.channel === "instagram";
  const isTiktok = sp.channel === "tiktok";
  const isSnapchat = sp.channel === "snapchat";
  const isYoutube = sp.channel === "youtube";
  const workspaceId = profile.workspace_id!;
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

  // Initial page = first PAGE_SIZE rows. The LibraryItemsView
  // client island fetches subsequent pages from /api/library/items
  // when the user clicks Load More.
  const { data: contentData } = await buildLibraryQuery(supabase, {
    workspaceId,
    channel: sp.channel,
    brand: sp.brand,
    projectBrandIds,
    q: sp.q,
    format: sp.format,
    platform: sp.platform,
    cta: sp.cta,
    status: sp.status,
    offset: 0,
    limit: PAGE_SIZE,
  });

  const initialList = (contentData ?? []) as unknown[];
  const initialHasMore = initialList.length === PAGE_SIZE;

  // Brand attribution: when no single brand is selected, the
  // grid mixes items from many brands and the user needs to
  // know which brand each card belongs to.
  const showBrandLabel = !sp.brand;
  const brandNameById = Object.fromEntries(
    competitors.map((c) => [c.id, c.page_name]),
  );

  // Source-section split for ads (when no channel filter).
  const showSourceSections =
    !sp.channel && !isInstagram && !isTiktok && !isSnapchat && !isYoutube;

  // Pick the correct discriminant for the LibraryItemsView seed.
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
          initial={initial}
          initialHasMore={initialHasMore}
          pageSize={PAGE_SIZE}
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
