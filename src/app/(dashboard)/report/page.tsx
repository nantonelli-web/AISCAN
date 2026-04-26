import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocale, serverT } from "@/lib/i18n/server";
import { PrintButton } from "@/components/ui/print-button";
import { ReportBuilder } from "./report-builder";
import type { MaitCompetitor } from "@/types";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  // Fetch all competitors in workspace
  const { data: competitors } = await supabase
    .from("mait_competitors")
    .select("*")
    .eq("workspace_id", profile.workspace_id!)
    .order("page_name");

  // Fetch all clients in workspace
  const { data: clients } = await admin
    .from("mait_clients")
    .select("id, name")
    .eq("workspace_id", profile.workspace_id!)
    .order("name");

  // Fetch all templates in workspace
  const { data: templates } = await admin
    .from("mait_client_templates")
    .select("id, client_id, name, file_type, created_at")
    .eq("workspace_id", profile.workspace_id!)
    .order("created_at", { ascending: false });

  // Fetch saved comparisons (last 20, most recent first). date_from /
  // date_to / countries / channel are the analysis filters persisted
  // at save time — all flowed through to /api/report/generate so the
  // report metrics match what the user saw in Compare.
  const { data: savedComparisons } = await admin
    .from("mait_comparisons")
    .select(
      "id, competitor_ids, locale, stale, updated_at, copy_analysis, visual_analysis, date_from, date_to, countries, channel"
    )
    .eq("workspace_id", profile.workspace_id!)
    .order("updated_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">
            {t("report", "title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("report", "subtitle")}
          </p>
        </div>
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>
      <ReportBuilder
        competitors={(competitors ?? []) as MaitCompetitor[]}
        clients={clients ?? []}
        templates={templates ?? []}
        savedComparisons={(savedComparisons ?? []).map((sc) => ({
          id: sc.id as string,
          competitor_ids: sc.competitor_ids as string[],
          locale: sc.locale as string,
          stale: sc.stale as boolean,
          updated_at: sc.updated_at as string,
          hasCopy: sc.copy_analysis != null,
          hasVisual: sc.visual_analysis != null,
          date_from: (sc.date_from as string | null) ?? null,
          date_to: (sc.date_to as string | null) ?? null,
          countries: (sc.countries as string[] | null) ?? null,
          channel: (sc.channel as string | null) ?? null,
        }))}
      />
    </div>
  );
}
