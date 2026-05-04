import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { getLocale, serverT } from "@/lib/i18n/server";

export default async function AnalyticsPage() {
  const locale = await getLocale();
  const t = serverT(locale);

  return (
    <div className="space-y-6">
      <DynamicBackLink fallbackHref="/dashboard" label={t("common", "backToDashboard")} />
      <div>
        <h1 className="text-2xl font-serif tracking-tight">{t("analytics", "title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("analytics", "subtitle")}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("analytics", "comingSoon")}</CardTitle>
          <CardDescription>
            {t("analytics", "comingSoonDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("analytics", "availableAfter")}
        </CardContent>
      </Card>
    </div>
  );
}
