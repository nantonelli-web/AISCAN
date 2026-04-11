"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Send, Trash2, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useT } from "@/lib/i18n/context";

interface Invitation {
  id: string;
  email: string;
  role: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export function InviteSection({ invitations: initial }: { invitations: Invitation[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("analyst");
  const [sending, setSending] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [invitations, setInvitations] = useState(initial);
  const { t, locale } = useT();

  const roleLabels: Record<string, string> = {
    admin: "Admin",
    analyst: t("invite", "roleAnalystShort"),
    viewer: "Viewer",
  };

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setLastUrl(null);
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const json = await res.json();
    setSending(false);
    if (!res.ok) {
      toast.error(json.error);
      return;
    }
    toast.success(`${t("invite", "inviteCreated")} ${email}`);
    setLastUrl(json.inviteUrl);
    setEmail("");
    router.refresh();
    // Refresh invitations list
    const listRes = await fetch("/api/invitations");
    if (listRes.ok) setInvitations(await listRes.json());
  }

  async function onDelete(id: string) {
    const res = await fetch(`/api/invitations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("invite", "deleteError"));
      return;
    }
    toast.success(t("invite", "inviteDeleted"));
    setInvitations((prev) => prev.filter((i) => i.id !== id));
    router.refresh();
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success(t("invite", "linkCopied"));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("invite", "inviteTitle")}</CardTitle>
          <CardDescription>
            {t("invite", "inviteDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onInvite} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inv-email">{t("invite", "emailLabel")}</Label>
                <Input
                  id="inv-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("invite", "emailPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-role">{t("invite", "roleLabel")}</Label>
                <select
                  id="inv-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <option value="admin">{t("invite", "roleAdmin")}</option>
                  <option value="analyst">{t("invite", "roleAnalyst")}</option>
                  <option value="viewer">{t("invite", "roleViewer")}</option>
                </select>
              </div>
            </div>
            <Button type="submit" disabled={sending}>
              <Send className="size-4" />
              {sending ? t("invite", "sendingBtn") : t("invite", "sendBtn")}
            </Button>
          </form>

          {lastUrl && (
            <div className="mt-4 p-3 rounded-md border border-gold/30 bg-gold/5 space-y-2">
              <p className="text-xs text-gold font-medium">
                {t("invite", "linkGenerated")}
              </p>
              <div className="flex gap-2">
                <Input value={lastUrl} readOnly className="text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyUrl(lastUrl)}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("invite", "sentInvitesTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {invitations.map((inv) => {
                const expired =
                  !inv.accepted_at && new Date(inv.expires_at) < new Date();
                return (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {inv.email}
                        </span>
                        <Badge variant="gold">
                          {roleLabels[inv.role] ?? inv.role}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {inv.accepted_at ? (
                          <span className="flex items-center gap-1 text-green-400">
                            <CheckCircle2 className="size-3" /> {t("invite", "accepted")}
                          </span>
                        ) : expired ? (
                          <span className="text-red-400">{t("invite", "expired")}</span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" /> {t("invite", "pending")}{" "}
                            {new Date(inv.expires_at).toLocaleDateString(locale)}
                          </span>
                        )}
                      </div>
                    </div>
                    {!inv.accepted_at && (
                      <button
                        onClick={() => onDelete(inv.id)}
                        className="size-8 rounded-md border border-border hover:bg-muted hover:border-red-400/40 grid place-items-center text-muted-foreground hover:text-red-400 transition-colors"
                        title={t("invite", "deleteInvite")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
