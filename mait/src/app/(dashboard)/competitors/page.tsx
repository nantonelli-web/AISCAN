import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { MaitCompetitor } from "@/types";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
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
          <h1 className="text-2xl font-serif tracking-tight">Competitors</h1>
          <p className="text-sm text-muted-foreground">
            Brand monitorati nel tuo workspace.
          </p>
        </div>
        <Button asChild>
          <Link href="/competitors/new">
            <Plus className="size-4" /> Aggiungi competitor
          </Link>
        </Button>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nessun competitor configurato. Clicca <b>Aggiungi competitor</b> per
            iniziare.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Link key={c.id} href={`/competitors/${c.id}`}>
              <Card className="hover:border-gold/50 transition-colors h-full">
                <CardContent className="p-5 space-y-3">
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
                  <p className="text-xs text-muted-foreground">
                    Ultimo scan: {formatDate(c.last_scraped_at)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
