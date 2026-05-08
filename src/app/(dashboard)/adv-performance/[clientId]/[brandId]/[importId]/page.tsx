import { notFound } from "next/navigation";
import { TrendingUp, Search, Music2, Ghost, Infinity as InfinityIcon } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { PrintButton } from "@/components/ui/print-button";
import { getLocale, serverT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/utils";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

const CHANNEL_META: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    bg: string;
    text: string;
  }
> = {
  meta: {
    label: "Meta",
    icon: InfinityIcon, // Meta usa un infinity mark stilizzato
    bg: "bg-[#0866ff]/12",
    text: "text-[#0866ff]",
  },
  google: {
    label: "Google",
    icon: Search,
    bg: "bg-blue-500/10",
    text: "text-blue-500",
  },
  tiktok: {
    label: "TikTok",
    icon: Music2,
    bg: "bg-rose-500/10",
    text: "text-rose-500",
  },
  snapchat: {
    label: "Snapchat",
    icon: Ghost,
    bg: "bg-yellow-500/10",
    text: "text-yellow-600",
  },
};

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

  const channelMeta = CHANNEL_META[imp.channel] ?? CHANNEL_META.meta;
  const ChannelIcon = channelMeta.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <DynamicBackLink
          fallbackHref={`/adv-performance/${clientId}/${brandId}`}
          label={t("advPerformance", "backToImportsList").replace(
            "{brand}",
            brand.page_name,
          )}
        />
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>

      <header className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-info-soft tone-info grid place-items-center shrink-0">
          <TrendingUp className="size-5" />
        </div>
        <div className="space-y-1.5 min-w-0">
          <p className="eyebrow">
            {client.name} · {t("advPerformance", "dashboardTitle").toUpperCase()}
          </p>
          <h1 className="text-3xl font-serif tracking-tight truncate">
            {brand.page_name}
          </h1>
          <div className="flex items-center gap-2.5 flex-wrap text-sm">
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${channelMeta.bg} ${channelMeta.text} text-sm font-semibold ring-1 ring-inset ring-current/20`}
            >
              <ChannelIcon className="size-4" />
              {channelMeta.label}
            </div>
            <span className="tabular-nums text-muted-foreground">
              {formatDate(imp.period_from)} → {formatDate(imp.period_to)}
            </span>
          </div>
        </div>
      </header>

      <DashboardClient importId={importId} />
    </div>
  );
}
