import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdCard } from "@/components/ads/ad-card";
import { TiktokAdCard } from "@/components/ads/tiktok-ad-card";
import { SnapchatAdCard } from "@/components/ads/snapchat-ad-card";
import { OrganicPostCard } from "@/components/organic/organic-post-card";
import { TikTokPostCard } from "@/components/organic/tiktok-post-card";
import { SnapchatProfileCard } from "@/components/organic/snapchat-profile-card";
import { YoutubeVideoCard } from "@/components/organic/youtube-video-card";
import { Card, CardContent } from "@/components/ui/card";
import { getLocale, serverT } from "@/lib/i18n/server";
import {
  COLLECTION_ITEM_TABLE,
  type CollectionItemType,
} from "@/lib/collections/item-types";
import type {
  MaitAdExternal,
  MaitOrganicPost,
  MaitTikTokPost,
  MaitSnapchatProfile,
  MaitYoutubeVideo,
} from "@/types";
import type { MaitTiktokAd } from "@/types/tiktok-ads";
import type { MaitSnapchatAd } from "@/types/snapchat-ads";

export const dynamic = "force-dynamic";

type Row = { id: string } & Record<string, unknown>;

/** Renderizza la card giusta per ogni tipo di item della collezione. */
function renderItem(type: CollectionItemType, row: Row) {
  switch (type) {
    case "ad":
      return <AdCard ad={row as unknown as MaitAdExternal} />;
    case "tiktok_ad":
      return <TiktokAdCard ad={row as unknown as MaitTiktokAd} />;
    case "snapchat_ad":
      return <SnapchatAdCard ad={row as unknown as MaitSnapchatAd} />;
    case "instagram_post":
      return <OrganicPostCard post={row as unknown as MaitOrganicPost} />;
    case "tiktok_post":
      return <TikTokPostCard post={row as unknown as MaitTikTokPost} />;
    case "snapchat_profile":
      return <SnapchatProfileCard profile={row as unknown as MaitSnapchatProfile} />;
    case "youtube_video":
      return <YoutubeVideoCard video={row as unknown as MaitYoutubeVideo} />;
  }
}

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getSessionUser();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const { data: collection } = await admin
    .from("mait_collections")
    .select("id, name, description")
    .eq("id", id)
    .single();
  if (!collection) notFound();

  // Item polimorfici (ads + organic, tutti i canali), piu' recenti prima.
  const { data: itemRows } = await admin
    .from("mait_collection_items")
    .select("item_type, item_id, created_at")
    .eq("collection_id", id)
    .order("created_at", { ascending: false });
  const items = (itemRows ?? []) as {
    item_type: CollectionItemType;
    item_id: string;
    created_at: string;
  }[];

  // Raggruppa gli id per tipo e fai UNA query per tabella.
  const idsByType = new Map<CollectionItemType, string[]>();
  for (const it of items) {
    const arr = idsByType.get(it.item_type) ?? [];
    arr.push(it.item_id);
    idsByType.set(it.item_type, arr);
  }
  const rowsByKey = new Map<string, Row>(); // key = `${type}:${id}`
  await Promise.all(
    [...idsByType.entries()].map(async ([type, ids]) => {
      const { data } = await admin
        .from(COLLECTION_ITEM_TABLE[type])
        .select("*")
        .in("id", ids);
      for (const r of (data ?? []) as Row[]) {
        rowsByKey.set(`${type}:${r.id}`, r);
      }
    }),
  );

  // Ricostruisci nell'ordine di salvataggio, scartando eventuali orfani
  // (riga sorgente cancellata da un re-scan / pulizia).
  const ordered = items
    .map((it) => ({
      type: it.item_type,
      row: rowsByKey.get(`${it.item_type}:${it.item_id}`),
    }))
    .filter((x): x is { type: CollectionItemType; row: Row } => !!x.row);

  return (
    <div className="space-y-6">
      <Link
        href="/library?tab=collections"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("collections", "allCollections")}
      </Link>

      <div>
        <h1 className="text-2xl font-serif tracking-tight">
          {collection.name}
        </h1>
        {collection.description && (
          <p className="text-sm text-muted-foreground mt-1">
            {collection.description}
          </p>
        )}
      </div>

      {ordered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("collections", "noAdsInCollection")}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {ordered.length} {t("collections", "itemsLabel")}
          </p>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ordered.map(({ type, row }) => (
              <div key={`${type}:${row.id}`}>{renderItem(type, row)}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
