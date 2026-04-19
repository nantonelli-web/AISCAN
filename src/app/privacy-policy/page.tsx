import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, serverT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export const metadata = {
  title: "Privacy Policy",
};

const content = {
  it: {
    title: "Privacy Policy",
    lastUpdated: "Ultimo aggiornamento: Aprile 2026",
    sections: [
      {
        title: "1. Introduzione",
        body: "NIMA Digital Consulting FZCO (\"NIMA Digital\", \"noi\", \"nostro\") rispetta la tua privacy e si impegna a proteggere i tuoi dati personali. Questa Privacy Policy spiega come raccogliamo, utilizziamo, divulghiamo e proteggiamo le tue informazioni quando visiti il sito aiscan.biz o utilizzi i nostri servizi. Utilizzando il nostro sito web, riconosci e accetti le pratiche descritte in questa policy.",
      },
      {
        title: "2. Titolare del trattamento",
        body: "Il soggetto responsabile del trattamento dei tuoi dati personali e':\n\nNIMA Digital Consulting FZCO\nLicenza: 67137\nBuilding A1, Dubai Digital Park, Dubai Silicon Oasis, Dubai, UAE\nEmail: info@nimadigital.ae",
      },
      {
        title: "3. Dati personali raccolti",
        body: "Possiamo raccogliere le seguenti categorie di dati personali:\n\n- Dati identificativi: nome, nome dell'azienda, posizione lavorativa\n- Dati di contatto: indirizzo email\n- Dati tecnici: indirizzo IP, tipo di browser, informazioni sul dispositivo, cookie\n- Dati di utilizzo: pagine visitate, interazioni, tempo trascorso sul sito\n- Dati di abbonamento: piano selezionato, storico crediti, dati di fatturazione",
      },
      {
        title: "4. Finalita' del trattamento e base giuridica",
        body: "Trattiamo i tuoi dati personali per le seguenti finalita':\n\n- Fornire e migliorare i nostri servizi (AISCAN - Ads Analysis Tool)\n- Gestire il tuo account, abbonamento e saldo crediti\n- Rispondere alle tue richieste\n- Inviare comunicazioni di servizio e aggiornamenti\n- Adempiere agli obblighi di legge\n- Garantire la sicurezza e prevenire frodi",
      },
      {
        title: "5. Conservazione dei dati",
        body: "Conserviamo i tuoi dati personali solo per il tempo necessario a soddisfare le finalita' per cui sono stati raccolti, salvo diversa previsione di legge. I dati relativi al tuo account vengono conservati per tutta la durata del rapporto contrattuale e successivamente per il periodo previsto dalla legge applicabile.",
      },
      {
        title: "6. Condivisione dei dati",
        body: "Possiamo condividere i tuoi dati personali con fornitori di servizi (Supabase per il database, Vercel per l'hosting, Stripe per i pagamenti, Apify per la raccolta dati pubblici, OpenRouter per l'analisi AI) e con autorita' pubbliche quando richiesto dalla legge. Non vendiamo i tuoi dati personali a terzi.",
      },
      {
        title: "7. Trasferimenti internazionali",
        body: "Laddove i dati personali vengano trasferiti al di fuori degli UAE, garantiamo che siano in atto adeguate misure di sicurezza in conformita' con gli standard stabiliti dal UAE Data Office.",
      },
      {
        title: "8. Cookie",
        body: "Il nostro sito web utilizza cookie strettamente necessari e cookie di funzionalita'. Per maggiori dettagli, consulta la nostra Cookie Policy.",
      },
      {
        title: "9. I tuoi diritti",
        body: "Ai sensi della legge UAE sulla protezione dei dati personali, hai il diritto di:\n\n- Richiedere l'accesso ai tuoi dati personali\n- Richiedere la rettifica di dati inesatti\n- Richiedere la cancellazione dei tuoi dati\n- Revocare il tuo consenso in qualsiasi momento\n- Richiedere la limitazione del trattamento\n- Richiedere la portabilita' dei dati\n- Presentare un reclamo al UAE Data Office",
      },
      {
        title: "10. Sicurezza dei dati",
        body: "Implementiamo misure tecniche e organizzative appropriate per proteggere i tuoi dati personali da perdita, uso improprio o accesso non autorizzato.",
      },
      {
        title: "11. Modifiche a questa policy",
        body: "Potremmo aggiornare questa Privacy Policy di tanto in tanto. Eventuali modifiche saranno pubblicate su questa pagina con una data di efficacia aggiornata.",
      },
      {
        title: "12. Contatti",
        body: "Per qualsiasi domanda relativa a questa Privacy Policy o al trattamento dei tuoi dati personali, contattaci all'indirizzo: info@nimadigital.ae",
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    lastUpdated: "Last updated: April 2026",
    sections: [
      {
        title: "1. Introduction",
        body: "NIMA Digital Consulting FZCO (\"NIMA Digital\", \"we\", \"our\", \"us\") respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit aiscan.biz or use our services. By using our website, you acknowledge and agree to the practices described in this policy.",
      },
      {
        title: "2. Data Controller",
        body: "The entity responsible for processing your personal data is:\n\nNIMA Digital Consulting FZCO\nLicense: 67137\nBuilding A1, Dubai Digital Park, Dubai Silicon Oasis, Dubai, UAE\nEmail: info@nimadigital.ae",
      },
      {
        title: "3. Personal Data Collected",
        body: "We may collect the following categories of personal data:\n\n- Identity Data: name, company name, job position\n- Contact Data: email address\n- Technical Data: IP address, browser type, device information, cookies\n- Usage Data: pages visited, interactions, time spent on site\n- Subscription Data: selected plan, credit history, billing data",
      },
      {
        title: "4. Processing Purposes & Legal Basis",
        body: "We process your personal data for the following purposes:\n\n- To provide and improve our services (AISCAN - Ads Analysis Tool)\n- To manage your account, subscription and credit balance\n- To respond to your inquiries and requests\n- To send service communications and updates\n- To comply with legal obligations\n- To ensure security and prevent fraud",
      },
      {
        title: "5. Data Retention",
        body: "We retain your personal data only for as long as necessary to fulfill the purposes for which it was collected, unless a longer retention period is required by law. Account data is retained for the duration of the contractual relationship and subsequently for the period required by applicable law.",
      },
      {
        title: "6. Data Sharing",
        body: "We may share your personal data with service providers (Supabase for database, Vercel for hosting, Stripe for payments, Apify for public data collection, OpenRouter for AI analysis) and with public authorities when legally required. We do not sell your personal data to third parties.",
      },
      {
        title: "7. International Transfers",
        body: "Where personal data is transferred outside the UAE, we ensure appropriate safeguards are in place in accordance with the standards set by the UAE Data Office.",
      },
      {
        title: "8. Cookies",
        body: "Our website uses strictly necessary cookies and functionality cookies. For more details, please refer to our Cookie Policy.",
      },
      {
        title: "9. Your Rights",
        body: "Under the UAE Personal Data Protection Law, you have the right to:\n\n- Request access to your personal data\n- Request correction of inaccurate data\n- Request deletion of your data\n- Withdraw your consent at any time\n- Request restriction of processing\n- Request data portability\n- Lodge a complaint with the UAE Data Office",
      },
      {
        title: "10. Data Security",
        body: "We implement appropriate technical and organizational measures to protect your personal data against loss, misuse, or unauthorized access.",
      },
      {
        title: "11. Changes to This Policy",
        body: "We may update this Privacy Policy from time to time. Any changes will be posted on this page with a revised effective date.",
      },
      {
        title: "12. Contact",
        body: "For any questions regarding this Privacy Policy or the processing of your personal data, please contact us at: info@nimadigital.ae",
      },
    ],
  },
};

export default async function PrivacyPolicyPage() {
  const locale = await getLocale();
  const t = serverT(locale);
  const c = locale === "it" ? content.it : content.en;

  return (
    <main className="flex-1">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="AISCAN" className="h-14" />
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
