import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CompareView } from "./compare-view";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { getLocale, serverT } from "@/lib/i18n/server";
import type { MaitCompetitor, MaitClient } from "@/types";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [{ data: competitors }, { data: savedComparisons }, { data: clientsData }] =
    await Promise.all([
      supabase
        .from("mait_competitors")
        .select("*")
        .eq("workspace_id", profile.workspace_id!)
        .order("page_name"),
      admin
        .from("mait_comparisons")
        .select("id, competitor_ids, locale, countries, channel, date_from, date_to, stale, created_at, updated_at")
        .eq("workspace_id", profile.workspace_id!)
        .order("updated_at", { ascending: false })
        .limit(10),
      admin
        .from("mait_clients")
        .select("id, name, color, workspace_id")
        .eq("workspace_id", profile.workspace_id!)
        .order("name"),
    ]);

  return (
    <div className="space-y-6">
      <DynamicBackLink fallbackHref="/brands" label={t("competitors", "allCompetitors")} />
      <div>
        <h1 className="text-2xl font-serif tracking-tight">
          {t("compare", "title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("compare", "subtitle")}
        </p>
      </div>
      <CompareView
        competitors={(competitors ?? []) as MaitCompetitor[]}
        clients={(clientsData ?? []) as MaitClient[]}
        workspaceId={profile.workspace_id!}
        savedComparisons={(savedComparisons ?? []) as Array<{
          id: string;
          competitor_ids: string[];
          locale: string;
          countries: string[] | null;
          channel: string | null;
          date_from: string | null;
          date_to: string | null;
          stale: boolean;
          created_at: string;
          updated_at: string;
        }>}
      />
    </div>
  );
}
