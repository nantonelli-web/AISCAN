import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface AlertRow {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default async function AlertsPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("mait_alerts")
    .select("*")
    .eq("workspace_id", profile.workspace_id!)
    .order("created_at", { ascending: false })
    .limit(50);

  const alerts = (data ?? []) as AlertRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          Notifiche sulle attività di scraping e sui cambi competitor.
        </p>
      </div>
      {alerts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nessun alert.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="gold">{a.type}</Badge>
                    {!a.read && <Badge variant="muted">new</Badge>}
                  </div>
                  <p className="text-sm">{a.message}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDate(a.created_at)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
