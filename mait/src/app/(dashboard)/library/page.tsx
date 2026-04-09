import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AdCard } from "@/components/ads/ad-card";
import { Card, CardContent } from "@/components/ui/card";
import type { MaitAdExternal } from "@/types";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("mait_ads_external")
    .select("*")
    .eq("workspace_id", profile.workspace_id!)
    .order("created_at", { ascending: false })
    .limit(60);

  const ads = (data ?? []) as MaitAdExternal[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">Creative Library</h1>
        <p className="text-sm text-muted-foreground">
          Tutte le creatività raccolte nel workspace. (Phase 1.1: ricerca + filtri.)
        </p>
      </div>
      {ads.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nessuna ad ancora.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ads.map((a) => (
            <AdCard key={a.id} ad={a} />
          ))}
        </div>
      )}
    </div>
  );
}
