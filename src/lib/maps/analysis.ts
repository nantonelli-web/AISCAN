/**
 * AI store-analysis del Maps detail view.
 *
 * Prende un set di Maps places (selezionati dall'utente) + le loro
 * review + il foot-traffic, calcola FATTI DETERMINISTICI (aggregati
 * per-store / per-brand, profilo affluenza, asimmetria # store) e poi
 * produce una narrativa AI per sezione. I fatti sono rule-based su dato
 * verificabile (allineato al feedback "real data only"); la AI commenta
 * e motiva, ma deve ancorarsi ai numeri forniti.
 *
 * Due modalita':
 *   - intra_brand: gli store selezionati sono location dello STESSO
 *     brand → focus su varianza fra punti vendita, anello debole,
 *     distribuzione affluenza.
 *   - cross_brand: gli store sono competitor diversi → focus su
 *     posizionamento competitivo (gap rating, volume review, chi
 *     possiede la Top 3, affluenza, completezza GBP).
 *
 * Modello: stesso catalogo mait_ai_models / OpenRouter di
 * /perf e /brands/compare. Il route risolve l'openrouter_id.
 */

import { createHash } from "crypto";
import { getOpenRouterCredentials } from "@/lib/billing/credentials";
import { computeLocalSeoAudit } from "@/lib/maps/audit";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Default fallback se il catalogo modelli non risolve nulla. */
export const MAPS_DEFAULT_OPENROUTER_ID = "anthropic/claude-haiku-4.5";

export type MapsAnalysisMode = "intra_brand" | "cross_brand";

export const MAPS_ANALYSIS_SECTIONS = [
  "overview",
  "reputation",
  "footTraffic",
  "visibility",
  "recommendations",
] as const;
export type MapsAnalysisSection = (typeof MAPS_ANALYSIS_SECTIONS)[number];

/* ─── Input shapes ────────────────────────────────────────── */

export interface MapsReviewInput {
  stars: number | null;
  text: string | null;
  text_translated: string | null;
  response_from_owner_text: string | null;
}

export interface MapsPlaceInput {
  id: string;
  place_id: string;
  title: string | null;
  normalized_domain: string | null;
  category_name: string | null;
  price: string | null;
  rank: number | null;
  total_score: number | null;
  reviews_count: number;
  permanently_closed: boolean;
  temporarily_closed: boolean;
  phone: string | null;
  website: string | null;
  image_url: string | null;
  address: string | null;
  popular_times:
    | Record<string, { hour: number; occupancyPercent: number }[]>
    | null;
  reviews: MapsReviewInput[];
}

/* ─── Deterministic facts ─────────────────────────────────── */

const DAYS_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const DAY_LABELS: Record<(typeof DAYS_ORDER)[number], { it: string; en: string }> = {
  Mo: { it: "Lunedì", en: "Monday" },
  Tu: { it: "Martedì", en: "Tuesday" },
  We: { it: "Mercoledì", en: "Wednesday" },
  Th: { it: "Giovedì", en: "Thursday" },
  Fr: { it: "Venerdì", en: "Friday" },
  Sa: { it: "Sabato", en: "Saturday" },
  Su: { it: "Domenica", en: "Sunday" },
};

export interface FootTrafficProfile {
  /** Giorno di picco (codice Mo..Su). */
  peakDay: (typeof DAYS_ORDER)[number];
  peakHour: number;
  peakPct: number;
  /** Media occupancy su tutte le ore con dato (0..100). */
  avgBusyness: number;
  /** I 2 giorni piu affollati per somma occupancy. */
  busiestDays: (typeof DAYS_ORDER)[number][];
}

