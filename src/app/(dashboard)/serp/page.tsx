import { Lightbulb } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, serverT } from "@/lib/i18n/server";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { SerpPageClient } from "./serp-page-client";

export const dynamic = "force-dynamic";

export default async function SerpPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  // Workspace-scoped under RLS so we can pull everything in one trip.
  // Each query carries its M:N brand list + the most recent run
  // summary so the queries grid does not need a per-row fetch.
  const { data: queries, error } = await supabase
    .from("mait_serp_queries")
    .select(
      `
      id, query, country, language, device, label, is_active, last_scraped_at, created_at,
      brands:mait_serp_query_brands(
        competitor_id,
        mait_competitors(id, page_name, google_domain)
      ),
      runs:mait_serp_runs(
        id, scraped_at, organic_count, paid_count, paid_products_count, has_ai_overview
      )
    `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[/serp page]", error);
  }

  const { data: competitors } = await supabase
    .from("mait_competitors")
    .select("id, page_name, google_domain")
    .eq("workspace_id", profile.workspace_id!)
    .order("page_name", { ascending: true });

  return (
    <div className="space-y-8">
      {/* SERP è uno strumento brand-driven raggiunto dal tab SERP del
          dettaglio brand; il back torna ai Brand. */}
      <DynamicBackLink fallbackHref="/brands" label={t("common", "backToBrands")} />
      <header className="space-y-1">
        <h1 className="text-3xl font-serif tracking-tight">{t("serp", "title")}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {t("serp", "subtitle")}
        </p>
      </header>

      {/* Explainer: SERP non è solo "cerca il mio brand" — qui si fa
          analisi di mercato di ricerca più ampia. */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3.5">
        <div className="size-8 rounded-lg bg-gold/15 text-gold grid place-items-center shrink-0">
          <Lightbulb className="size-4" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">{t("serp", "explainerTitle")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
            {t("serp", "explainerBody")}
          </p>
        </div>
      </div>

      <SerpPageClient
        initialQueries={(queries ?? []) as never[]}
        competitors={(competitors ?? []) as never[]}
      />
    </div>
  );
}
