import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NewCompetitorForm } from "./form";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { getLocale, serverT } from "@/lib/i18n/server";

export default async function NewCompetitorPage() {
  const locale = await getLocale();
  const t = serverT(locale);

  return (
    <div className="max-w-2xl space-y-6">
      <DynamicBackLink fallbackHref="/brands" label={t("competitors", "allCompetitors")} />
      <div>
        <h1 className="text-2xl font-serif tracking-tight">{t("newCompetitor", "title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("newCompetitor", "subtitle")}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("newCompetitor", "detailsTitle")}</CardTitle>
          <CardDescription>
            {t("newCompetitor", "detailsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewCompetitorForm />
        </CardContent>
      </Card>
    </div>
  );
}
