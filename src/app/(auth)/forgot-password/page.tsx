import { Suspense } from "react";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLocale, serverT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const locale = await getLocale();
  const t = serverT(locale);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("auth", "forgotTitle")}</CardTitle>
        <CardDescription>{t("auth", "forgotDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense fallback={null}>
          <ForgotPasswordForm />
        </Suspense>
        <p className="text-xs text-muted-foreground text-center">
          <Link href="/login" className="text-gold hover:underline">
            {t("auth", "backToLogin")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
