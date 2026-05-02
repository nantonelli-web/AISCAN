import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, serverT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export const metadata = {
  title: "Cookie Policy",
};

const content = {
  it: {
    title: "Cookie Policy",
    lastUpdated: "Ultimo aggiornamento: Aprile 2026",
    sections: [
      {
        title: "Informativa sui cookie",
        body: "Questa pagina descrive i tipi di cookie utilizzati su aiscan.biz e le loro finalita'. Puoi abilitare o disabilitare i cookie secondo le tue preferenze.",
      },
      {
        title: "Cosa sono i cookie",
        body: "I cookie sono piccole stringhe di testo che un sito web invia al tuo dispositivo (generalmente al browser), dove vengono memorizzati e poi trasmessi nuovamente allo stesso sito alla visita successiva (cookie di prima parte). Il sito puo' anche contenere cookie di terze parti provenienti da server esterni.",
      },
      {
        title: "Tipi di cookie",
        body: "I cookie possono essere di sessione (cancellati alla chiusura del browser) o persistenti (rimangono fino alla loro data di scadenza). Servono a diverse funzioni:\n\n- Cookie tecnici: abilitano la navigazione e le funzionalita' essenziali del sito\n- Cookie di funzionalita': memorizzano le tue preferenze (es. lingua selezionata)",
      },
      {
        title: "Cookie utilizzati su questo sito",
        body: "Questo sito web utilizza i seguenti cookie:\n\n- mait-locale (Tecnico): memorizza la preferenza di lingua selezionata (IT/EN)\n- sb-* (Tecnico): cookie di sessione Supabase per l'autenticazione utente\n\nNon utilizziamo cookie di analytics o di marketing.",
      },
      {
        title: "Come disabilitare i cookie",
        body: "Puoi gestire le tue preferenze sui cookie tramite le impostazioni del tuo browser. La maggior parte dei browser ti consente di rifiutare o accettare i cookie, eliminare i cookie esistenti e impostare preferenze per determinati siti web.\n\nTieni presente che la disabilitazione dei cookie tecnici potrebbe compromettere il funzionamento del sito.",
      },
      {
        title: "I tuoi diritti",
        body: "Puoi esercitare i tuoi diritti richiedendo la conferma dei dati, l'accesso, la cancellazione, la rettifica, l'anonimizzazione o la limitazione del trattamento.\n\nPer qualsiasi richiesta, contattaci all'indirizzo: info@nimadigital.ae",
      },
    ],
  },
  en: {
    title: "Cookie Policy",
    lastUpdated: "Last updated: April 2026",
    sections: [
      {
        title: "Cookie Notice",
        body: "This page describes the types of cookies used on aiscan.biz and their purposes. You may enable or disable cookies according to your preferences.",
      },
      {
        title: "What Are Cookies",
        body: "Cookies are small text strings that a website sends to your device (usually the browser), where they are stored and then transmitted back to the same website upon your next visit (first-party cookies). The site may also contain third-party cookies from external servers.",
      },
      {
        title: "Types of Cookies",
        body: "Cookies can be session-based (deleted when the browser is closed) or persistent (remain until their expiration date). They serve different functions:\n\n- Technical cookies: enable browsing and essential site functionality\n- Functionality cookies: store your preferences (e.g., selected language)",
      },
      {
        title: "Cookies Used on This Site",
        body: "This website uses the following cookies:\n\n- mait-locale (Technical): stores the selected language preference (IT/EN)\n- sb-* (Technical): Supabase session cookies for user authentication\n\nWe do not use analytics or marketing cookies.",
      },
      {
        title: "How to Disable Cookies",
        body: "You can manage your cookie preferences through your browser settings. Most browsers allow you to refuse or accept cookies, delete existing cookies, and set preferences for certain websites.\n\nPlease note that disabling technical cookies may affect the functionality of the site.",
      },
      {
        title: "Your Rights",
        body: "You may exercise your rights by requesting data confirmation, access, deletion, correction, anonymization, or processing restrictions.\n\nFor any requests, please contact us at: info@nimadigital.ae",
      },
    ],
  },
};

export default async function CookiePolicyPage() {
  const locale = await getLocale();
  const t = serverT(locale);
  const c = locale === "it" ? content.it : content.en;

  return (
    <main className="flex-1">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="AISCAN" className="h-[80px]" />
          </Link>
          <LanguageSwitcher />
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="size-4" /> Home
        </Link>

        <h1 className="text-3xl font-serif tracking-tight mb-2">{c.title}</h1>
        <p className="text-sm text-muted-foreground mb-12">{c.lastUpdated}</p>

        <div className="space-y-8">
          {c.sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-lg font-semibold mb-3">{section.title}</h2>
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {section.body}
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-4xl px-6 py-6 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} AISCAN &middot; NIMA Digital Consulting FZCO. {t("landing", "footerRights")}
        </div>
      </footer>
    </main>
  );
}
