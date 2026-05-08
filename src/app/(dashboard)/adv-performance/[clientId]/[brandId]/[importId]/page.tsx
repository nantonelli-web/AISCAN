import { notFound } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { PrintButton } from "@/components/ui/print-button";
import { getLocale, serverT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/utils";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function ImportDashboardPage({
  params,
}: {
  params: Promise<{ clientId: string; brandId: string; importId: string }>;
}) {
  const { clientId, brandId, importId } = await params;
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [{ data: imp }, { data: client }, { data: brand }] = await Promise.all([
    supabase
      .from("mait_perf_imports")
      .select(
        "id, workspace_id, client_id, channel, period_from, period_to, status, currency, file_name",
      )
      .eq("id", importId)
      .maybeSingle(),
    supabase
      .from("mait_clients")
      .select("id, name")
      .eq("id", clientId)
      .eq("workspace_id", profile.workspace_id!)
      .maybeSingle(),
    supabase
      .from("mait_competitors")
      .select("id, page_name, client_id")
      .eq("id", brandId)
      .eq("workspace_id", profile.workspace_id!)
      .maybeSingle(),
  ]);

  if (
    !imp ||
    !client ||
    !brand ||
    imp.client_id !== clientId ||
    brand.client_id !== clientId
  ) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <DynamicBackLink
          fallbackHref={`/adv-performance/${clientId}/${brandId}`}
          label={brand.page_name}
        />
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>

      <header className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-info-soft tone-info grid place-items-center shrink-0">
          <TrendingUp className="size-5" />
        </div>
        <div className="space-y-1 min-w-0">
          <p className="eyebrow">
            {client.name} · {t("advPerformance", "dashboardTitle").toUpperCase()}
          </p>
          <h1 className="text-3xl font-serif tracking-tight truncate">
            {brand.page_name}
          </h1>
          <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
            <Badge variant="outline" className="text-[10px] uppercase">
              {imp.channel}
            </Badge>
            <span className="tabular-nums">
              {formatDate(imp.period_from)} → {formatDate(imp.period_to)}
            </span>
            {imp.currency && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{imp.currency}</span>
              </>
            )}
          </div>
        </div>
      </header>

      <DashboardClient importId={importId} />
    </div>
  );
}
