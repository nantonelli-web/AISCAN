/**
 * AI analysis del dashboard Adv Performance.
 *
 * Prende il payload aggregato del dashboard (KPI, top campaigns,
 * countries, campaign types, creatives, ecc) e produce per ogni
 * "sezione" del dashboard un blocco di testo discorsivo che spiega
 * il dato + lo motiva con best practice del paid advertising.
 *
 * Modello: stessi tier di /brands/compare (cheap/pragmatic/premium)
 * via OpenRouter. Pragmatic e' il default consigliato (Claude Haiku
 * 4.5 — ottimo italiano + costo basso).
 */

import { getOpenRouterCredentials } from "@/lib/billing/credentials";
import type { PerfDashboardData } from "@/types/perf";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type PerfModelTier = "cheap" | "pragmatic" | "premium";

export const PERF_DEFAULT_TIER: PerfModelTier = "pragmatic";

/** Default fallback (usato dal route se per qualche motivo non si
 *  riesce a risolvere un modello dal catalogo mait_ai_models). */
export const PERF_DEFAULT_OPENROUTER_ID = "anthropic/claude-haiku-4.5";

/** Sezioni di analisi disponibili. Ogni sezione corrisponde a un
 *  blocco visuale del dashboard. La generazione one-shot include
 *  solo le sezioni che hanno dati (es. "purchases" mancante se
 *  k.purchases === 0, "objective" mancante se Meta non ha
 *  popolato la column). */
export const PERF_SECTIONS = [
  "overview",
  "purchases",
  "engagement",
  "timeSeries",
  "topCampaigns",
  "campaignTypes",
  "countries",
  "creatives",
  "adNames",
  "objective",
] as const;
export type PerfSection = (typeof PERF_SECTIONS)[number];

export interface PerfAnalysisOutput {
  /** Map section → testo discorsivo. Sezioni assenti = non
   *  generate (perche' non ci sono dati o LLM non le ha incluse). */
  sections: Partial<Record<PerfSection, string>>;
  modelId: string;
}

/* ─── Prompt building ─────────────────────────────────────── */

/** Ritorna le sezioni applicabili dato il payload (skippa quelle
 *  vuote per non far generare testo su nulla). */
export function applicableSections(data: PerfDashboardData): PerfSection[] {
  const k = data.current;
  const out: PerfSection[] = ["overview"];
  if (k.purchases > 0) out.push("purchases");
  if (
    k.postEngagements > 0 ||
    k.instagramProfileVisits > 0 ||
    k.instagramFollows > 0
  ) {
    out.push("engagement");
  }
  if (data.timeSeries.length > 0) out.push("timeSeries");
  if (data.topByCampaignSpend.length > 0) out.push("topCampaigns");
  if (data.campaignTypes.length > 0) out.push("campaignTypes");
  if (
    data.countries.length > 0 &&
    !(data.countries.length === 1 && data.countries[0].code === "UNKNOWN")
  ) {
    out.push("countries");
  }
  if (
    data.creativeTypeMix.length > 0 ||
    data.creativeCountByType.length > 0
  ) {
    out.push("creatives");
  }
  if (data.adNameMix.length > 0) out.push("adNames");
  if (
    data.objectiveMix.length > 0 &&
    data.objectiveMix.some((o) => o.name && o.name !== "—")
  ) {
    out.push("objective");
  }
  return out;
}

