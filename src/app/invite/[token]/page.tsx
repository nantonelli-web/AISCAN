import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInviteButton } from "./accept-button";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("mait_invitations")
    .select("id, email, role, workspace_id, accepted_at, expires_at")
    .eq("token", token)
    .single();

  if (!invite) notFound();

  if (invite.accepted_at) {
    redirect("/dashboard");
  }

  const expired = new Date(invite.expires_at) < new Date();
  if (expired) {
    return (
      <div className="flex-1 grid place-items-center px-6 py-12">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invito scaduto</CardTitle>
            <CardDescription>
              Questo link di invito è scaduto. Chiedi all&apos;admin del workspace di inviartene uno nuovo.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Get workspace name
  const { data: ws } = await admin
    .from("mait_workspaces")
    .select("name")
    .eq("id", invite.workspace_id)
    .single();

  // Check if user is logged in
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roleLabels: Record<string, string> = {
    admin: "Admin",
    analyst: "Analista",
    viewer: "Viewer",
  };

  return (
    <div className="flex-1 grid place-items-center px-6 py-12">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-gold mb-2">
            ◆ MAIT · NIMA Digital
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sei stato invitato</CardTitle>
            <CardDescription>
              Sei stato invitato al workspace <b>{ws?.name ?? "—"}</b> con il
              ruolo <b>{roleLabels[invite.role] ?? invite.role}</b>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user ? (
              <AcceptInviteButton token={token} />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Accedi o registrati per accettare l&apos;invito.
                </p>
                <div className="flex gap-2">
                  <a
                    href={`/login?redirect=/invite/${token}`}
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 bg-gold text-gold-foreground hover:bg-[#e5b94d] shadow-sm"
                  >
                    Accedi
                  </a>
                  <a
                    href={`/register?redirect=/invite/${token}`}
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 border border-border bg-transparent text-foreground hover:bg-muted"
                  >
                    Registrati
                  </a>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
