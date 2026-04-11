import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLocale, serverT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const locale = await getLocale();
  const t = serverT(locale);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("auth", "loginTitle")}</CardTitle>
        <CardDescription>
          {t("auth", "loginDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <p className="text-xs text-muted-foreground text-center">
          {t("auth", "noAccount")}{" "}
          <Link href="/register" className="text-gold hover:underline">
            {t("auth", "registerLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