const SECTION_DESCR_IT: Record<PerfSection, string> = {
  overview:
    "Panoramica metriche del periodo (spesa, impressioni, click, reach, CTR, CPM, CPC, frequenza). Spiega in modo discorsivo cosa raccontano questi numeri nel loro insieme: scala dell'investimento, qualita' del traffico, efficienza media. Non riassumere tutto KPI per KPI; estrai il significato.",
  purchases:
    "Acquisti, costo per acquisto, ROAS. Spiega la performance commerciale: e' un volume buono per il livello di spesa? Il CPP e' alto/basso rispetto a benchmark di settore? Il ROAS dice se l'investimento e' ripagato. Se ROAS = 0 significa che il purchase value non e' tracciato — segnalalo.",
  engagement:
    "Post engagements + visite profilo Instagram + nuovi follower IG. Spiega l'efficacia dell'ad come asset organic-extender: quanto traffico verso l'ecosistema social del brand, qual e' la conversion dal click ad ad → engagement organico.",
  timeSeries:
    "Andamento giornaliero di spesa e impressioni. Identifica i picchi, i flessi, eventuali pattern (weekend vs feriali, eventi marketing che si vedono nei dati). Non descrivere giorno per giorno: dai la lettura del trend.",
  topCampaigns:
    "Top campagne per spesa (e per ROAS quando presenti). Identifica quali campagne reggono il budget, se c'e' concentrazione o distribuzione, eventuali outliers che vale la pena ottimizzare o pausare.",
  campaignTypes:
    "Tipologia campagna decodificata dal nome (VC, ATC, PUR, ENG, ecc). Spesa, risultati e CPR per tipologia. Spiega quale tipo di obiettivo sta consumando di piu' e con che efficienza, e se la mix risulta coerente con il funnel.",
  countries:
    "Distribuzione spesa, impressioni, click e acquisti per paese. Spiega dove si concentra l'investimento, dove c'e' il miglior return, se ci sono paesi con spesa alta ma conversion bassa.",
  creatives:
    "Distribuzione tipo creativita' (image / video / carousel / collection) per spesa + numero medio di asset attivi per settimana. Spiega che mix creativo e' adottato e se e' coerente con un funnel sano (es. video per awareness, image per remarketing).",
  adNames:
    "Performance per singola creativita' (campo Ad name). Spesa, click, impression, CTR e acquisti aggregati per asset, con quota % sul totale. Identifica le creativita' top-spender, valuta se la concentrazione e' sana o se poche creative monopolizzano il budget, segnala outlier per CTR/CPA e suggerisci test/scaling/pause coerenti.",
  objective:
    "Distribuzione spesa per obiettivo della campagna (sales, traffic, awareness, ecc). Spiega la coerenza con il funnel del brand.",
};

const SECTION_DESCR_EN: Record<PerfSection, string> = {
  overview:
    "Period KPI overview (spend, impressions, clicks, reach, CTR, CPM, CPC, frequency). Explain narratively what these numbers say together: investment scale, traffic quality, average efficiency. Don't recap KPI by KPI; extract the meaning.",
  purchases:
    "Purchases, cost per purchase, ROAS. Comment on commercial performance: is volume good for the spend level? Is CPP high/low vs industry benchmarks? ROAS tells whether investment is paid back. If ROAS = 0 it means purchase value isn't tracked — flag it.",
  engagement:
    "Post engagements + Instagram profile visits + new IG follows. Explain the ad's efficacy as an organic-extender asset: how much traffic to the brand's social ecosystem, what's the conversion from ad-click to organic engagement.",
  timeSeries:
    "Daily spend and impressions trend. Identify peaks, dips, possible patterns (weekend vs weekday, marketing events showing in the data). Don't describe day-by-day: give the trend reading.",
  topCampaigns:
    "Top campaigns by spend (and by ROAS when present). Identify which campaigns hold the budget, whether there's concentration or distribution, outliers worth optimising or pausing.",
  campaignTypes:
    "Campaign type decoded from the name (VC, ATC, PUR, ENG, etc). Spend, results and CPR per type. Comment on which objective is consuming the most and at what efficiency, and whether the mix is funnel-coherent.",
  countries:
    "Spend, impressions, clicks and purchases breakdown by country. Comment on where investment concentrates, where return is best, whether some countries have high spend but low conversion.",
  creatives:
    "Creative type breakdown (image / video / carousel / collection) by spend + average number of active assets per week. Comment on the creative mix and whether it's funnel-coherent (e.g. video for awareness, image for remarketing).",
  adNames:
    "Per-creative performance (Ad name field). Spend, clicks, impressions, CTR and purchases aggregated by asset, with % share of total. Identify top-spending creatives, judge whether the concentration is healthy or whether a few creatives monopolise budget, flag CTR/CPA outliers and suggest scaling/pausing/testing accordingly.",
  objective:
    "Spend distribution by campaign objective (sales, traffic, awareness, etc). Comment on coherence with the brand's funnel.",
};

/** Costruisce il payload "compatto" del dashboard per il prompt.
 *  Limitiamo top campagne a 10 + facciamo round dei numeri per
 *  ridurre token usage senza perdere significato. */
