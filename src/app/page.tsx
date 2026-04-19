import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Eye,
  BarChart3,
  Layers,
  Target,
  CalendarCheck,
  Sparkles,
  Check,
  Zap,
} from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { OAuthCodeHandler } from "@/components/auth/code-handler";
import { getLocale, serverT } from "@/lib/i18n/server";
import { creditCosts, type CreditAction } from "@/config/pricing";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

/* ─── Platform logos (inline SVG) ────────────────────────── */

function MetaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.93 3.78-3.93 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z" />
    </svg>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
    </svg>
  );
}

/* ─── Data ───────────────────────────────────────────────── */

const plans: { tier: string; credits: number; priceMonthly: number; priceYearly: number; featKey: string; popular?: boolean }[] = [
  { tier: "scout", credits: 10, priceMonthly: 0, priceYearly: 0, featKey: "pricingFeatScout" },
  { tier: "analyst", credits: 80, priceMonthly: 29, priceYearly: 299, featKey: "pricingFeatAnalyst", popular: true },
  { tier: "strategist", credits: 250, priceMonthly: 89, priceYearly: 899, featKey: "pricingFeatStrategist" },
  { tier: "agency", credits: 650, priceMonthly: 239, priceYearly: 2399, featKey: "pricingFeatAgency" },
];

const actionKeys: CreditAction[] = [
  "scan_meta",
  "scan_google",
  "scan_instagram",
  "ai_tagging",
  "ai_analysis",
  "report_single",
  "report_comparison",
];

/* ─── Page ───────────────────────────────────────────────── */

