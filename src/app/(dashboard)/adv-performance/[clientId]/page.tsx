import { notFound } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { getLocale, serverT } from "@/lib/i18n/server";
import { ClientDetailClient } from "./client-detail-client";
import type { PerfImportListItem } from "@/types/perf";

export const dynamic = "force-dynamic";

export default async function ClientPerfDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { profile } = await getSessionUser();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [{ data: client }, { data: imports }] = await Promise.all([
    admin
      .from("mait_clients")
      .select("id, name, color")
      .eq("id", clientId)
      .eq("workspace_id", profile.workspace_id!)
      .maybeSingle(),
    admin
      .from("mait_perf_imports")
      .select(
        "id, workspace_id, client_id, channel, period_from, period_to, status, currency, row_count, total_spend, total_impressions, file_name, created_at",
      )
      .eq("client_id", clientId)
      .eq("workspace_id", profile.workspace_id!)
      .order("period_from", { ascending: false }),
  ]);

  if (!client) notFound();

  return (
    <div className="space-y-6">
      <DynamicBackLink
        fallbackHref="/adv-performance"
        label={t("advPerformance", "title")}
      />
      <header className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-info-soft tone-info grid place-items-center shrink-0">
          <TrendingUp className="size-5" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <p className="eyebrow">{t("advPerformance", "title").toUpperCase()}</p>
          <h1 className="text-3xl font-serif tracking-tight truncate">
            {client.name}
          </h1>
        </div>
      </header>

      <ClientDetailClient
        clientId={clientId}
        clientName={client.name}
        initialImports={(imports ?? []) as PerfImportListItem[]}
      />
    </div>
  );
}
