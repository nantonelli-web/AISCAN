import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderHeart } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const { profile } = await getSessionUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from("mait_collections")
    .select("id, name, description, created_at")
    .eq("workspace_id", profile.workspace_id!)
    .order("created_at", { ascending: false });

  const collections = await Promise.all(
    (data ?? []).map(async (c) => {
      const { count } = await admin
        .from("mait_collection_ads")
        .select("ad_id", { count: "exact", head: true })
        .eq("collection_id", c.id);
      return { ...c, adCount: count ?? 0 };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">Collezioni</h1>
        <p className="text-sm text-muted-foreground">
          Board di ispirazione. Salva ads dalla Creative Library o dai competitor.
        </p>
      </div>

      {collections.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <FolderHeart className="size-8 mx-auto mb-3 text-muted-foreground/50" />
            <p>Nessuna collezione creata.</p>
            <p className="text-xs mt-1">
              Clicca l&apos;icona <b>segnalibro</b> su qualsiasi ad per salvarla in una collezione.
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
                    Creata il {formatDate(c.created_at)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
