import Link from "next/link";
import { RegisterForm } from "./register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLocale, serverT } from "@/lib/i18n/server";

export default async function RegisterPage() {
  const locale = await getLocale();
  const t = serverT(locale);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("auth", "registerTitle")}</CardTitle>
        <CardDescription>
          {t("auth", "registerDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <p className="text-xs text-muted-foreground text-center">
          {t("auth", "hasAccount")}{" "}
          <Link href="/login" className="text-gold hover:underline">
            {t("auth", "loginLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