function buildDashboardSnapshot(data: PerfDashboardData): string {
  const k = data.current;
  const cur = data.currency ?? "";
  const lines: string[] = [];

  lines.push(`PERIODO: ${data.periodFrom} → ${data.periodTo}`);
  if (data.weekCurrent) lines.push(`SETTIMANA CORRENTE FILTRATA: ${data.weekCurrent}`);
  lines.push(`CURRENCY: ${cur || "—"}`);

  lines.push("\n=== KPI ===");
  lines.push(`spesa: ${k.amountSpent} ${cur}`);
  lines.push(`impressioni: ${k.impressions}`);
  lines.push(`reach (= impressioni / frequenza): ${k.reach}`);
  lines.push(`click effettivi: ${k.effectiveClicks}`);
  lines.push(`CTR effettivo: ${k.effectiveCtr}%`);
  lines.push(`CPM: ${k.cpm} ${cur}`);
  lines.push(`CPC effettivo: ${k.effectiveCpc} ${cur}`);
  lines.push(`frequenza media: ${k.frequency}`);
  lines.push(`# campagne uniche: ${k.uniqueCampaigns}`);
  lines.push(`# ad set unici: ${k.uniqueAdSets}`);
  lines.push(`# annunci unici: ${k.uniqueAds}`);

  if (k.purchases > 0) {
    lines.push("\n=== PURCHASES ===");
    lines.push(`acquisti: ${k.purchases}`);
    lines.push(`purchase value: ${k.purchaseValue} ${cur}`);
    lines.push(`costo per acquisto: ${k.costPerPurchase} ${cur}`);
    lines.push(`ROAS: ${k.roas ?? 0}`);
  }
  if (
    k.postEngagements > 0 ||
    k.instagramProfileVisits > 0 ||
    k.instagramFollows > 0
  ) {
    lines.push("\n=== ENGAGEMENT ===");
    lines.push(`post engagement: ${k.postEngagements}`);
    lines.push(`IG profile visits: ${k.instagramProfileVisits}`);
    lines.push(`IG follows: ${k.instagramFollows}`);
  }

  if (data.timeSeries.length > 0) {
    lines.push("\n=== TIME SERIES (giornaliero) ===");
    for (const t of data.timeSeries.slice(0, 60)) {
      lines.push(
        `${t.date}: spend=${t.spend}, imp=${t.impressions}, click=${t.clicks}, results=${t.results}`,
      );
    }
  }

  if (data.topByCampaignSpend.length > 0) {
    lines.push("\n=== TOP CAMPAIGNS (per spesa, top 10) ===");
    for (const c of data.topByCampaignSpend.slice(0, 10)) {
      lines.push(
        `${c.campaign_name} | spend=${c.spend} ${cur}, imp=${c.impressions}, click=${c.clicks}, roas=${c.roas ?? 0}`,
      );
    }
  }

  if (data.campaignTypes.length > 0) {
    lines.push("\n=== CAMPAIGN TYPES ===");
    for (const t of data.campaignTypes) {
      lines.push(
        `${t.code} (${t.label}) | camp=${t.campaignCount}, spend=${t.spend} ${cur}, results=${t.resultCount}, CPR=${t.cpr ?? "—"}, purchases=${t.purchases}`,
      );
    }
  }

  if (
    data.countries.length > 0 &&
    !(data.countries.length === 1 && data.countries[0].code === "UNKNOWN")
  ) {
    lines.push("\n=== COUNTRIES ===");
    for (const c of data.countries) {
      lines.push(
        `${c.code} (${c.label}) | spend=${c.spend} ${cur}, imp=${c.impressions}, click=${c.clicks}, purchases=${c.purchases}, # campagne=${c.campaignCount}`,
      );
    }
  }

  if (data.creativeTypeMix.length > 0) {
    lines.push("\n=== CREATIVE TYPE MIX (spesa) ===");
    for (const c of data.creativeTypeMix) {
      lines.push(`${c.name}: ${c.value} ${cur}`);
    }
  }
  if (data.creativeCountByType.length > 0) {
    lines.push(
      `\n=== CREATIVE COUNT (${data.creativeCountLabel}) ===`,
    );
    for (const c of data.creativeCountByType) {
      lines.push(`${c.name}: ${c.count}`);
    }
  }

  if (data.adNameMix.length > 0) {
    lines.push("\n=== AD NAME MIX (per ad_name, top 20 per spesa) ===");
    for (const c of data.adNameMix.slice(0, 20)) {
      lines.push(
        `${c.name} | spend=${c.value} ${cur}, clicks=${c.clicks}, imp=${c.impressions}, CTR=${c.ctr ?? "—"}%, purchases=${c.purchases}`,
      );
    }
  }

  if (
    data.objectiveMix.length > 0 &&
    data.objectiveMix.some((o) => o.name && o.name !== "—")
  ) {
    lines.push("\n=== OBJECTIVE MIX (spesa) ===");
    for (const o of data.objectiveMix) {
      lines.push(`${o.name}: ${o.value} ${cur}`);
    }
  }

  return lines.join("\n");
}