function footTrafficProfile(
  pt: MapsPlaceInput["popular_times"],
): FootTrafficProfile | null {
  if (!pt || typeof pt !== "object" || Object.keys(pt).length === 0) {
    return null;
  }
  let peakDay: (typeof DAYS_ORDER)[number] = "Mo";
  let peakHour = 0;
  let peakPct = -1;
  let sum = 0;
  let n = 0;
  const dayTotals: { day: (typeof DAYS_ORDER)[number]; total: number }[] = [];
  for (const day of DAYS_ORDER) {
    const entries = pt[day];
    if (!Array.isArray(entries)) continue;
    let dayTotal = 0;
    for (const e of entries) {
      const pct = e?.occupancyPercent ?? 0;
      sum += pct;
      n += 1;
      dayTotal += pct;
      if (pct > peakPct) {
        peakPct = pct;
        peakHour = e.hour;
        peakDay = day;
      }
    }
    dayTotals.push({ day, total: dayTotal });
  }
  if (n === 0 || peakPct < 0) return null;
  dayTotals.sort((a, b) => b.total - a.total);
  return {
    peakDay,
    peakHour,
    peakPct,
    avgBusyness: Math.round(sum / n),
    busiestDays: dayTotals.slice(0, 2).map((d) => d.day),
  };
}

export interface EntityFacts {
  placeId: string;
  title: string;
  domain: string | null;
  category: string | null;
  price: string | null;
  rank: number | null;
  /** Rating lifetime esposto da Google (total_score). */
  rating: number | null;
  /** Totale review lifetime (reviews_count). */
  lifetimeReviews: number;
  /** Review effettivamente scrappate (campione testuale). */
  scannedReviews: number;
  /** Media stelle del campione scrappato (null se 0 review). */
  avgScannedStars: number | null;
  /** % review scrappate con risposta del titolare. */
  ownerResponseRate: number;
  closed: "permanently" | "temporarily" | null;
  /** Score completezza GBP (computeLocalSeoAudit). */
  gbpScore: number;
  gbpMax: number;
  footTraffic: FootTrafficProfile | null;
}

export interface ComparisonFacts {
  mode: MapsAnalysisMode;
  entities: EntityFacts[];
  /** placeId del leader per rating (null se nessun rating). */
  ratingLeader: string | null;
  /** placeId del leader per volume review lifetime. */
  reviewVolumeLeader: string | null;
  /** placeId con miglior affluenza media (null se nessun foot-traffic). */
  footTrafficLeader: string | null;
  /** Quanti degli entity sono nella Top 3 del local pack. */
  topThreeCount: number;
  /** Gap di rating fra il migliore e il peggiore (null se <2 rating). */
  ratingSpread: number | null;
}

function avgStars(reviews: MapsReviewInput[]): number | null {
  const withStars = reviews.filter((r) => typeof r.stars === "number");
  if (withStars.length === 0) return null;
  const sum = withStars.reduce((s, r) => s + (r.stars ?? 0), 0);
  return Math.round((sum / withStars.length) * 10) / 10;
}

