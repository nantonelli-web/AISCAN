import Link from "next/link";
import { Plus, ExternalLink, Pencil, FolderOpen, ChevronDown, ChevronRight } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getLocale, serverT } from "@/lib/i18n/server";
import { ScanAllButton } from "./scan-all-button";
import type { MaitCompetitor, MaitClient } from "@/types";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [{ data: competitors }, { data: clientsData }] = await Promise.all([
    supabase
      .from("mait_competitors")
      .select("*")
      .eq("workspace_id", profile.workspace_id!)
      .order("page_name"),
    admin
      .from("mait_clients")
      .select("*")
      .eq("workspace_id", profile.workspace_id!)
      .order("name"),
  ]);

  const list = (competitors ?? []) as MaitCompetitor[];
  const clients = (clientsData ?? []) as MaitClient[];

  // Group brands by client
  const grouped = new Map<string | null, MaitCompetitor[]>();
  for (const c of list) {
    const key = c.client_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }

  // Build ordered sections: clients first (alphabetical), then unassigned
  const sections: { client: MaitClient | null; brands: MaitCompetitor[] }[] = [];
  for (const client of clients) {
    const brands = grouped.get(client.id) ?? [];
    if (brands.length > 0) {
      sections.push({ client, brands });
    }
  }
  const unassigned = grouped.get(null) ?? [];
  if (unassigned.length > 0) {
    sections.push({ client: null, brands: unassigned });
  }
  // Also add empty clients so they're visible
  for (const client of clients) {
    if (!sections.some((s) => s.client?.id === client.id)) {
      sections.push({ client, brands: [] });
    }
  }

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
      ) : sections.length > 0 && (clients.length > 0 || unassigned.length < list.length) ? (
        // Grouped view
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.client?.id ?? "unassigned"}>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="size-3 rounded-sm shrink-0"
                  style={{ backgroundColor: section.client?.color ?? "#3a3a3a" }}
                />
                <h2 className="text-sm font-semibold">
                  {section.client?.name ?? t("clients", "unassigned")}
                </h2>
                <Badge variant="muted">{section.brands.length}</Badge>
              </div>
              {section.brands.length === 0 ? (
                <p className="text-xs text-muted-foreground ml-5 mb-4">
                  {t("clients", "emptyClient")}
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 ml-5">
                  {section.brands.map((c) => (
                    <BrandCard key={c.id} brand={c} t={t} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        // Flat view (no clients created yet)
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <BrandCard key={c.id} brand={c} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function BrandCard({
  brand: c,
  t,
}: {
  brand: MaitCompetitor;
  t: (section: string, key: string) => string;
}) {
  return (
    <Card className="hover:border-gold/50 transition-colors h-full relative">
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
  );
}