/** Calcola gli "obiettivi dichiarati" delle campagne nel periodo
 *  e identifica le metriche che NON sono obiettivo di nessuna
 *  campagna (= side benefit). Questa info finisce nel prompt cosi
 *  il modello commenta positivamente i side benefit invece di
 *  giudicarli criticamente come scarsi. */
function buildObjectivesContext(
  data: PerfDashboardData,
  locale: "it" | "en",
): string {
  const types = data.campaignTypes;
  if (types.length === 0) return "";
  const codes = new Set(types.map((t) => t.code));

  const isPurchaseObjective = codes.has("PURCHASE") || codes.has("PUR") || codes.has("PURCH");
  const isIgFollowObjective =
    codes.has("IGFOLLOW") || codes.has("IGFOLLOWS");
  const isIgVisitObjective =
    codes.has("IGVISIT") || codes.has("IGVISITS");
  const isEngagementObjective =
    codes.has("ENG") || codes.has("ENGAGEMENT") || codes.has("POSTENG");

  if (locale === "en") {
    const labels = types
      .map((t) => `${t.code} (${t.label}) — ${t.campaignCount} campaigns`)
      .join("; ");
    const flags: string[] = [];
    flags.push(
      `- purchases: ${isPurchaseObjective ? "DIRECT OBJECTIVE of at least one campaign" : "SIDE BENEFIT — no campaign has 'PURCHASE' as decoded type; recorded purchases are extra vs the declared objective"}`,
    );
    flags.push(
      `- IG follows: ${isIgFollowObjective ? "DIRECT OBJECTIVE" : "SIDE BENEFIT — no campaign aims to grow IG followers"}`,
    );
    flags.push(
      `- IG profile visits: ${isIgVisitObjective ? "DIRECT OBJECTIVE" : "SIDE BENEFIT — no campaign aims to drive traffic to the IG profile"}`,
    );
    flags.push(
      `- post engagement (likes/comments/shares): ${isEngagementObjective ? "DIRECT OBJECTIVE" : "SIDE BENEFIT — organic engagement is 'on top' of the actual paid objectives"}`,
    );
    return `\n=== CAMPAIGN OBJECTIVES ===\nTypes active in the period: ${labels}\n\nMETRIC CLASSIFICATION:\n${flags.join("\n")}\n`;
  }

  const labels = types
    .map((t) => `${t.code} (${t.label}) — ${t.campaignCount} campagne`)
    .join("; ");
  const flags: string[] = [];
  flags.push(
    `- acquisti (purchases): ${isPurchaseObjective ? "OBIETTIVO DIRETTO di almeno una campagna" : "SIDE BENEFIT — nessuna campagna ha 'PURCHASE' come tipo decoded; gli acquisti registrati sono extra rispetto all'obiettivo dichiarato"}`,
  );
  flags.push(
    `- IG follows: ${isIgFollowObjective ? "OBIETTIVO DIRETTO" : "SIDE BENEFIT — nessuna campagna mira a far crescere i follower IG"}`,
  );
  flags.push(
    `- IG profile visits: ${isIgVisitObjective ? "OBIETTIVO DIRETTO" : "SIDE BENEFIT — nessuna campagna mira a portare traffico al profilo IG"}`,
  );
  flags.push(
    `- post engagement (like/commenti/share): ${isEngagementObjective ? "OBIETTIVO DIRETTO" : "SIDE BENEFIT — l'engagement organico arriva 'on top' agli obiettivi reali del paid"}`,
  );
  return `\n=== OBIETTIVI DELLE CAMPAGNE ===\nTipologie attive nel periodo: ${labels}\n\nCLASSIFICAZIONE METRICHE:\n${flags.join("\n")}\n`;
}

