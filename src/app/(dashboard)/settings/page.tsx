import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InviteSection } from "./invite-form";
import { getLocale, serverT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export default async function SettingsPage() {
  const { profile } = await getSessionUser();
  const admin = createAdminClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const [{ data: ws }, { data: members }, { data: invitations }] =
    await Promise.all([
      admin
        .from("mait_workspaces")
        .select("name, slug, created_at")
        .eq("id", profile.workspace_id!)
        .single(),
      admin
        .from("mait_users")
        .select("id, email, name, role")
        .eq("workspace_id", profile.workspace_id!),
      admin
        .from("mait_invitations")
        .select("id, email, role, accepted_at, expires_at, created_at")
        .eq("workspace_id", profile.workspace_id!)
        .order("created_at", { ascending: false }),
    ]);

  const isAdmin = ["super_admin", "admin"].includes(profile.role);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">{t("settings", "title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings", "subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings", "workspaceTitle")}</CardTitle>
          <CardDescription>{t("settings", "workspaceDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">{t("settings", "nameLabel")}</span>{" "}
            <span className="font-medium">{ws?.name}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("settings", "slugLabel")}</span>{" "}
            <code className="text-xs">{ws?.slug}</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings", "membersTitle")} ({(members ?? []).length})</CardTitle>
          <CardDescription>{t("settings", "membersDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {((members ?? []) as UserRow[]).map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-3 border border-border rounded-md"
            >
              <div>
                <div className="font-medium text-sm">{m.name || m.email}</div>
                <div className="text-xs text-muted-foreground">{m.email}</div>
              </div>
              <Badge variant="gold">{m.role.replace("_", " ")}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {isAdmin && (
        <InviteSection
          invitations={(invitations ?? []) as InvitationRow[]}
        />
      )}
    </div>
  );
}