export function buildComparisonFacts(
  mode: MapsAnalysisMode,
  places: MapsPlaceInput[],
): ComparisonFacts {
  const entities: EntityFacts[] = places.map((p) => {
    const audit = computeLocalSeoAudit(
      {
        phone: p.phone,
        website: p.website,
        category_name: p.category_name,
        image_url: p.image_url,
        address: p.address,
        total_score: p.total_score,
        reviews_count: p.reviews_count,
      },
      p.reviews,
    );
    const owned = p.reviews.filter(
      (r) => (r.response_from_owner_text ?? "").trim().length > 0,
    ).length;
    return {
      placeId: p.place_id,
      title: p.title ?? "—",
      domain: p.normalized_domain,
      category: p.category_name,
      price: p.price,
      rank: p.rank,
      rating: p.total_score,
      lifetimeReviews: p.reviews_count,
      scannedReviews: p.reviews.length,
      avgScannedStars: avgStars(p.reviews),
      ownerResponseRate:
        p.reviews.length > 0
          ? Math.round((owned / p.reviews.length) * 100)
          : 0,
      closed: p.permanently_closed
        ? "permanently"
        : p.temporarily_closed
          ? "temporarily"
          : null,
      gbpScore: audit.score,
      gbpMax: audit.max,
      footTraffic: footTrafficProfile(p.popular_times),
    };
  });

  const rated = entities.filter((e) => e.rating != null);
  const ratingLeader =
    rated.length > 0
      ? rated.reduce((a, b) => ((b.rating ?? 0) > (a.rating ?? 0) ? b : a))
          .placeId
      : null;
  const reviewVolumeLeader =
    entities.length > 0
      ? entities.reduce((a, b) =>
          b.lifetimeReviews > a.lifetimeReviews ? b : a,
        ).placeId
      : null;
  const withFt = entities.filter((e) => e.footTraffic != null);
  const footTrafficLeader =
    withFt.length > 0
      ? withFt.reduce((a, b) =>
          (b.footTraffic?.avgBusyness ?? 0) > (a.footTraffic?.avgBusyness ?? 0)
            ? b
            : a,
        ).placeId
      : null;
  const topThreeCount = entities.filter(
    (e) => e.rank != null && e.rank <= 3,
  ).length;
  const ratingSpread =
    rated.length >= 2
      ? Math.round(
          (Math.max(...rated.map((e) => e.rating ?? 0)) -
            Math.min(...rated.map((e) => e.rating ?? 0))) *
            10,
        ) / 10
      : null;

  return {
    mode,
    entities,
    ratingLeader,
    reviewVolumeLeader,
    footTrafficLeader,
    topThreeCount,
    ratingSpread,
  };
}

/* ─── Signature (cache key) ───────────────────────────────── */

/**
 * Firma stabile della comparison: hash di (mode + place_id ordinati).
 * Re-aprire la stessa comparison serve il report cached senza ri-billing.
 */
export function comparisonSignature(
  mode: MapsAnalysisMode,
  placeIds: string[],
): string {
  const norm = [...placeIds].sort().join(",");
  return createHash("sha256")
    .update(`${mode}|${norm}`)
    .digest("hex")
    .slice(0, 32);
}

/* ─── Prompt building ─────────────────────────────────────── */

const SECTION_DESCR: Record<
  MapsAnalysisSection,
  { it: string; en: string }
> = {
  overview: {
    it: "Quadro d'insieme: chi guida il confronto e perché, leggendo rating, volume review, posizione nel local pack e affluenza nel loro insieme. Estrai il significato competitivo, non elencare numero per numero.",
    en: "Big picture: who leads the comparison and why, reading rating, review volume, local-pack rank and foot traffic together. Extract the competitive meaning, don't list metric by metric.",
  },
  reputation: {
    it: "Reputazione: rating lifetime, volume recensioni, media stelle del campione scrappato, tasso di risposta del titolare e sentiment qualitativo dai testi review forniti. Spiega chi ha la reputazione più solida e dove ci sono crepe (rating alto ma poche review = poco consolidato; tante review ma owner che non risponde = gestione passiva).",
    en: "Reputation: lifetime rating, review volume, scanned-sample star average, owner response rate and qualitative sentiment from the provided review texts. Explain who has the most solid reputation and where the cracks are (high rating but few reviews = not consolidated; many reviews but owner not replying = passive management).",
  },
  footTraffic: {
    it: "Affluenza (Popular Times): confronta giorni e ore di picco, affluenza media, distribuzione settimanale. Spiega chi attira più traffico e i pattern (es. picco weekend vs feriale). Se un entity non ha dato Popular Times, segnalalo come limite di Google (tipico su punti nuovi o a basso volume), NON come scarsa affluenza.",
    en: "Foot traffic (Popular Times): compare peak days and hours, average busyness, weekly distribution. Explain who draws more traffic and the patterns (e.g. weekend vs weekday peak). If an entity has no Popular Times data, flag it as a Google limitation (typical for new or low-volume spots), NOT as low footfall.",
  },
  visibility: {
    it: "Visibilità e Local SEO: posizione nel local pack, chi possiede la Top 3, completezza del Google Business Profile (gbpScore). Spiega chi è più visibile e quali lacune di profilo (telefono, sito, foto, categoria, risposte) penalizzano la posizione.",
    en: "Visibility and Local SEO: local-pack rank, who owns the Top 3, Google Business Profile completeness (gbpScore). Explain who is more visible and which profile gaps (phone, website, photo, category, replies) hold a position back.",
  },
  recommendations: {
    it: "Raccomandazioni operative per scalare il local pack: azioni concrete e azionabili basate sui gap emersi (es. chiedere review per colmare il volume, rispondere alle recensioni, completare il GBP, sfruttare le fasce di affluenza). Coerenti con i fatti, niente consigli generici.",
    en: "Operational recommendations to climb the local pack: concrete, actionable steps based on the gaps found (e.g. request reviews to close a volume gap, reply to reviews, complete the GBP, leverage busy windows). Grounded in the facts, no generic advice.",
  },
};

