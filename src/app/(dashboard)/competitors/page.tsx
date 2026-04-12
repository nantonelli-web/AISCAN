import Link from "next/link";
import { Plus, ExternalLink, Pencil } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getLocale, serverT } from "@/lib/i18n/server";
import { ScanAllButton } from "./scan-all-button";
import type { MaitCompetitor } from "@/types";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);
  const { data: competitors } = await supabase
    .from("mait_competitors")
    .select("*")
    .eq("workspace_id", profile.workspace_id!)
    .order("created_at", { ascending: false });

  const list = (competitors ?? []) as MaitCompetitor[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">{t("competitors", "title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("competitors", "subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {list.length > 0 && (
            <ScanAllButton
              competitors={list.map((c) => ({ id: c.id, page_name: c.page_name }))}
            />
          )}
          <Button asChild>
            <Link href="/competitors/new">
              <Plus className="size-4" /> {t("competitors", "addCompetitor")}
            </Link>
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("competitors", "noCompetitors")} {t("competitors", "noCompetitorsClickAdd")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Card key={c.id} className="hover:border-gold/50 transition-colors h-full relative">
              <Link href={`/competitors/${c.id}`} className="absolute inset-0 z-0" />
              <CardContent className="p-5 space-y-3 relative z-10 pointer-events-none">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{c.page_name}</h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.page_url}
                    </p>
                  </div>
                  <ExternalLink className="size-4 text-muted-foreground shrink-0" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {c.country && <Badge variant="muted">{c.country}</Badge>}
                  {c.category && <Badge variant="muted">{c.category}</Badge>}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {t("competitors", "lastScan")} {formatDate(c.last_scraped_at)}
                  </p>
                  <Link
                    href={`/competitors/${c.id}/edit`}
                    className="size-7 rounded-md border border-border hover:bg-muted hover:border-gold/40 grid place-items-center text-muted-foreground hover:text-gold transition-colors pointer-events-auto"
                    title={t("editCompetitor", "title")}
                  >
                    <Pencil className="size-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