export default async function LandingPage() {
  const locale = await getLocale();
  const t = serverT(locale);

  return (
    <main className="flex-1">
      <Suspense fallback={null}>
        <OAuthCodeHandler />
      </Suspense>

      {/* ─── NAV ────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="AISCAN" className="h-14" />
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">{t("landing", "loginBtn")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">{t("landing", "registerBtn")}</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ─── HERO ───────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pt-24 pb-20">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold mb-8">
          <span className="h-px w-8 bg-gold" />
          {t("landing", "heroTag")}
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif tracking-tight max-w-4xl leading-[1.1]">
          {t("landing", "heroTitle1")}
          <br />
          <span className="text-gold">{t("landing", "heroTitle2")}</span>
          <br />
          {t("landing", "heroTitle3")}
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
          {t("landing", "heroSubtitle")}
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link href="/register">
              {t("landing", "heroCta")} <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="gap-2">
            <a href="#how-it-works">
              {t("landing", "heroCtaSecondary")}
            </a>
          </Button>
        </div>
      </section>

      {/* ─── PLATFORMS BAR ──────────────────────────────── */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-6 flex flex-wrap items-center gap-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {t("landing", "platformsLabel")}
          </span>
          <div className="flex flex-wrap gap-2">
            {[
              { icon: <MetaLogo className="size-4" />, label: "Meta Ads" },
              { icon: <GoogleLogo className="size-4" />, label: "Google Ads" },
              { icon: <InstagramIcon className="size-4" />, label: "Instagram" },
            ].map((p) => (
              <span
                key={p.label}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm"
              >
                {p.icon} {p.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ───────────────────────────────── */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-serif tracking-tight">
            {t("landing", "howTitle")}
          </h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            {t("landing", "howSubtitle")}
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {([
            { num: "01", icon: <Layers className="size-5" />, titleKey: "howStep1Title", bodyKey: "howStep1Body" },
            { num: "02", icon: <Zap className="size-5" />, titleKey: "howStep2Title", bodyKey: "howStep2Body" },
            { num: "03", icon: <Sparkles className="size-5" />, titleKey: "howStep3Title", bodyKey: "howStep3Body" },
            { num: "04", icon: <BarChart3 className="size-5" />, titleKey: "howStep4Title", bodyKey: "howStep4Body" },
          ] as const).map((step) => (
            <div key={step.num} className="relative">
              <div className="size-12 rounded-xl bg-gold/10 border border-gold/30 grid place-items-center text-gold mb-4">
                <span className="text-sm font-bold">{step.num}</span>
              </div>
              <h3 className="font-semibold mb-2">{t("landing", step.titleKey)}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("landing", step.bodyKey)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES ───────────────────────────────────── */}
      <section className="bg-muted/30 border-y border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-serif tracking-tight">
              {t("landing", "featuresTitle")}
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              {t("landing", "featuresSubtitle")}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {([
              { icon: <Eye className="size-5 text-gold" />, titleKey: "feat1Title", bodyKey: "feat1Body" },
              { icon: <Sparkles className="size-5 text-gold" />, titleKey: "feat2Title", bodyKey: "feat2Body" },
              { icon: <BarChart3 className="size-5 text-gold" />, titleKey: "feat3Title", bodyKey: "feat3Body" },
              { icon: <Target className="size-5 text-gold" />, titleKey: "feat4Title", bodyKey: "feat4Body" },
              { icon: <Layers className="size-5 text-gold" />, titleKey: "feat5Title", bodyKey: "feat5Body" },
              { icon: <CalendarCheck className="size-5 text-gold" />, titleKey: "feat6Title", bodyKey: "feat6Body" },
            ] as const).map((f) => (
              <div
                key={f.titleKey}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center mb-4">
                  {f.icon}
                </div>
                <h3 className="font-semibold mb-2">{t("landing", f.titleKey)}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("landing", f.bodyKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── METRICS ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {([
            { value: "3", label: t("landing", "metricsChannels") },
            { value: "3", label: t("landing", "metricsAI") },
            { value: "PPTX & PDF", label: t("landing", "metricsReport") },
            { value: "CSV", label: t("landing", "metricsFormats") },
          ]).map((m) => (
            <div key={m.label}>
              <div className="text-4xl md:text-5xl font-serif text-gold">{m.value}</div>
              <p className="mt-2 text-sm text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── PRICING ────────────────────────────────────── */}
      <section id="pricing" className="bg-muted/30 border-y border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-serif tracking-tight">
              {t("landing", "pricingTitle")}
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              {t("landing", "pricingSubtitle")}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const features = t("landing", plan.featKey).split("|");
              const isFree = plan.priceMonthly === 0;
              return (
                <div
                  key={plan.tier}
                  className={`rounded-xl border p-6 flex flex-col ${
                    plan.popular
                      ? "border-gold bg-gold/5 ring-1 ring-gold/30"
                      : "border-border bg-card"
                  }`}
                >
                  {plan.popular && (
                    <span className="text-[10px] uppercase tracking-wider text-gold font-semibold mb-3">
                      {t("landing", "pricingPopular")}
                    </span>
                  )}
                  <h3 className="text-lg font-semibold capitalize">{plan.tier}</h3>
                  <div className="mt-3 mb-1">
                    <span className="text-4xl font-serif">
                      {isFree ? "$0" : `$${plan.priceMonthly}`}
                    </span>
                    {!isFree && (
                      <span className="text-sm text-muted-foreground">
                        {t("landing", "pricingMonth")}
                      </span>
                    )}
                  </div>
                  {!isFree && (
                    <p className="text-xs text-muted-foreground mb-4">
                      ${plan.priceYearly}{t("landing", "pricingYear")} — {t("landing", "pricingYearlySave")}
                    </p>
                  )}
                  {isFree && <div className="mb-4" />}
                  <ul className="space-y-2 mb-6 flex-1">
                    {features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-sm">
                        <Check className="size-4 text-gold shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant={plan.popular ? "default" : "outline"} className="w-full">
                    <Link href="/register">
                      {isFree ? t("landing", "pricingCta") : t("landing", "pricingCtaPaid")}
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Credit costs table */}
          <div className="mt-16 max-w-md mx-auto">
            <h3 className="text-sm font-semibold text-center mb-4">
              {t("landing", "creditCostsTitle")}
            </h3>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {actionKeys.map((action) => (
                <div key={action} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">
                    {t("landing", `creditAction_${action}`)}
                  </span>
                  <span className="font-medium text-gold">
                    {creditCosts[action]} {creditCosts[action] === 1 ? t("landing", "creditUnit") : t("landing", "creditUnitPlural")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ──────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="text-3xl md:text-4xl font-serif tracking-tight max-w-2xl mx-auto">
          {t("landing", "ctaTitle")}
        </h2>
        <p className="mt-4 text-muted-foreground max-w-lg mx-auto">
          {t("landing", "ctaSubtitle")}
        </p>
        <div className="mt-8">
          <Button asChild size="lg" className="gap-2">
            <Link href="/register">
              {t("landing", "ctaBtn")} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────────── */}
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.webp" alt="AISCAN" className="h-10" />
              <p className="mt-2 text-xs text-muted-foreground max-w-xs">
                Ads Analysis Tool
                <br />
                NIMA Digital Consulting FZCO
              </p>
            </div>
            <div className="flex gap-16">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3">
                  {t("landing", "footerProduct")}
                </h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a href="#pricing" className="hover:text-foreground transition-colors">{t("landing", "footerPricing")}</a></li>
                  <li><Link href="/login" className="hover:text-foreground transition-colors">{t("landing", "footerLogin")}</Link></li>
                  <li><Link href="/register" className="hover:text-foreground transition-colors">{t("landing", "footerRegister")}</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3">
                  {t("landing", "footerLegal")}
                </h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link href="/privacy-policy" className="hover:text-foreground transition-colors">{t("landing", "footerPrivacy")}</Link></li>
                  <li><Link href="/cookie-policy" className="hover:text-foreground transition-colors">{t("landing", "footerCookie")}</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-border text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} AISCAN &middot; NIMA Digital Consulting FZCO. {t("landing", "footerRights")}
          </div>
        </div>
      </footer>
    </main>
  );
}
