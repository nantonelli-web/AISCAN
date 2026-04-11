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

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { t } = useT();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, workspace_name: workspaceName },
      },
    });

    if (error || !data.user) {
      setLoading(false);
      toast.error(error?.message ?? t("auth", "registerError"));
      return;
    }

    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: data.user.id,
        email,
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
            minLength={8}
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
