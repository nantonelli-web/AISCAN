import Link from "next/link";
import { notFound } from "next/navigation";
import { TrendingUp, ChevronRight, Plus, Building2 } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { getLocale, serverT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface BrandWithImports {
  id: string;
  page_name: string;
  page_url: string;
  category: string | null;
  country: string | null;
  importsCount: number;
  lastPeriod: string | null;
  channels: Set<string>;
}

export default async function ClientBrandPickerPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { profile } = await getSessionUser();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [{ data: client }, { data: brands }, { data: imports }] =
    await Promise.all([
      admin
        .from("mait_clients")
        .select("id, name, color")
        .eq("id", clientId)
        .eq("workspace_id", profile.workspace_id!)
        .maybeSingle(),
      admin
        .from("mait_competitors")
        .select("id, page_name, page_url, category, country")
        .eq("client_id", clientId)
        .eq("workspace_id", profile.workspace_id!)
        .order("page_name"),
      admin
        .from("mait_perf_imports")
        .select("brand_id, channel, period_to")
        .eq("workspace_id", profile.workspace_id!)
        .eq("client_id", clientId)
        .eq("status", "validated"),
    ]);

  if (!client) notFound();

  const brandList = (brands ?? []) as {
    id: string;
    page_name: string;
    page_url: string;
    category: string | null;
    country: string | null;
  }[];
  const importList = (imports ?? []) as {
    brand_id: string | null;
    channel: string;
    period_to: string;
  }[];

  // Aggregate imports per brand for the cards.
  const byBrand = new Map<string, BrandWithImports>();
  for (const b of brandList) {
    byBrand.set(b.id, {
      id: b.id,
      page_name: b.page_name,
      page_url: b.page_url,
      category: b.category,
      country: b.country,
      importsCount: 0,
      lastPeriod: null,
      channels: new Set(),
    });
  }
  for (const imp of importList) {
    if (!imp.brand_id) continue;
    const entry = byBrand.get(imp.brand_id);
    if (!entry) continue;
    entry.importsCount += 1;
    entry.channels.add(imp.channel);
    if (entry.lastPeriod == null || imp.period_to > entry.lastPeriod) {
      entry.lastPeriod = imp.period_to;
    }
  }
  const enriched = [...byBrand.values()];

  return (
    <div className="space-y-6">
      <DynamicBackLink
        fallbackHref="/adv-performance"
        label={t("advPerformance", "title")}
      />

      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-amber-500/10 via-sky-500/5 to-transparent">
        <div className="absolute inset-0 -z-10 opacity-40 pointer-events-none" aria-hidden>
          <svg viewBox="0 0 800 200" className="size-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="ph-stroke" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#d9a82f" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#5b7ea3" stopOpacity="0.15" />
              </linearGradient>
            </defs>
            <path
              d="M0 160 Q 80 120, 140 130 T 280 90 T 420 110 T 560 60 T 700 80 T 800 40"
              stroke="url(#ph-stroke)"
              strokeWidth="2.5"
              fill="none"
            />
            <path
              d="M0 180 Q 80 160, 140 170 T 280 140 T 420 150 T 560 120 T 700 130 T 800 110"
              stroke="url(#ph-stroke)"
              strokeWidth="1.5"
              strokeDasharray="3 4"
              fill="none"
              opacity="0.6"
            />
          </svg>
        </div>
        <div className="p-6 sm:p-8 flex items-center gap-4">
          <div
            className="size-12 rounded-xl shrink-0 ring-2 ring-border shadow"
            style={{ backgroundColor: client.color ?? "#94a3b8" }}
            aria-hidden
          />
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold inline-flex items-center gap-1.5">
              <TrendingUp className="size-3" />
              {t("advPerformance", "title")}
            </p>
            <h1 className="text-3xl font-serif tracking-tight truncate">
              {client.name}
            </h1>
            <p className="text-sm text-muted-foreground text-pretty">
              {t("advPerformance", "brandPickerSubtitle").replace(
                "{client}",
                client.name,
              )}
            </p>
          </div>
        </div>
      </header>

      {/* Brand list / empty */}
      {enriched.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-4">
            <div className="size-14 rounded-2xl mx-auto grid place-items-center bg-amber-500/10 text-amber-500">
              <Building2 className="size-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold tracking-tight">
                {t("advPerformance", "noBrandsTitle")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("advPerformance", "noBrandsBody")}
              </p>
            </div>
            <Button asChild size="sm" className="gap-1.5">
              <Link href={`/clients/${clientId}`}>
                <Plus className="size-4" />
                {t("advPerformance", "createBrandCta")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider">
                {t("advPerformance", "brandPickerTitle")}
              </h2>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 print:hidden"
            >
              <Link href={`/clients/${clientId}`}>
                <Plus className="size-3.5" />
                {t("advPerformance", "createBrandCta")}
              </Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {enriched.map((b) => (
              <Link
                key={b.id}
                href={`/adv-performance/${clientId}/${b.id}`}
                className="block group"
              >
                <Card className="h-full hover:border-gold/50 hover:shadow-md transition-all relative overflow-hidden">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="size-11 rounded-lg bg-gradient-to-br from-amber-500/20 to-sky-500/10 grid place-items-center text-amber-600 shrink-0">
                        <Building2 className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold tracking-tight truncate group-hover:text-gold transition-colors">
                          {b.page_name}
                        </p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0 group-hover:text-gold transition-colors" />
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                      <span>
                        {b.importsCount === 0
                          ? "—"
                          : (b.importsCount === 1
                              ? t("advPerformance", "brandImportsCount")
                              : t("advPerformance", "brandImportsCountPlural")
                            ).replace("{n}", String(b.importsCount))}
                      </span>
                      {b.channels.size > 0 && (
                        <div className="flex items-center gap-1">
                          {[...b.channels].map((ch) => (
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
                    </div>
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