function fmtFootTraffic(
  ft: FootTrafficProfile | null,
  locale: "it" | "en",
): string {
  if (!ft) return locale === "it" ? "Popular Times non disponibile" : "Popular Times unavailable";
  const peakDay = DAY_LABELS[ft.peakDay][locale];
  const busiest = ft.busiestDays.map((d) => DAY_LABELS[d][locale]).join(", ");
  return locale === "it"
    ? `picco ${peakDay} ore ${ft.peakHour}:00 (${ft.peakPct}%), affluenza media ${ft.avgBusyness}%, giorni più affollati: ${busiest}`
    : `peak ${peakDay} at ${ft.peakHour}:00 (${ft.peakPct}%), average busyness ${ft.avgBusyness}%, busiest days: ${busiest}`;
}

function buildFactsSnapshot(
  facts: ComparisonFacts,
  places: MapsPlaceInput[],
  locale: "it" | "en",
): string {
  const byId = new Map(places.map((p) => [p.place_id, p]));
  const lines: string[] = [];
  lines.push(
    locale === "it"
      ? `MODALITÀ: ${facts.mode === "intra_brand" ? "stesso brand, più location" : "brand diversi (competitor)"}`
      : `MODE: ${facts.mode === "intra_brand" ? "same brand, multiple locations" : "different brands (competitors)"}`,
  );
  lines.push(
    locale === "it"
      ? `# entità a confronto: ${facts.entities.length} | nel Top 3 del local pack: ${facts.topThreeCount}${facts.ratingSpread != null ? ` | gap rating max-min: ${facts.ratingSpread}` : ""}`
      : `# entities compared: ${facts.entities.length} | in local-pack Top 3: ${facts.topThreeCount}${facts.ratingSpread != null ? ` | rating gap max-min: ${facts.ratingSpread}` : ""}`,
  );

  for (let i = 0; i < facts.entities.length; i++) {
    const e = facts.entities[i];
    const p = byId.get(e.placeId);
    lines.push(`\n=== ${i + 1}. ${e.title} ===`);
    if (e.domain) lines.push(`domain: ${e.domain}`);
    if (e.category) lines.push(`${locale === "it" ? "categoria" : "category"}: ${e.category}`);
    if (e.price) lines.push(`${locale === "it" ? "fascia prezzo" : "price tier"}: ${e.price}`);
    lines.push(`${locale === "it" ? "posizione local pack" : "local-pack rank"}: ${e.rank ?? "—"}`);
    lines.push(`rating (lifetime): ${e.rating ?? "—"}`);
    lines.push(`${locale === "it" ? "review lifetime" : "lifetime reviews"}: ${e.lifetimeReviews}`);
    lines.push(
      `${locale === "it" ? "review scrappate (campione)" : "scanned reviews (sample)"}: ${e.scannedReviews}${e.avgScannedStars != null ? ` (${locale === "it" ? "media" : "avg"} ${e.avgScannedStars}★)` : ""}`,
    );
    lines.push(
      `${locale === "it" ? "tasso risposta titolare" : "owner response rate"}: ${e.ownerResponseRate}%`,
    );
    lines.push(`GBP completeness: ${e.gbpScore}/${e.gbpMax}`);
    if (e.closed) {
      lines.push(
        `${locale === "it" ? "STATO" : "STATUS"}: ${e.closed === "permanently" ? (locale === "it" ? "CHIUSO DEFINITIVAMENTE" : "PERMANENTLY CLOSED") : locale === "it" ? "chiuso temporaneamente" : "temporarily closed"}`,
      );
    }
    lines.push(`Popular Times: ${fmtFootTraffic(e.footTraffic, locale)}`);

    // Campione testuale review (max 5) per sentiment qualitativo.
    const sample = (p?.reviews ?? [])
      .map((r) => (r.text ?? r.text_translated ?? "").trim())
      .filter((t) => t.length > 0)
      .slice(0, 5);
    if (sample.length > 0) {
      lines.push(locale === "it" ? "estratti review:" : "review excerpts:");
      for (const s of sample) {
        lines.push(`  - "${s.slice(0, 280)}"`);
      }
    }
  }
  return lines.join("\n");
}

