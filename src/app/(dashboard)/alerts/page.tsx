import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { AlertRow } from "./alert-row";
import { getLocale, serverT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface AlertRowData {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default async function AlertsPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);
  const { data } = await supabase
    .from("mait_alerts")
    .select("*")
    .eq("workspace_id", profile.workspace_id!)
    .order("created_at", { ascending: false })
    .limit(50);

  const alerts = (data ?? []) as AlertRowData[];
  const unread = alerts.filter((a) => !a.read).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">{t("alerts", "title")}</h1>
        <p className="text-sm text-muted-foreground">
          {unread > 0
            ? `${unread} ${t("alerts", "unreadOf")} ${alerts.length}`
            : `${alerts.length} ${t("alerts", "total")}`}
        </p>
      </div>
      {alerts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("alerts", "noAlerts")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <AlertRow key={a.id} alert={a} />
          ))}
        </div>
      )}
    </div>
  );
}
