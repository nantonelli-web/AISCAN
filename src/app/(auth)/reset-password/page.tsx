import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLocale, serverT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const locale = await getLocale();
  const t = serverT(locale);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("auth", "resetTitle")}</CardTitle>
        <CardDescription>{t("auth", "resetDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