function buildPrompt(
  facts: ComparisonFacts,
  places: MapsPlaceInput[],
  sections: MapsAnalysisSection[],
  locale: "it" | "en",
): string {
  const descr = SECTION_DESCR;
  const sectionList = sections
    .map((s) => `- ${s}: ${descr[s][locale]}`)
    .join("\n");
  const snapshot = buildFactsSnapshot(facts, places, locale);

  if (locale === "en") {
    return `You are a senior local-SEO and Google Maps analyst. You are comparing Google Maps business listings (a "local pack") for a brand-monitoring tool. Reason only from the verifiable data provided below — do not invent ratings, review counts or traffic figures.

DATA:
${snapshot}

CONTENT INSTRUCTIONS:
1. For each section listed below, write a discursive analysis in English. Professional but not rigid — zero fluff, zero fillers. Every sentence must carry information weight.
2. Ground every claim in the numbers above and cite them to anchor the reading, but explain their meaning — don't just repeat them.
3. Foot-traffic percentages are RELATIVE to each place's own weekly peak (100% = that place's busiest hour, not "always full"). Treat "Popular Times unavailable" as a Google data limitation, never as low footfall.
4. A high rating on very few reviews is statistically weak — say so. Many reviews with a low owner-response rate signals passive reputation management.
5. The recommendations section must be concrete and actionable, derived from the actual gaps above. No generic advice.
6. Length varies with how much there is to say. Don't pad.

FORMATTING:
7. Split text into PARAGRAPHS separated by a blank line (\\n\\n). Use markdown **bold** for key metrics and conclusions (2-4 per paragraph max). For multiple actions use a dashed list ("- " per line). No headings, no code, no tables, no links.

SECTIONS TO GENERATE:
${sectionList}

OUTPUT: reply ONLY with valid JSON:
{
${sections.map((s) => `  "${s}": "..."`).join(",\n")}
}
No markdown fences, no preamble. Each value is a string with \\n\\n paragraphs, optional **bold**, and "- " lists. Write all content in English.`;
  }

  return `Sei un analista senior di local SEO e Google Maps. Stai confrontando schede Google Maps (un "local pack") per uno strumento di brand monitoring. Ragiona SOLO sui dati verificabili forniti sotto — non inventare rating, numeri di review o dati di affluenza.

DATI:
${snapshot}

ISTRUZIONI DI CONTENUTO:
1. Per ognuna delle sezioni elencate sotto, scrivi un'analisi discorsiva in italiano. Tono professionale ma non rigido — zero fuffa, zero filler. Ogni frase deve avere peso informativo.
2. Ancora ogni affermazione ai numeri sopra e citali per dare appiglio, ma spiegane il significato — non limitarti a ripeterli.
3. Le percentuali di affluenza sono RELATIVE al picco settimanale di ciascun place (100% = l'ora più affollata di quel place, non "sempre pieno"). Tratta "Popular Times non disponibile" come un limite del dato Google, mai come scarsa affluenza.
4. Un rating alto su pochissime review è statisticamente debole — dillo. Tante review con un basso tasso di risposta del titolare segnala una gestione passiva della reputazione.
5. La sezione raccomandazioni deve essere concreta e azionabile, derivata dai gap reali sopra. Niente consigli generici.
6. La lunghezza varia in base a quanto c'è da dire. Non gonfiare.

FORMATTAZIONE:
7. Scandisci il testo in PARAGRAFI separati da riga vuota (\\n\\n). Usa il **grassetto** markdown per metriche chiave e conclusioni (2-4 per paragrafo al massimo). Per più azioni usa una lista con trattini ("- " per riga). Niente titoli, niente code, niente tabelle, niente link.

SEZIONI DA GENERARE:
${sectionList}

OUTPUT: rispondi SOLO con un JSON valido:
{
${sections.map((s) => `  "${s}": "..."`).join(",\n")}
}
Niente markdown fences, niente preamble. Il valore di ogni chiave è una stringa con paragrafi \\n\\n, eventuali **bold** e liste con "- ". Scrivi tutto in italiano.`;
}