function buildPrompt(
  data: PerfDashboardData,
  sections: PerfSection[],
  locale: "it" | "en",
  channel: "meta" | "snapchat" | "google" | "tiktok",
): string {
  const section_descr = locale === "it" ? SECTION_DESCR_IT : SECTION_DESCR_EN;
  const sectionList = sections
    .map((s) => `- ${s}: ${section_descr[s]}`)
    .join("\n");
  const ch =
    CHANNEL_PROMPT_INFO[channel] ?? CHANNEL_PROMPT_INFO.meta;
  const chBenchmarks = ch.benchmarks[locale];
  const objectivesContext = buildObjectivesContext(data, locale);
  const snapshot = buildDashboardSnapshot(data);

  if (locale === "en") {
    return `You are a senior marketing analyst specialised in paid advertising. You are analysing performance data from **${ch.name}** campaigns for a brand. Important: reason using the correct platform's benchmarks — DO NOT apply benchmarks from other platforms (e.g. do not compare Snapchat CPM to Meta benchmarks).

PLATFORM AND CONTEXT:
${chBenchmarks}
${objectivesContext}
PERIOD DATA (labels may be in Italian — translate them naturally in your English narrative):
${snapshot}

CONTENT INSTRUCTIONS:
1. For each section listed below, write a discursive analysis **in English**. Professional but not rigid tone — not academic, not generic-AI. Every sentence must carry information weight: zero fluff, zero fillers ("As you can see", "It's important to note").
2. Explain what the data means in concrete marketing terms, and MOTIVATE why the metric sits where it does. Cite the payload number to anchor the reading, but don't just repeat it: explain it. When ROAS=0 or purchase_value=0, flag it as "conversion tracking not configured" and explain how to address it.
3. **WEIGH THE CAMPAIGN OBJECTIVE — CRITICAL RULE**: before judging a metric, read the CAMPAIGN OBJECTIVES section at the top of the payload. If the metric is classified as SIDE BENEFIT (no campaign in the period had that as its declared objective), the comment must be POSITIVE — the numbers are added value "on top" of the real objective, not a funnel to judge in absolute efficiency. If the metric is DIRECT OBJECTIVE, evaluate it critically vs benchmarks.
   - CORRECT example (SIDE BENEFIT): "The funnel did not target the IG profile, yet the campaigns generated **1,803 visits and 90 new follows** as a side effect. These are brand-lift numbers extra vs the commercial objectives (ATC/VC), an added value not to be underestimated."
   - WRONG example (DO NOT do this): "Only 90 follows on 105k engagement: the conversion funnel isn't working" — wrong because it treats a side-benefit metric as an objective to optimise.
4. When relevant, include an OPERATIONAL RECOMMENDATION based on paid-advertising best practices (e.g. A/B test on best creative, budget shift, pause under-performing campaigns, frequency capping if >3, etc). The recommendation must be concrete, actionable, and coherent with the campaign objective (don't suggest "optimise the follow funnel" if no campaign targets follows).
5. Length varies with how much there is to say — don't pad. A section with little to say may be 2-3 sentences; a rich one may be 5-8.
6. Do not invent numbers. Cite only figures present in the payload. If a value is missing, don't fill in (e.g. ROAS without purchase value).

FORMATTING INSTRUCTIONS (important for readability):
7. SPLIT the text into distinct PARAGRAPHS separated by a blank line (\\n\\n). Each paragraph = one point. Typical: paragraph 1 = data reading; paragraph 2 = motivation/explanation; paragraph 3 = operational recommendation. No single wall of text.
8. Use markdown **bold** to highlight:
   - key metrics and relevant numbers (e.g. **CPC 0.45 AED**, **ROAS 1.8**)
   - important conclusions (e.g. **room for CTR improvement**)
   - operational recommendations (first sentence of each recommendation)
   Don't overuse it: 2-4 bolds per paragraph max, only where they truly guide the eye.
9. When proposing MULTIPLE distinct ACTIONS, use a dashed list (one action per line, line starting with "- "). Keep entries compact (max one sentence each).
10. NO markdown headings (#, ##), no \`code\`, no links, no tables. Only paragraphs, **bold**, and "- " lists.

SECTIONS TO GENERATE:
${sectionList}

OUTPUT: reply ONLY with valid JSON in the form:
{
${sections.map((s) => `  "${s}": "..."`).join(",\n")}
}

No markdown wrapping (\`\`\`json), no preamble, no postamble. Each key's value is a string with paragraphs separated by \\n\\n, optional **bold** markdown, and "- " lists. Write all narrative content **in English**.`;
  }

  return `Sei un analista marketing senior specializzato in paid advertising. Stai analizzando dati di performance di campagne **${ch.name}** per un brand. Importante: ragiona usando i benchmark della piattaforma corretta — NON applicare benchmark di altre piattaforme (es. non confrontare CPM Snapchat con benchmark Meta).

PIATTAFORMA E CONTESTO:
${chBenchmarks}
${objectivesContext}
DATI DEL PERIODO ANALIZZATO:
${snapshot}

ISTRUZIONI DI CONTENUTO:
1. Per ognuna delle sezioni elencate sotto, scrivi un'analisi discorsiva **in italiano**. Tono professionale ma non rigido — non scolastico, non da AI generica. Ogni frase deve avere un peso informativo: zero fuffa, zero filler ("Come si puo' notare", "E' importante sottolineare").
2. Spiega cosa significa il dato in termini di marketing concreti, e MOTIVA perche' la metrica si trova in quella zona di valore. Cita il numero del payload per ancorare la lettura, ma non duplicarlo: spiegalo. Quando hai ROAS=0 o purchase_value=0, segnalalo come "tracking conversion non configurato" e spiega come affrontare la cosa.
3. **PESA L'OBIETTIVO DELLE CAMPAGNE — REGOLA CRITICA**: prima di giudicare una metrica, leggi la sezione OBIETTIVI DELLE CAMPAGNE in cima al payload. Se la metrica e' classificata SIDE BENEFIT (nessuna campagna nel periodo aveva quell'obiettivo dichiarato), il commento deve essere POSITIVO — i numeri sono valore aggiunto "on top" rispetto all'obiettivo reale, non un funnel da giudicare in efficienza assoluta. Se la metrica e' OBIETTIVO DIRETTO, valutala criticamente vs benchmark.
   - Esempio CORRETTO (SIDE BENEFIT): "Il funnel non puntava al profilo IG, eppure le campagne hanno generato **1.803 visite e 90 nuovi follow** come effetto collaterale. Sono numeri di brand-lift extra rispetto agli obiettivi commerciali (ATC/VC), un valore aggiunto da non sottovalutare."
   - Esempio SBAGLIATO (da NON FARE): "Solo 90 follow su 105k engagement: il funnel di conversione non sta funzionando" — sbagliato perche' tratta una metrica side-benefit come se fosse un obiettivo da ottimizzare.
4. Quando rilevante, integra una RACCOMANDAZIONE OPERATIVA basata su best practice del paid (es. test A/B sulla creativity migliore, shift budget, pausa campagne sotto-performanti, frequency capping se >3, ecc). La raccomandazione deve essere concreta e azionabile, e coerente con l'obiettivo della campagna (non suggerire di "ottimizzare il funnel di follow" se nessuna campagna mira ai follow).
5. La lunghezza varia in base alla profondita' del dato — non gonfiare. Una sezione con poco da dire puo' essere 2-3 frasi; una sezione ricca puo' essere 5-8.
6. Non inventare numeri. Cita solo cifre presenti nel payload. Se manca un dato, non riempire (es. ROAS senza purchase value).

ISTRUZIONI DI FORMATTAZIONE (importanti per la leggibilita'):
7. SCANDISCI il testo in PARAGRAFI distinti separati da una riga vuota (\\n\\n). Ogni paragrafo = un punto. Tipico: paragrafo 1 = lettura del dato; paragrafo 2 = motivazione/spiegazione; paragrafo 3 = raccomandazione operativa. Niente muro di testo unico.
8. Usa il GRASSETTO markdown **testo** per evidenziare:
   - metriche chiave e numeri rilevanti (es. **CPC 0,45 AED**, **ROAS 1,8**)
   - conclusioni importanti (es. **margine di miglioramento sul CTR**)
   - le raccomandazioni operative (la prima frase di ogni raccomandazione)
   Non abusarne: 2-4 grassetti per paragrafo al massimo, solo dove guidano davvero l'occhio.
9. Quando proponi PIU' AZIONI distinti, usa una lista con trattini (una azione per riga, riga che inizia con "- "). Tieni le voci compatte (max una frase ciascuna).
10. NIENTE titoli markdown (#, ##), niente \`code\`, niente link, niente tabelle. Solo paragrafi, **bold** e liste con "- ".

SEZIONI DA GENERARE:
${sectionList}

OUTPUT: rispondi SOLO con un JSON valido nella forma:
{
${sections.map((s) => `  "${s}": "..."`).join(",\n")}
}

Niente markdown wrapping (\`\`\`json), niente preamble, niente postamble. Il valore di ogni chiave e' una stringa con paragrafi separati da \\n\\n, eventuali **bold** markdown e liste con "- ". Scrivi tutto il contenuto narrativo **in italiano**.`;
}

