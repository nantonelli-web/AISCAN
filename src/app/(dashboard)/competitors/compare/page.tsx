import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CompareView } from "./compare-view";
import type { MaitCompetitor } from "@/types";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();

  const { data: competitors } = await supabase
    .from("mait_competitors")
    .select("*")
    .eq("workspace_id", profile.workspace_id!)
    .order("page_name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">
          Confronto competitor
        </h1>
        <p className="text-sm text-muted-foreground">
          Seleziona 2 o 3 competitor per confrontarli side-by-side.
        </p>
      </div>
      <CompareView
        competitors={(competitors ?? []) as MaitCompetitor[]}
        workspaceId={profile.workspace_id!}
      />
    </div>
  );
}
