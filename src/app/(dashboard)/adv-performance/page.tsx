import Link from "next/link";
import { TrendingUp, ChevronRight } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { getLocale, serverT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface ClientWithImports {
  id: string;
  name: string;
  color: string | null;
  importsCount: number;
  lastPeriod: string | null;
  channels: Set<string>;
}

export default async function AdvPerformancePage() {
  const { profile } = await getSessionUser();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  // Fetch clients + their imports in parallel.
  const [{ data: clientsData }, { data: importsData }] = await Promise.all([
    admin
      .from("mait_clients")
      .select("id, name, color")
      .eq("workspace_id", profile.workspace_id!)
      .order("name"),
    admin
      .from("mait_perf_imports")
      .select("client_id, channel, period_to")
      .eq("workspace_id", profile.workspace_id!)
      .eq("status", "validated")
      .order("period_to", { ascending: false }),
  ]);

  const clients = (clientsData ?? []) as {
    id: string;
    name: string;
    color: string | null;
  }[];
  const imports = (importsData ?? []) as {
    client_id: string;
    channel: string;
    period_to: string;
  }[];

  const byClient = new Map<string, ClientWithImports>();
  for (const c of clients) {
    byClient.set(c.id, {
      id: c.id,
      name: c.name,
      color: c.color,
      importsCount: 0,
      lastPeriod: null,
      channels: new Set(),
    });
  }
  for (const imp of imports) {
    const entry = byClient.get(imp.client_id);
    if (!entry) continue;
    entry.importsCount += 1;
    entry.channels.add(imp.channel);
    if (entry.lastPeriod == null || imp.period_to > entry.lastPeriod) {
      entry.lastPeriod = imp.period_to;
    }
  }
  const enriched = [...byClient.values()];

  return (
    <div className="space-y-6">
      <DynamicBackLink fallbackHref="/dashboard" label={t("common", "backToDashboard")} />
      <header className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-info-soft tone-info grid place-items-center shrink-0">
          <TrendingUp className="size-5" />
        </div>
        <div className="space-y-0.5">
          <p className="eyebrow">{t("sidebar", "groupBuild").toUpperCase()}</p>
          <h1 className="text-3xl font-serif tracking-tight">
            {t("advPerformance", "title")}
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {t("advPerformance", "subtitle")}
          </p>
        </div>
      </header>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-sm font-medium">
              {t("advPerformance", "noClientsTitle")}
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {t("advPerformance", "noClientsBody")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {enriched.map((c) => (
            <Link
              key={c.id}
              href={`/adv-performance/${c.id}`}
              className="block"
            >
              <Card className="hover:border-gold/40 hover:shadow-md transition-all">
                <CardContent className="p-5 flex items-center gap-4">
                  <div
                    className="size-10 rounded-md shrink-0"
                    style={{ backgroundColor: c.color ?? "#94a3b8" }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold tracking-tight truncate">
                      {c.name}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-muted-foreground">
                      <span>
                        {c.importsCount === 1
                          ? t("advPerformance", "clientImportsCount").replace(
                              "{n}",
                              "1",
                            )
                          : t(
                              "advPerformance",
                              "clientImportsCountPlural",
                            ).replace("{n}", String(c.importsCount))}
                      </span>
                      {c.lastPeriod && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span>
                            {t("advPerformance", "lastPeriod")}:{" "}
                            {formatDate(c.lastPeriod)}
                          </span>
                        </>
                      )}
                      {c.channels.size > 0 && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <div className="flex items-center gap-1">
                            {[...c.channels].map((ch) => (
                              <Badge
                                key={ch}
                                variant="outline"
                                className="text-[9px] py-0 px-1.5 uppercase"
                              >
                                {ch}
                              </Badge>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
