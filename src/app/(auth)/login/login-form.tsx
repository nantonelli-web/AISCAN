"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon } from "@/components/ui/google-icon";
import { useT } from "@/lib/i18n/context";

// Only accept same-origin relative paths (must start with "/" and not "//").
// Anything else — including absolute URLs — falls back to /dashboard.
function sanitizeRedirect(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = sanitizeRedirect(params.get("redirect"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { t } = useT();

  // Show a one-time toast for known auth redirect codes. Covers the three
  // codes the codebase emits today: `disabled` (account banned by an
  // admin), `no_workspace` and `no_profile` (dashboard layout / session
  // bootstrap failures). The ref guards against StrictMode double-mount.
  const errorShown = useRef(false);
  useEffect(() => {
    if (errorShown.current) return;
    const code = params.get("error");
    if (!code) return;
    const map: Record<string, string | undefined> = {
      disabled: t("auth", "errorDisabled"),
      no_workspace: t("auth", "errorNoWorkspace"),
      no_profile: t("auth", "errorNoProfile"),
    };
    const msg = map[code];
    if (msg) {
      errorShown.current = true;
      toast.error(msg);
    }
  }, [params, t]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    // Self-heal: ensure the app-level user record + workspace exist before
    // entering the dashboard. Covers confirmed auth users whose mait_users
    // row was never created (e.g. the email-confirmation callback never ran
    // because emailRedirectTo / Supabase Site URL was misconfigured, which
    // otherwise surfaces as the "no_profile" / "user not created" error on
    // every login). Idempotent — returns the existing workspace if present.
    const boot = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    setLoading(false);
    if (!boot.ok) {
      const data = await boot.json().catch(() => ({}));
      toast.error(data.error ?? t("auth", "errorNoProfile"));
      return;
    }
    toast.success(t("auth", "welcomeBack"));
    router.push(redirect);
    router.refresh();
  }

  async function onGoogleLogin() {
    setGoogleLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent(redirect)}`,
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
        onClick={onGoogleLogin}
        disabled={googleLoading}
      >
        <GoogleIcon className="size-4" />
        {googleLoading ? t("auth", "redirect") : t("auth", "continueGoogle")}
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("auth", "passwordLabel")}</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-gold hover:underline"
            >
              {t("auth", "forgotPasswordLink")}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("auth", "loginLoading") : t("auth", "loginSubmit")}
        </Button>
      </form>
    </div>
  );
}
