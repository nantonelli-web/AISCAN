import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Eye, BarChart3, Layers } from "lucide-react";
import { OAuthCodeHandler } from "@/components/auth/code-handler";
import { getLocale, serverT } from "@/lib/i18n/server";

export default async function LandingPage() {
  const locale = await getLocale();
  const t = serverT(locale);

  return (
    <main className="flex-1">
      <Suspense fallback={null}>
        <OAuthCodeHandler />
      </Suspense>
      <section className="mx-auto max-w-6xl px-6 pt-24 pb-16">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold mb-6">
          <span className="h-px w-8 bg-gold" />
          {t("landing", "tagline")}
        </div>
        <h1 className="text-5xl md:text-6xl font-serif tracking-tight max-w-3xl">
          Meta Ads <span className="text-gold">Intelligence</span> Tool.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          {t("landing", "subtitle")}
        </p>
        <div className="mt-10 flex gap-3">
          <Button asChild size="lg">
            <Link href="/login">
              {t("landing", "loginBtn")} <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/register">{t("landing", "registerBtn")}</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 grid gap-6 md:grid-cols-3">
        <Feature
          icon={<Eye className="size-5 text-gold" />}
          title={t("landing", "featureMonitorTitle")}
          body={t("landing", "featureMonitorBody")}
        />
        <Feature
          icon={<Layers className="size-5 text-gold" />}
          title={t("landing", "featureLibraryTitle")}
          body={t("landing", "featureLibraryBody")}
        />
        <Feature
          icon={<BarChart3 className="size-5 text-gold" />}
          title={t("landing", "featureAnalyticsTitle")}
          body={t("landing", "featureAnalyticsBody")}
        />
      </section>
    </main>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center mb-4">
        {icon}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
