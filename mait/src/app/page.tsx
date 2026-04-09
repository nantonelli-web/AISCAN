import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Eye, BarChart3, Layers } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="flex-1">
      <section className="mx-auto max-w-6xl px-6 pt-24 pb-16">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold mb-6">
          <span className="h-px w-8 bg-gold" />
          NIMA Digital · Internal SaaS
        </div>
        <h1 className="text-5xl md:text-6xl font-serif tracking-tight max-w-3xl">
          Meta Ads <span className="text-gold">Intelligence</span> Tool.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Competitive intelligence, performance analytics e creative library
          per il team NIMA Digital. Monitora competitor, analizza creatività,
          presenta insight ai clienti.
        </p>
        <div className="mt-10 flex gap-3">
          <Button asChild size="lg">
            <Link href="/login">
              Accedi <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/register">Crea account</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 grid gap-6 md:grid-cols-3">
        <Feature
          icon={<Eye className="size-5 text-gold" />}
          title="Competitor Monitor"
          body="Scraping automatico delle ads attive dei competitor via Apify + Meta Ad Library."
        />
        <Feature
          icon={<Layers className="size-5 text-gold" />}
          title="Creative Library"
          body="Archivio searchable di tutte le creatività raccolte, con filtri e tag."
        />
        <Feature
          icon={<BarChart3 className="size-5 text-gold" />}
          title="Performance Analytics"
          body="KPI delle campagne gestite via Meta Marketing API, breakdown e benchmarking."
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
