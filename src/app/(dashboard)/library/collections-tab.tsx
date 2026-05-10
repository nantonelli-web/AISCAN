/**
 * Tab "Le mie collezioni" della pagina Library.
 * Riusa la lista collezioni che prima viveva in /collections.
 * Server component — fa la query e rende la grid.
 */

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderHeart } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";

export async function CollectionsTab({
  workspaceId,
  t,
}: {
  workspaceId: string;
  t: (ns: string, k: string) => string;
}) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mait_collections")
    .select("id, name, description, created_at, mait_collection_ads(count)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const collections = (data ?? []).map((c) => ({
    ...c,
    adCount:
      (c.mait_collection_ads as unknown as { count: number }[])?.[0]?.count ??
      0,
  }));

  if (collections.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <FolderHeart className="size-8 mx-auto mb-3 text-muted-foreground/50" />
          <p>{t("collections", "noCollections")}</p>
          <p className="text-xs mt-1">{t("collections", "noCollectionsHint")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {collections.map((c) => (
        <Link key={c.id} href={`/collections/${c.id}`}>
          <Card className="hover:border-gold/50 transition-colors h-full">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{c.name}</h3>
                  {c.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {c.description}
                    </p>
                  )}
                </div>
                <Badge variant="gold">{c.adCount} ads</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {t("collections", "createdOn")} {formatDate(c.created_at)}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
