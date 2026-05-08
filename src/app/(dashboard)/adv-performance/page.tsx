import Link from "next/link";
import {
  TrendingUp,
  ChevronRight,
  Sparkles,
  CalendarDays,
  Globe2,
  Layers,
} from "lucide-react";
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
  brandsCount: number;
  importsCount: number;
  lastPeriod: string | null;
  channels: Set<string>;
}

export default async function AdvPerformancePage() {
  const { profile } = await getSessionUser();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [
    { data: clientsData },
    { data: importsData },
    { data: brandsData },
  ] = await Promise.all([
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
    admin
      .from("mait_competitors")
      .select("id, client_id")
      .eq("workspace_id", profile.workspace_id!),
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
  const brands = (brandsData ?? []) as {
    id: string;
    client_id: string | null;
  }[];

  const byClient = new Map<string, ClientWithImports>();
  for (const c of clients) {
    byClient.set(c.id, {
      id: c.id,
      name: c.name,
      color: c.color,
      brandsCount: 0,
      importsCount: 0,
      lastPeriod: null,
      channels: new Set(),
    });
  }
  for (const b of brands) {
    if (!b.client_id) continue;
    const entry = byClient.get(b.client_id);
    if (entry) entry.brandsCount += 1;
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

  const featurePills: { label: string; icon: typeof Sparkles }[] = [
    { label: t("advPerformance", "homeHeroPill1"), icon: Sparkles },
    { label: t("advPerformance", "homeHeroPill2"), icon: CalendarDays },
    { label: t("advPerformance", "homeHeroPill3"), icon: Globe2 },
    { label: t("advPerformance", "homeHeroPill4"), icon: Layers },
  ];

  return (
    <div className="space-y-6">
      <DynamicBackLink fallbackHref="/dashboard" label={t("common", "backToDashboard")} />

      {/* Hero with chart silhouette background */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-amber-500/15 via-sky-500/8 to-transparent">
        <div className="absolute inset-0 -z-10 opacity-50 pointer-events-none" aria-hidden>
          <svg viewBox="0 0 1000 240" className="size-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="hp-line" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#d9a82f" stopOpacity="0.7" />
                <stop offset="60%" stopColor="#5b7ea3" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#5b7ea3" stopOpacity="0.1" />
              </linearGradient>
              <linearGradient id="hp-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#d9a82f" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#d9a82f" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="hp-bar" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#5b7ea3" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#5b7ea3" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Bars (impressions) */}
            {Array.from({ length: 28 }).map((_, i) => {
              const x = 30 + i * 34;
              const heights = [70, 55, 90, 65, 110, 80, 130, 95, 150, 120, 165, 140, 180, 155, 195, 170, 175, 160, 185, 145, 155, 130, 145, 115, 135, 110, 120, 95];
              const h = heights[i] ?? 100;
              return (
                <rect
                  key={x}
                  x={x}
                  y={240 - h}
                  width="20"
                  height={h}
                  fill="url(#hp-bar)"
                  rx="3"
                />
              );
            })}
            {/* Line (spend trend) */}
            <path
              d="M0 200 Q 100 180, 180 165 T 340 130 T 500 100 T 660 70 T 820 55 T 1000 35"
              stroke="url(#hp-line)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M0 200 Q 100 180, 180 165 T 340 130 T 500 100 T 660 70 T 820 55 T 1000 35 L 1000 240 L 0 240 Z"
              fill="url(#hp-fill)"
            />
            {/* Dots highlight */}
            {[
              [180, 165],
              [340, 130],
              [500, 100],
              [660, 70],
              [820, 55],
            ].map(([x, y]) => (
              <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r="4"
                fill="#d9a82f"
                opacity="0.8"
              />
            ))}
          </svg>
        </div>
        <div className="p-6 sm:p-9 grid gap-5 sm:grid-cols-[auto_1fr] items-start">
          <div className="size-14 rounded-2xl bg-gradient-to-br from-amber-500/30 to-sky-500/20 ring-2 ring-border grid place-items-center text-amber-600 shadow-sm">
            <TrendingUp className="size-6" />
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t("sidebar", "groupBuild").toUpperCase()} ·{" "}
                {t("advPerformance", "title").toUpperCase()}
              </p>
              <h1 className="text-3xl sm:text-4xl font-serif tracking-tight">
                {t("advPerformance", "homeHeroTagline")}
              </h1>
              <p className="text-sm text-muted-foreground text-pretty max-w-3xl leading-relaxed">
                {t("advPerformance", "homeHeroBody")}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {featurePills.map((p) => {
                const Icon = p.icon;
                return (
                  <div
                    key={p.label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/60 backdrop-blur-sm border border-border text-[11px] font-medium text-foreground"
                  >
                    <Icon className="size-3 text-amber-500" />
                    {p.label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Clients grid */}
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
        <section className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              {t("advPerformance", "homeClientsTitle")}
            </h2>
            <p className="text-[11.5px] text-muted-foreground">
              {t("advPerformance", "homeClientsSubtitle")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {enriched.map((c) => (
              <Link
                key={c.id}
                href={`/adv-performance/${c.id}`}
                className="block group"
              >
                <Card className="h-full hover:border-gold/50 hover:shadow-md transition-all relative overflow-hidden">
                  <div
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ backgroundColor: c.color ?? "#94a3b8" }}
                    aria-hidden
                  />
                  <CardContent className="p-5 space-y-3 pt-6">
                    <div className="flex items-start gap-3">
                      <div
                        className="size-10 rounded-lg shrink-0 ring-2 ring-border"
                        style={{ backgroundColor: c.color ?? "#94a3b8" }}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold tracking-tight truncate group-hover:text-gold transition-colors">
                          {c.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {c.brandsCount === 0
                            ? "— brand"
                            : c.brandsCount === 1
                              ? "1 brand"
                              : `${c.brandsCount} brand`}
                        </p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0 group-hover:text-gold transition-colors" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
                      <div className="space-y-0.5">
                        <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">
                          Export
                        </p>
                        <p className="text-lg font-semibold tabular-nums leading-none">
                          {c.importsCount}
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">
                          {t("advPerformance", "lastPeriod")}
                        </p>
                        <p className="text-[11.5px] tabular-nums truncate font-medium">
                          {c.lastPeriod ? formatDate(c.lastPeriod) : "—"}
                        </p>
                      </div>
                    </div>
                    {c.channels.size > 0 && (
                      <div className="flex items-center gap-1 pt-1">
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
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
