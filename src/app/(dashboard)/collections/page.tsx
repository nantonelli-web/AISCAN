import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderHeart } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { getLocale, serverT } from "@/lib/i18n/server";
import { PrintButton } from "@/components/ui/print-button";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const { profile } = await getSessionUser();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const { data } = await admin
    .from("mait_collections")
    .select("id, name, description, created_at, mait_collection_ads(count)")
    .eq("workspace_id", profile.workspace_id!)
    .order("created_at", { ascending: false });

  const collections = (data ?? []).map((c) => ({
    ...c,
    adCount: (c.mait_collection_ads as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));

  return (
    <div className="space-y-6">
      <DynamicBackLink fallbackHref="/dashboard" label={t("common", "backToDashboard")} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">{t("collections", "title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("collections", "subtitle")}
          </p>
        </div>
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>

      {collections.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <FolderHeart className="size-8 mx-auto mb-3 text-muted-foreground/50" />
            <p>{t("collections", "noCollections")}</p>
            <p className="text-xs mt-1">
              {t("collections", "noCollectionsHint")}
            </p>
          </CardContent>
        </Card>
      ) : (
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
      )}

      {collections.length > 0 && (
        <div className="flex justify-center pt-2 print:hidden">
          <PrintButton label={t("common", "print")} variant="outline" />
        </div>
      )}
    </div>
  );
}