/* ─── OpenRouter call ─────────────────────────────────────── */

export interface MapsAnalysisResult {
  facts: ComparisonFacts;
  sections: Partial<Record<MapsAnalysisSection, string>>;
  modelId: string;
}

export interface RunMapsAnalysisOptions {
  workspaceId: string;
  mode: MapsAnalysisMode;
  places: MapsPlaceInput[];
  modelOpenrouterId: string;
  locale: "it" | "en";
  sections?: MapsAnalysisSection[];
}

export async function runMapsAnalysis(
  opts: RunMapsAnalysisOptions,
): Promise<MapsAnalysisResult | null> {
  const creds = await getOpenRouterCredentials(opts.workspaceId).catch((e) => {
    console.error("[maps-analysis] credentials error:", e);
    return null;
  });
  if (!creds?.token) {
    console.error("[maps-analysis] no OpenRouter credentials");
    return null;
  }

  const sections = (opts.sections ??
    MAPS_ANALYSIS_SECTIONS) as MapsAnalysisSection[];
  const facts = buildComparisonFacts(opts.mode, opts.places);
  const prompt = buildPrompt(facts, opts.places, sections, opts.locale);

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
        "x-title": "AISCAN - Maps Store Analysis",
      },
      body: JSON.stringify({
        model: opts.modelOpenrouterId,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    console.error("[maps-analysis] fetch error:", e);
    return null;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    console.error(
      `[maps-analysis] OpenRouter ${res.status} ${res.statusText} (model=${opts.modelOpenrouterId}): ${body.slice(0, 500)}`,
    );
    return null;
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = body.choices?.[0]?.message?.content ?? null;
  if (!text) {
    console.error("[maps-analysis] empty content");
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
    const out: Partial<Record<MapsAnalysisSection, string>> = {};
    for (const s of sections) {
      const v = parsed[s];
      if (typeof v === "string" && v.trim()) out[s] = v.trim();
    }
    if (Object.keys(out).length === 0) return null;
    return { facts, sections: out, modelId: opts.modelOpenrouterId };
  } catch (e) {
    console.error(
      "[maps-analysis] JSON parse failed:",
      (e as Error).message,
      "raw:",
      raw.slice(0, 500),
    );
    return null;
  }
}
