import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdCard } from "@/components/ads/ad-card";
import { Card, CardContent } from "@/components/ui/card";
import { getLocale, serverT } from "@/lib/i18n/server";
import type { MaitAdExternal } from "@/types";

export const dynamic = "force-dynamic";

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

  // Get ads in this collection
  const { data: links } = await admin
    .from("mait_collection_ads")
    .select("ad_id")
    .eq("collection_id", id);

  const adIds = (links ?? []).map((l) => l.ad_id);

  let ads: MaitAdExternal[] = [];
  if (adIds.length > 0) {
    const { data } = await admin
      .from("mait_ads_external")
      .select("*")
      .in("id", adIds);
    ads = (data ?? []) as MaitAdExternal[];
  }

  return (
    <div className="space-y-6">
      <Link
        href="/collections"
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

      {ads.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("collections", "noAdsInCollection")}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{ads.length} ads</p>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ads.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
