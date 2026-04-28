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
  Search,
  FileBarChart,
  Globe,
} from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { MetaIcon } from "@/components/ui/meta-icon";
import { OAuthCodeHandler } from "@/components/auth/code-handler";
import { getLocale, serverT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

/* ─── Platform logos (inline SVG) ────────────────────────── */

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

import { creditPacks } from "@/config/pricing";

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
        <div className="mx-auto max-w-6xl px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="AISCAN" className="h-[67px]" />
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
      <section className="relative overflow-hidden">
        {/* Ambient glow effects */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gold/10 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute top-20 right-0 w-[400px] h-[400px] bg-gold/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gold/5 rounded-full blur-[100px] pointer-events-none" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(212,168,67,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(212,168,67,0.3) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-20">
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
        </div>
      </section>

      {/* ─── CHANNELS BAR ───────────────────────────────── */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Paid Ads */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center shrink-0">
                <MetaIcon className="size-5 text-gold" />
              </div>
              <div>
                <p className="text-sm font-medium">Meta Ads</p>
                <p className="text-xs text-muted-foreground">{t("landing", "channelPaid")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center shrink-0">
                <GoogleLogo className="size-5 text-gold" />
              </div>
              <div>
                <p className="text-sm font-medium">Google Ads</p>
                <p className="text-xs text-muted-foreground">{t("landing", "channelPaid")}</p>
              </div>
            </div>
            {/* Organic */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <div className="size-10 rounded-lg bg-gold/10 border border-gold/30 grid place-items-center shrink-0">
                <InstagramIcon className="size-5 text-gold" />
              </div>
              <div>
                <p className="text-sm font-medium">Instagram</p>
                <p className="text-xs text-muted-foreground">{t("landing", "channelOrganic")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ───────────────────────────────── */}
      <section id="how-it-works" className="relative overflow-hidden">
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-gold/5 rounded-full blur-[120px] pointer-events-none -translate-y-1/2" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
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
              { num: "01", icon: <Layers className="size-5" />, titleKey: "howStep1Title" as const, bodyKey: "howStep1Body" as const },
              { num: "02", icon: <Zap className="size-5" />, titleKey: "howStep2Title" as const, bodyKey: "howStep2Body" as const },
              { num: "03", icon: <Sparkles className="size-5" />, titleKey: "howStep3Title" as const, bodyKey: "howStep3Body" as const },
              { num: "04", icon: <BarChart3 className="size-5" />, titleKey: "howStep4Title" as const, bodyKey: "howStep4Body" as const },
            ]).map((step, i) => (
              <div key={step.num} className="relative group">
                {/* Connecting line between steps */}
                {i < 3 && (
                  <div className="hidden lg:block absolute top-6 left-full w-full h-px bg-gradient-to-r from-gold/30 to-transparent" />
                )}
                <div className="size-12 rounded-xl bg-gold/10 border border-gold/30 grid place-items-center text-gold mb-4 group-hover:bg-gold/20 transition-colors">
                  <span className="text-sm font-bold">{step.num}</span>
                </div>
                <h3 className="font-semibold mb-2">{t("landing", step.titleKey)}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("landing", step.bodyKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ───────────────────────────────────── */}
      <section className="bg-muted/30 border-y border-border relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-gold/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
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
                className="rounded-xl border border-border bg-card p-6 hover:border-gold/30 hover:shadow-[0_10px_40px_rgba(212,168,67,0.05)] transition-all duration-300"
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
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
          backgroundImage: "radial-gradient(circle at 2px 2px, #0e3590 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }} />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {([
              { icon: <Globe className="size-6" />, value: "3", label: t("landing", "metricsChannels") },
              { icon: <Sparkles className="size-6" />, value: "3", label: t("landing", "metricsAI") },
              { icon: <FileBarChart className="size-6" />, value: "PPTX & PDF", label: t("landing", "metricsReport") },
              { icon: <Search className="size-6" />, value: "CSV", label: t("landing", "metricsFormats") },
            ]).map((m) => (
              <div key={m.label} className="text-center">
                <div className="size-14 rounded-2xl bg-gold/10 border border-gold/30 grid place-items-center text-gold mx-auto mb-4">
                  {m.icon}
                </div>
                <div className="text-3xl md:text-4xl font-serif text-gold">{m.value}</div>
                <p className="mt-2 text-sm text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ────────────────────────────────────── */}
      <section id="pricing" className="bg-muted/30 border-y border-border relative overflow-hidden">
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gold/5 rounded-full blur-[150px] pointer-events-none" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-serif tracking-tight">
              {t("landing", "pricingTitle")}
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              {t("landing", "pricingSubtitle")}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {creditPacks.map((pack) => {
              const perCredit = (pack.priceUsd / pack.credits).toFixed(3);
              return (
                <div
                  key={pack.id}
                  className={`rounded-xl border p-6 flex flex-col transition-all duration-300 hover:shadow-[0_10px_40px_rgba(212,168,67,0.05)] ${
                    pack.popular
                      ? "border-gold bg-gold/5 ring-1 ring-gold/30"
                      : "border-border bg-card hover:border-gold/30"
                  }`}
                >
                  {pack.popular && (
                    <span className="text-[10px] uppercase tracking-wider text-gold font-semibold mb-3">
                      {t("landing", "pricingPopular")}
                    </span>
                  )}
                  <h3 className="text-lg font-semibold">{pack.name}</h3>
                  <div className="mt-3 mb-1">
                    <span className="text-4xl font-serif">${pack.priceUsd}</span>
                    <span className="text-sm text-muted-foreground"> {t("landing", "pricingOneTime")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    {pack.credits} {t("landing", "pricingCreditsLabel")} · ${perCredit}/credit
                  </p>
                  <ul className="space-y-2 mb-6 flex-1 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Check className="size-4 text-gold shrink-0 mt-0.5" />
                      <span>{t("landing", "pricingPerk1")}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="size-4 text-gold shrink-0 mt-0.5" />
                      <span>{t("landing", "pricingPerk2")}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="size-4 text-gold shrink-0 mt-0.5" />
                      <span>{t("landing", "pricingPerk3")}</span>
                    </li>
                  </ul>
                  <Button asChild variant={pack.popular ? "default" : "outline"} className="w-full">
                    <Link href="/register">{t("landing", "pricingCtaPaid")}</Link>
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-8 max-w-xl mx-auto">
            {t("landing", "pricingFreeNote")}
          </p>
        </div>
      </section>

      {/* ─── FINAL CTA ──────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gold/5 to-transparent pointer-events-none" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center">
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
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────────── */}
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.webp" alt="AISCAN" className="h-12" />
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
