import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, serverT } from "@/lib/i18n/server";
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
      {/* Back to the section root — Monitoring is the channel-first
          entry point for every workspace tool. /serp is one of those
          tools, so the back arrow lives in the section header. */}
      <Link
        href="/monitoring"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="size-4" /> {t("monitoring", "backLabel")}
      </Link>
      <header className="space-y-1">
        <p className="eyebrow">{t("monitoring", "title").toUpperCase()}</p>
        <h1 className="text-3xl font-serif tracking-tight">{t("serp", "title")}</h1>
        <p className="text-sm text-muted-foreground max-w-2xl text-pretty">
          {t("serp", "subtitle")}
        </p>
      </header>

      <SerpPageClient
        initialQueries={(queries ?? []) as never[]}
        competitors={(competitors ?? []) as never[]}
      />
    </div>
  );
}
