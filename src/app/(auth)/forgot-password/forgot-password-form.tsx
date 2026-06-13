"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/context";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { t } = useT();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    // The recovery link lands on /api/auth/callback, which exchanges the
    // code for a session and then redirects to /reset-password (via the
    // `next` param) where the user picks a new password. The URL must be
    // in Supabase Auth → Redirect URLs allowlist.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(t("auth", "forgotError"));
      return;
    }
    // Always show the same generic confirmation — never reveal whether an
    // account exists for this email (anti-enumeration).
    setSent(true);
    toast.success(t("auth", "forgotSent"));
  }

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground text-center py-2">
        {t("auth", "forgotSent")}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("auth", "emailLabel")}</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t("auth", "forgotLoading") : t("auth", "forgotSubmit")}
      </Button>
    </form>
  );
}
