import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EditCompetitorForm } from "./edit-form";
import { getLocale, serverT } from "@/lib/i18n/server";
import type { MaitCompetitor } from "@/types";

export const dynamic = "force-dynamic";

export default async function EditCompetitorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const from = sp.from as string | undefined;
  await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const { data: competitor } = await supabase
    .from("mait_competitors")
    .select("*")
    .eq("id", id)
    .single();

  if (!competitor) notFound();
  const c = competitor as MaitCompetitor;

  // Lightweight counts for the delete confirmation dialog. Head + exact
  // count returns only the row count, not any data, so this is cheap.
  const [adsRes, postsRes, jobsRes, compRes] = await Promise.all([
    supabase
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_organic_posts")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_scrape_jobs")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_comparisons")
      .select("id", { count: "exact", head: true })
      .contains("competitor_ids", [id]),
  ]);
  const deleteCounts = {
    ads: adsRes.count ?? 0,
    posts: postsRes.count ?? 0,
    jobs: jobsRes.count ?? 0,
    comparisons: compRes.count ?? 0,
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={
          from === "compare" ? "/brands/compare"
          : from === "report" ? "/report"
          : from === "brands" ? "/brands"
          : from === "brand" ? `/brands/${id}`
          : `/brands/${id}`
        }
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />{" "}
        {from === "compare" ? t("editCompetitor", "backToCompare")
          : from === "report" ? t("editCompetitor", "backToReport")
          : from === "brands" ? t("editCompetitor", "backToBrands")
          : from === "brand" ? t("editCompetitor", "backToBrand")
          : t("editCompetitor", "backToBrands")}
      </Link>

      <div>
        <h1 className="text-2xl font-serif tracking-tight">
          {t("editCompetitor", "title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {c.page_name}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("editCompetitor", "detailsTitle")}</CardTitle>
          <CardDescription>{t("editCompetitor", "detailsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <EditCompetitorForm competitor={c} deleteCounts={deleteCounts} />
        </CardContent>
      </Card>
    </div>
  );
}
