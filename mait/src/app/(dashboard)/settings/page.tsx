import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export default async function SettingsPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const { data: ws } = await supabase
    .from("mait_workspaces")
    .select("name, slug, created_at")
    .eq("id", profile.workspace_id!)
    .single();
  const { data: members } = await supabase
    .from("mait_users")
    .select("id, email, name, role")
    .eq("workspace_id", profile.workspace_id!);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Workspace e utenti.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Informazioni del workspace corrente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Nome:</span>{" "}
            <span className="font-medium">{ws?.name}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Slug:</span>{" "}
            <code className="text-xs">{ws?.slug}</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membri</CardTitle>
          <CardDescription>Utenti con accesso a questo workspace.</CardDescription>
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
    </div>
  );
}
