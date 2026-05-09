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

/** Modelli usati per ogni tier. Singolo agent (no vision needed
 *  per Adv Performance — solo testo). */
const TIER_MODEL: Record<PerfModelTier, string> = {
  cheap: "deepseek/deepseek-v3.2",
  pragmatic: "anthropic/claude-haiku-4.5",
  premium: "anthropic/claude-sonnet-4.5",
};

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
  objective:
    "Distribuzione spesa per obiettivo Meta (sales, traffic, awareness, ecc). Spiega la coerenza con il funnel del brand.",
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
  objective:
    "Spend distribution by Meta objective (sales, traffic, awareness, etc). Comment on coherence with the brand's funnel.",
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

function buildPrompt(
  data: PerfDashboardData,
  sections: PerfSection[],
  locale: "it" | "en",
): string {
  const langName = locale === "it" ? "italiano" : "inglese";
  const section_descr = locale === "it" ? SECTION_DESCR_IT : SECTION_DESCR_EN;
  const sectionList = sections
    .map((s) => `- ${s}: ${section_descr[s]}`)
    .join("\n");

  return `Sei un analista marketing senior specializzato in paid advertising su Meta. Analizzi i dati di performance di una campagna pubblicitaria e produci insight utili al marketing manager del brand.

DATI DEL PERIODO ANALIZZATO:
${buildDashboardSnapshot(data)}

ISTRUZIONI:
1. Per ognuna delle sezioni elencate sotto, scrivi un'analisi discorsiva in ${langName}. Tono professionale ma non rigido — non scolastico, non da AI generica. Ogni frase deve avere un peso informativo: zero fuffa, zero filler ("Come si puo' notare", "E' importante sottolineare").
2. Spiega cosa significa il dato in termini di marketing concreti, e MOTIVA perche' la metrica si trova in quella zona di valore. Cita il numero del payload per ancorare la lettura, ma non duplicarlo: spiegalo. Quando hai ROAS=0 o purchase_value=0, segnalalo come "tracking conversion non configurato" e spiega come affrontare la cosa.
3. Quando rilevante, integra una RACCOMANDAZIONE OPERATIVA basata su best practice del paid (es. test A/B sulla creativity migliore, shift budget, pausa campagne sotto-performanti, frequency capping se >3, ecc). La raccomandazione deve essere concreta e azionabile.
4. La lunghezza varia in base alla profondita' del dato — non gonfiare. Una sezione con poco da dire puo' essere 2-3 frasi; una sezione ricca puo' essere 5-8.
5. Non inventare numeri. Cita solo cifre presenti nel payload. Se manca un dato, non riempire (es. ROAS senza purchase value).

SEZIONI DA GENERARE:
${sectionList}

OUTPUT: rispondi SOLO con un JSON valido nella forma:
{
${sections.map((s) => `  "${s}": "..."`).join(",\n")}
}

Niente markdown wrapping (\`\`\`json), niente preamble, niente postamble. Il valore di ogni chiave e' una stringa di testo discorsivo (no markdown, no bullet, frasi complete separate da spazi singoli o newlines \\n quando vuoi un nuovo paragrafo).`;
}

/* ─── OpenRouter call ────────────────────────────────────── */

interface RunOptions {
  workspaceId: string;
  data: PerfDashboardData;
  sections: PerfSection[];
  tier: PerfModelTier;
  locale: "it" | "en";
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
  const model = TIER_MODEL[opts.tier];
  const prompt = buildPrompt(opts.data, opts.sections, opts.locale);

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
