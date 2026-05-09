import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { getLocale, serverT } from "@/lib/i18n/server";
import { BrandDetailClient } from "./brand-detail-client";
import type { PerfImportListItem } from "@/types/perf";

export const dynamic = "force-dynamic";

export default async function BrandPerfDetailPage({
  params,
}: {
  params: Promise<{ clientId: string; brandId: string }>;
}) {
  const { clientId, brandId } = await params;
  const { profile } = await getSessionUser();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [{ data: client }, { data: brand }] = await Promise.all([
    admin
      .from("mait_clients")
      .select("id, name, color")
      .eq("id", clientId)
      .eq("workspace_id", profile.workspace_id!)
      .maybeSingle(),
    admin
      .from("mait_competitors")
      .select("id, page_name, page_url, category, country, client_id")
      .eq("id", brandId)
      .eq("workspace_id", profile.workspace_id!)
      .maybeSingle(),
  ]);

  if (!client || !brand || brand.client_id !== clientId) notFound();

  // Fetch imports filtered by brand_id; fall back to client-only
  // when migration 0043 isn't applied yet.
  const fullCols =
    "id, workspace_id, client_id, brand_id, channel, period_from, period_to, status, currency, row_count, total_spend, total_impressions, file_name, created_at";
  const legacyCols =
    "id, workspace_id, client_id, channel, period_from, period_to, status, currency, row_count, total_spend, total_impressions, file_name, created_at";
  let imports: PerfImportListItem[] = [];
  {
    const full = await admin
      .from("mait_perf_imports")
      .select(fullCols)
      .eq("client_id", clientId)
      .eq("brand_id", brandId)
      .eq("workspace_id", profile.workspace_id!)
      .order("period_from", { ascending: false });
    if (full.data) {
      imports = full.data as unknown as PerfImportListItem[];
    } else if (full.error && /\bbrand_id\b/.test(full.error.message ?? "")) {
      // Pre-migration: show all imports for the client (safest UX).
      const fallback = await admin
        .from("mait_perf_imports")
        .select(legacyCols)
        .eq("client_id", clientId)
        .eq("workspace_id", profile.workspace_id!)
        .order("period_from", { ascending: false });
      imports = (fallback.data ?? []) as unknown as PerfImportListItem[];
    }
  }

  return (
    <div className="space-y-6">
      <DynamicBackLink
        fallbackHref={`/adv-performance/${clientId}`}
        label={t("advPerformance", "backToBrands")}
      />

      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-amber-500/10 via-sky-500/5 to-transparent">
        <div className="absolute inset-0 -z-10 opacity-50 pointer-events-none" aria-hidden>
          <svg viewBox="0 0 800 200" className="size-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="bd-bar" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#d9a82f" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#d9a82f" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720].map(
              (x, i) => {
                const h = 30 + ((i * 17) % 100);
                return (
                  <rect
                    key={x}
                    x={x}
                    y={200 - h}
                    width="22"
                    height={h}
                    fill="url(#bd-bar)"
                    rx="2"
                  />
                );
              },
            )}
          </svg>
        </div>
        <div className="p-6 sm:p-8 flex items-center gap-4">
          <div className="size-12 rounded-xl shrink-0 ring-2 ring-border bg-gradient-to-br from-amber-500/30 to-sky-500/20 grid place-items-center text-amber-600 shadow-sm">
            <Building2 className="size-6" />
          </div>
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
              {client.name} · {t("advPerformance", "title")}
            </p>
            <h1 className="text-3xl font-serif tracking-tight truncate">
              {brand.page_name}
            </h1>
          </div>
        </div>
      </header>

      <BrandDetailClient
        clientId={clientId}
        brandId={brandId}
        brandName={brand.page_name}
        initialImports={imports}
      />
    </div>
  );
}
