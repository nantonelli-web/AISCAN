import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getLocale, serverT } from "@/lib/i18n/server";

export default async function NotFound() {
  const locale = await getLocale();
  const t = serverT(locale);

  return (
    <div className="flex-1 grid place-items-center px-6 py-20">
      <div className="text-center max-w-md space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-gold">
          ◆ MAIT · 404
        </p>
        <h1 className="text-4xl font-serif tracking-tight">
          {t("notFound", "title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("notFound", "description")}
        </p>
        <div className="pt-2 flex gap-2 justify-center">
          <Button asChild>
            <Link href="/dashboard">{t("notFound", "backDashboard")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">{t("notFound", "home")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