/* ─── OpenRouter call ────────────────────────────────────── */

interface RunOptions {
  workspaceId: string;
  data: PerfDashboardData;
  sections: PerfSection[];
  /** OpenRouter model id (es. 'anthropic/claude-haiku-4.5'). Passato
   *  dal route dopo lookup in mait_ai_models. */
  modelOpenrouterId: string;
  locale: "it" | "en";
  /** Canale advertising — guida il prompt per benchmark e contesto
   *  corretti (es. CTR Snapchat ≠ Meta). */
  channel: "meta" | "snapchat" | "google" | "tiktok";
}

/** Etichette descrittive per il prompt — il modello deve sapere
 *  CHE PIATTAFORMA sta analizzando per non citare benchmark
 *  sbagliati o feature non disponibili. */
const CHANNEL_PROMPT_INFO: Record<
  string,
  { name: string; benchmarks: { it: string; en: string } }
> = {
  meta: {
    name: "Meta Ads (Facebook + Instagram)",
    benchmarks: {
      it: "Benchmark di riferimento Meta: CTR medio 1-2% su feed/stories, CPM tipico 5-15$ in mercati maturi, frequenza ottimale <3, ROAS sano >2 per e-commerce. La piattaforma offre Reach/Frequency esposti, fenomeno di ad fatigue dopo frequency >3.",
      en: "Meta reference benchmarks: average CTR 1-2% on feed/stories, typical CPM 5-15$ in mature markets, optimal frequency <3, healthy ROAS >2 for e-commerce. The platform exposes Reach/Frequency, ad-fatigue phenomenon kicks in after frequency >3.",
    },
  },
  snapchat: {
    name: "Snapchat Ads",
    benchmarks: {
      it: "Benchmark di riferimento Snapchat: CTR medio 1-3% (piu' alto di Meta grazie al formato full-screen), CPM tipico 2-8$ (piu' basso di Meta), audience predominante 13-34 anni. Snapchat NON espone Reach o Frequency nei dati per riga, e il funnel commerciale e' meno maturo di Meta — non confrontare i KPI con benchmark Meta. Le campagne Traffic puntano alle Landing Page Views, le Sales agli Adds To Cart e Purchases.",
      en: "Snapchat reference benchmarks: average CTR 1-3% (higher than Meta thanks to the full-screen format), typical CPM 2-8$ (lower than Meta), predominant audience 13-34 years old. Snapchat does NOT expose Reach or Frequency in per-row data, and the commercial funnel is less mature than Meta — do not compare KPIs to Meta benchmarks. Traffic campaigns target Landing Page Views, Sales campaigns target Adds To Cart and Purchases.",
    },
  },
  google: {
    name: "Google Ads",
    benchmarks: {
      it: "Benchmark di riferimento Google: CTR Search 3-5%, CTR Display 0.5-1%, Quality Score, Impression Share, ROAS dipende dalla parola chiave.",
      en: "Google reference benchmarks: Search CTR 3-5%, Display CTR 0.5-1%, Quality Score, Impression Share, ROAS depends on the keyword.",
    },
  },
  tiktok: {
    name: "TikTok Ads",
    benchmarks: {
      it: "Benchmark di riferimento TikTok: CTR 1-2%, audience giovane, formato full-screen video, attenzione bassa al singolo ad ma alto engagement organico se la creativita' e' nativa.",
      en: "TikTok reference benchmarks: CTR 1-2%, young audience, full-screen video format, low attention on the single ad but high organic engagement if the creative is native.",
    },
  },
};

