import Link from "next/link";
import { Search, MapPin, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { getLocale, serverT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Monitoring landing page — single sidebar entry point that hosts every
 * workspace-level monitoring tool. Today: SERP + Maps. Future: hashtag
 * watch, trends, reviews aggregator. Each tool gets a card with its
 * current row count so the user reads the activity at a glance.
 *
 * Per-brand access to the same tools lives inside the brand-detail
 * channel tabs (e.g. SERP tab on /competitors/[id]); this page is the
 * top-level "command center" — the OTHER access path the user asked
 * for in the bidirectional UX (workspace-first vs brand-first).
 */
export default async function MonitoringLandingPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  // Counts per tool — head-only queries, no row payload. RLS scopes
  // them automatically to the user's workspace. Errors swallowed
  // silently because a missing count should not block the landing.
  const [{ count: serpCount }, { count: mapsCount }] = await Promise.all([
    supabase
      .from("mait_serp_queries")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("mait_maps_searches")
      .select("id", { count: "exact", head: true }),
  ]);

  const tools = [
    {
      key: "serp",
      href: "/serp",
      title: t("monitoring", "serpTitle"),
      description: t("monitoring", "serpDescription"),
      icon: Search,
      count: serpCount ?? 0,
      countLabel: t("monitoring", "serpCountLabel"),
    },
    {
      key: "maps",
      href: "/maps",
      title: t("monitoring", "mapsTitle"),
      description: t("monitoring", "mapsDescription"),
      icon: MapPin,
      count: mapsCount ?? 0,
      countLabel: t("monitoring", "mapsCountLabel"),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-serif tracking-tight">
          {t("monitoring", "title")}
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          {t("monitoring", "subtitle")}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link key={tool.key} href={tool.href} className="block group">
              <Card className="h-full hover:border-gold/40 transition-colors cursor-pointer">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-md bg-gold/10 border border-gold/30 grid place-items-center text-gold">
                      <Icon className="size-5" />
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-gold ml-auto transition-colors" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {tool.title}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {tool.description}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {tool.count}
                      </span>{" "}
                      {tool.countLabel}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
