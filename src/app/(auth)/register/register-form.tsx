"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon } from "@/components/ui/google-icon";
import { useT } from "@/lib/i18n/context";
import { validatePassword, describeIssue, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { t, locale } = useT();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const check = validatePassword(password);
    if (!check.ok) {
      toast.error(describeIssue(check.issues[0]));
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // `locale` is read by the Supabase email templates to pick the
        // language of the confirmation email ({{ if eq .Data.locale "en" }}).
        data: { name, workspace_name: workspaceName, locale },
        // Point the confirmation link straight at our callback (which
        // provisions mait_users + workspace), instead of relying on the
        // Supabase Site URL. Without this, when email confirmation is ON
        // the link lands on the Site URL and the user is never provisioned
        // → "user not created" at first login. The URL must also be in the
        // Supabase Auth "Redirect URLs" allowlist.
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error || !data.user) {
      setLoading(false);
      toast.error(error?.message ?? t("auth", "registerError"));
      return;
    }

    // Email confirmation is ON: signUp returns a user but NO session, so
    // the server-side bootstrap (which derives identity from the session)
    // would 401. The account is provisioned when the user clicks the
    // confirmation link → /api/auth/callback (see emailRedirectTo above);
    // and as a belt-and-suspenders the login flow self-heals provisioning
    // if the callback ever doesn't run. So here we just tell them to check
    // their email and skip bootstrap.
    if (!data.session) {
      setLoading(false);
      toast.success(t("auth", "checkEmail"));
      return;
    }

    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // identity (userId/email) is derived server-side from the session,
      // not sent from the client.
      body: JSON.stringify({
        name,
        workspaceName: workspaceName || `${name || "My"} workspace`,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const { error: bootErr } = await res.json().catch(() => ({ error: "Unknown" }));
      toast.error(`${t("auth", "bootstrapFailed")} ${bootErr}`);
      return;
    }

    toast.success(t("auth", "accountCreated"));
    router.push("/dashboard");
    router.refresh();
  }

  async function onGoogleSignup() {
    setGoogleLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?redirect=/dashboard`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      toast.error(error.message);
      setGoogleLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onGoogleSignup}
        disabled={googleLoading}
      >
        <GoogleIcon className="size-4" />
        {googleLoading ? t("auth", "redirect") : t("auth", "registerGoogle")}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">{t("auth", "orDivider")}</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("auth", "fullNameLabel")}</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workspace">{t("auth", "workspaceNameLabel")}</Label>
          <Input
            id="workspace"
            required
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder={t("auth", "workspacePlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("auth", "emailLabel")}</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth", "passwordLabel")}</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("auth", "registerLoading") : t("auth", "registerSubmit")}
        </Button>
      </form>
    </div>
  );
}