/**
 * Traduce un set di sezioni di analisi gia' generate da una lingua a
 * un'altra, preservando ESATTAMENTE la struttura markdown (grassetti,
 * elenchi puntati, capoversi). Differenza fondamentale rispetto a
 * runPerfAnalysis(): NON rigenera dal dato del dashboard, traduce il
 * testo esistente. Cosi' le personalizzazioni manuali dell'utente non
 * vanno perse quando cambia lingua.
 */
export interface TranslatePerfAnalysisOptions {
  workspaceId: string;
  modelOpenrouterId: string;
  fromLocale: "it" | "en";
  toLocale: "it" | "en";
  /** Sezioni da tradurre con il loro contenuto attuale. */
  sections: { section: PerfSection; content: string }[];
}

export async function translatePerfAnalysis(
  opts: TranslatePerfAnalysisOptions,
): Promise<PerfAnalysisOutput | null> {
  if (opts.fromLocale === opts.toLocale) {
    // Niente da tradurre: ritorna le stesse stringhe.
    const sections: Partial<Record<PerfSection, string>> = {};
    for (const s of opts.sections) sections[s.section] = s.content;
    return { sections, modelId: opts.modelOpenrouterId };
  }
  const creds = await getOpenRouterCredentials(opts.workspaceId).catch((e) => {
    console.error("[perf-translate] credentials error:", e);
    return null;
  });
  if (!creds?.token) {
    console.error("[perf-translate] no OpenRouter credentials");
    return null;
  }

  const targetLangLabel = opts.toLocale === "it" ? "Italian" : "English";
  const sourceLangLabel = opts.fromLocale === "it" ? "Italian" : "English";

  // Passiamo le sezioni come JSON cosi' il modello restituisce lo
  // stesso JSON ma con il contenuto tradotto. Markdown preservato.
  const payload: Record<string, string> = {};
  for (const s of opts.sections) payload[s.section] = s.content;

  const prompt = [
    `You are translating performance-analysis commentary from ${sourceLangLabel} to ${targetLangLabel}.`,
    "",
    "STRICT RULES:",
    "- Translate EVERY piece of natural language text.",
    "- Preserve ALL markdown formatting EXACTLY: **bold**, bullet points (lines starting with -), blank lines, capitalisation patterns.",
    "- Do NOT add or remove information. Do NOT shorten, expand, summarise, or rephrase content beyond what the translation requires.",
    "- Keep numbers, currencies, percentages, KPI names (CTR, CPM, CPC, ROAS, CPP, CPR, …) and proper nouns unchanged.",
    "- Keep technical short-codes from campaign names (VC, ATC, PUR, ENG, BAU, …) unchanged.",
    `- If text is already in ${targetLangLabel}, leave it unchanged.`,
    "",
    "Return ONLY a JSON object with the SAME keys as the input. Each value must be the translated string. No prose, no markdown fences.",
    "",
    "INPUT JSON:",
    JSON.stringify(payload, null, 2),
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${creds.token}`,
        "http-referer":
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "x-title": "AISCAN - Adv Performance Translation",
      },
      body: JSON.stringify({
        model: opts.modelOpenrouterId,
        max_tokens: 5000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    console.error("[perf-translate] fetch error:", e);
    return null;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    console.error(
      `[perf-translate] OpenRouter ${res.status} ${res.statusText} (model=${opts.modelOpenrouterId}): ${body.slice(0, 500)}`,
    );
    return null;
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = body.choices?.[0]?.message?.content ?? null;
  if (!text) {
    console.error("[perf-translate] empty content");
    return null;
  }

  let raw = text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m) raw = m[0];

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sections: Partial<Record<PerfSection, string>> = {};
    for (const s of opts.sections) {
      const v = parsed[s.section];
      if (typeof v === "string" && v.trim()) {
        sections[s.section] = v.trim();
      } else {
        // Fallback: se il modello salta una sezione, riusiamo il testo
        // originale invece di perdere il contenuto.
        sections[s.section] = s.content;
      }
    }
    return { sections, modelId: opts.modelOpenrouterId };
  } catch (e) {
    console.error(
      "[perf-translate] JSON parse failed:",
      (e as Error).message,
      "raw:",
      raw.slice(0, 500),
    );
    return null;
  }
}

export async function runPerfAnalysis(
  opts: RunOptions,
): Promise<PerfAnalysisOutput | null> {
  const creds = await getOpenRouterCredentials(opts.workspaceId).catch((e) => {
    console.error("[perf-analysis] credentials error:", e);
    return null;
  });
  if (!creds?.token) {
    console.error("[perf-analysis] no OpenRouter credentials");
    return null;
  }
  const model = opts.modelOpenrouterId;
  const prompt = buildPrompt(
    opts.data,
    opts.sections,
    opts.locale,
    opts.channel,
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${creds.token}`,
        "http-referer":
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "x-title": "AISCAN - Adv Performance Analysis",
      },
      body: JSON.stringify({
        model,
        // 8 sezioni × ~150 parole medie ≈ 2000 parole ≈ 3000 tokens
        // bumped a 5000 per safety + per casi premium piu' verbose.
        max_tokens: 5000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    console.error("[perf-analysis] fetch error:", e);
    return null;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    console.error(
      `[perf-analysis] OpenRouter ${res.status} ${res.statusText} (model=${model}): ${body.slice(0, 500)}`,
    );
    return null;
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = body.choices?.[0]?.message?.content ?? null;
  if (!text) {
    console.error("[perf-analysis] empty content");
    return null;
  }

  // Strip markdown fences if model wraps the JSON despite instructions.
  let raw = text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }
  // Extract first {...} block
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m) raw = m[0];

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sections: Partial<Record<PerfSection, string>> = {};
    for (const s of opts.sections) {
      const v = parsed[s];
      if (typeof v === "string" && v.trim()) sections[s] = v.trim();
    }
    return { sections, modelId: model };
  } catch (e) {
    console.error(
      "[perf-analysis] JSON parse failed:",
      (e as Error).message,
      "raw:",
      raw.slice(0, 500),
    );
    return null;
  }
}
