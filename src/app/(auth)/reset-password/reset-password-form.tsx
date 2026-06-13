"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/context";
import { validatePassword, describeIssue } from "@/lib/auth/password";

export function ResetPasswordForm() {
  const router = useRouter();
  const { t } = useT();
  // null = still checking, true/false = recovery session present or not.
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // The recovery link hits /api/auth/callback, which exchanges the code
  // for a session (cookies) and redirects here. So on mount we should
  // already have a session; if not, the link was invalid/expired or the
  // page was opened directly.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const check = validatePassword(password);
    if (!check.ok) {
      toast.error(describeIssue(check.issues[0]));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth", "resetMismatch"));
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message || t("auth", "resetError"));
      return;
    }
    toast.success(t("auth", "resetSuccess"));
    router.push("/dashboard");
    router.refresh();
  }

  if (hasSession === null) {
    return (
      <p className="text-sm text-muted-foreground text-center py-2">
        {t("auth", "resetChecking")}
      </p>
    );
  }

  if (!hasSession) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          {t("auth", "resetNoSession")}
        </p>
        <Link href="/forgot-password" className="text-sm text-gold hover:underline">
          {t("auth", "forgotTitle")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth", "newPasswordLabel")}</Label>
        <Input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">{t("auth", "confirmPasswordLabel")}</Label>
        <Input
          id="confirm"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t("auth", "resetLoading") : t("auth", "resetSubmit")}
      </Button>
    </form>
  );
}
