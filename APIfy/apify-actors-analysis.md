# APIfy Actor Analysis — NIMA "Scaling Story" Intelligence Stack

## Lettura del brief in chiave operativa

Il brief "Scaling Story" non è solo un documento di posizionamento. È il manifesto di un'agenzia consulenziale che dichiara apertamente:

1. **Target**: brand luxury/fashion in fase di scaling, €5M–€100M, founder-led, in transizione da operazioni unstructured a strutturate, spesso italiani/europei in espansione internazionale (incluso Gulf — vedi reference Arabic).
2. **Differenziatore**: AI-augmented workflows che permettono a team di 3–5 persone di produrre l'output di team da 10–15.
3. **Verticali competenza**: e-commerce, performance marketing, CRM, content, analytics, product feed engineering, loyalty, personalisation.
4. **Mercati linguistici**: EN, IT, AR (MSA + Gulf business register).

Da questa lettura derivano **quattro casi d'uso operativi reali** per l'intelligence stack APIfy:

- **A) Competitive intelligence sul positioning luxury/fashion** in mercati EU + GCC (chi sono i competitor diretti dei prospect NIMA, cosa pubblicano, dove sono presenti).
- **B) Discovery di prospect** (brand €5M–€100M che corrispondono al target ICP) attraverso segnali pubblici.
- **C) Audit pre-pitch** per nuovi prospect: presenza social, sentiment recensioni, posizionamento SERP nei propri mercati.
- **D) GEO/AI search optimization** del sito NIMA — verificare come compaiono nelle SERP citate da LLM, monitorare PAA (People Also Ask) sui topic dichiarati nel brief.

Ogni raccomandazione di Actor sotto è motivata rispetto a uno o più di questi casi d'uso. Non è un catalogo neutro; è una shortlist filtrata.

---

## 1. TikTok

**Rilevanza per NIMA**: alta-media. TikTok è ormai canale chiave per fashion/luxury emerging brands (in particolare nella fascia €5M–€50M dove il brief si concentra) e fondamentale nel mercato GCC dove NIMA opera. Anche se TikTok non è il canale principale dei brand luxury maturi, è dove avviene la discovery per i prospect che NIMA vuole intercettare.

### Actor primario consigliato

**`clockworks/tiktok-scraper`** — TikTok Scraper

- È l'actor di riferimento citato come default in tutte le guide cross-platform 2026.
- Pricing pay-per-event, copre profili + video + hashtag + URL diretti in un solo strumento.
- Use case NIMA: monitorare hashtag di nicchia (#luxuryfashion, #emergingdesigners, hashtag GCC-specifici), tracciare profili dei competitor dei prospect, estrarre engagement metrics per benchmark.

### Actor complementari

**`clockworks/tiktok-comments-scraper`** — quando serve analisi sentiment qualitativa sui contenuti dei competitor o per identificare commenters attivi su contenuti di nicchia (utile per audit pre-pitch: "che reazione ha l'audience al tuo competitor X?").

**`clockworks/tiktok-profile-scraper`** — pricing chiaro a $0.005/result (~$5 per 1.000 profili), ideale per scansioni mirate di liste di brand/influencer pre-identificate. Più conveniente del scraper generale quando l'input è una lista pulita di username.

### Alternative valide

**`apidojo/tiktok-scraper`** — comparable in funzionalità, posiziona prezzo aggressivo, query builder integrato, supporto location filtering. Da considerare in A/B test se il volume cresce.

**`cryptosignals/tiktok-scraper-v2`** — più recente (aggiornamenti 2026), supporta residential proxy automatico (TikTok blocca aggressivamente datacenter IP), buon fallback se clockworks ha rate-limit issues.

### Note operative

- TikTok cambia il frontend rapidamente: verificare data ultimo update dell'actor prima di ogni campagna critica.
- Per il mercato GCC servono residential proxy (IP locali UAE/KSA) per ottenere risultati geo-rilevanti — verificare che l'actor supporti country selection.

---

## 2. Snapchat

**Rilevanza per NIMA**: media-bassa nei mercati EU, **alta nel GCC**. Snapchat ha penetration molto alta in Arabia Saudita ed Emirati (>75% della popolazione 13–34 in KSA) ed è canale rilevante per fashion/beauty discovery in quei mercati. Per la versione araba del posizionamento NIMA, Snapchat intelligence è più rilevante che in EU.

### Stato dell'ecosistema

L'offerta Snapchat su APIfy è meno matura di TikTok/YouTube. Non esistono actor "compass" o "clockworks" equivalenti; la maggior parte sono publisher minori con volumi più bassi. Implicazione: serve testare 2–3 actor prima di committare budget.

### Actor primari da testare

**`automation-lab/snapchat-scraper`** — Snapchat Profile Scraper (Subscribers & Bio Data)
- Aggiornato Marzo 2026, pricing pay-per-event, supporta input flessibile (username, @handle, URL).
- Free plan: ~2.400 profili/mese.
- Output: subscriber count, bio, snapcode, related accounts. Sufficiente per audit competitor base.

**`scrapapi/snapchat-scraper`** — Snapchat Scraper
- Punto forte: intelligent proxy fallback (datacenter → residential), gestisce blocchi automaticamente.
- Estrae anche stories/highlights con media URL: utile per analisi creativa contenuti competitor.
- Aggiornamento: 3 settimane fa (recente).

**`alpha-scraper/snapchat-followers-scraper`** + **`alpha-scraper/snapchat-profile-scraper`**
- Suite con focus su metadata profilo dettagliato, bulk processing.
- L'esempio nella documentazione include esplicitamente bio in arabo (utile segnale che l'actor gestisce script non latini).

### Strategia consigliata

1. Run di test con 50 profili noti di competitor del settore beauty/fashion GCC su tutti e tre gli actor.
2. Diff dei field returnati e tasso di successo.
3. Selezionare il primario in base a coverage stories (necessarie per analisi creativa) + supporto Arabic content.

### Limiti da comunicare al cliente
Snapchat espone meno dati pubblici di TikTok/Instagram per design. L'analisi è limitata a profili pubblici, follower count, stories pubbliche. Non c'è equivalente robusto del comment scraping. Per insights profondi GCC va combinato con altre fonti.

---

## 3. YouTube Intelligence

**Rilevanza per NIMA**: alta. YouTube è dove vivono i contenuti long-form di brand luxury (campagne, fashion shows, brand films, founder interviews). Per audit competitivo e per l'AI Lab del brief — che parla esplicitamente di RAG, content generation, AI workflows — i transcript YouTube sono **input primari per pipeline AI** (analisi voce del brand, estrazione argomenti, brand monitoring multilingua).

### Actor primario per metadata + comments

**`streamers/youtube-scraper`** — YouTube Scraper
- L'actor di riferimento citato in tutte le guide cross-platform 2026.
- Copre search, channel, playlist, video, supporta filtering per data range, sorting, opzionalmente subtitles toggle.
- Alternative API ufficiale (no quota da 10.000 unità/giorno).
- Use case NIMA: monitorare canali competitor, estrarre engagement metrics video-by-video, cross-reference con calendar editoriale.

### Actor primario per transcript + AI/RAG (CRITICO)

**`codepoetry/youtube-transcript-ai-scraper`** — YouTube Transcript Scraper — Captions & AI Fallback
- **Il più strategico per NIMA AI Lab**. Pulla caption native quando esistono, fa fallback automatico a Whisper AI quando mancano (no API key esterna richiesta).
- Output `transcript_llm` field: testo già pulito da `[Music]`, `(laughter)`, whitespace — **pronto per ingestion in LangChain/LlamaIndex/vector store senza post-processing**.
- Whisper supporta 99 lingue inclusi arabo, italiano, inglese — perfetto per il setup multilingua del brief.
- `dryRun: true` permette stima costi prima di runs grossi (importante per controllo budget).
- Pricing: $0.001 per transcript nativo; $0.012/min per Whisper AI fallback.

### Actor per channel-level deep crawl

**`runtime/youtube-channel-scraper`** — YouTube Channel Scraper
- Combina video data + comments + transcripts in un solo actor.
- Output strutturato per brand monitoring: tracking di keyword brand/competitor in titoli + transcript + commenti.
- Supporta `transcript_mode: "ui_strict"` per casi difficili (utile su video di brand luxury che spesso hanno restrizioni).
- Caso d'uso esplicitamente documentato sull'actor: brand mention tracking per lingua/mercato (US, FR, ES — facilmente estendibile a IT, AR).

### Actor leggero per transcript bulk

**`supreme_coder/youtube-transcript-scraper`** — Youtube Transcript Scraper $0.5 per 1k
- Più economico ($0.5/1k) quando si sa che i video hanno caption native.
- 4 formati output (incluso SRT per video editor — utile se NIMA produce contenuti localizzati).
- Pick when: lista pulita di video con caption disponibili, no AI fallback necessario.

### Architettura consigliata per NIMA AI Lab

```
Channel competitor → streamers/youtube-scraper (lista video + metadata)
                  ↓
                  codepoetry/youtube-transcript-ai-scraper (transcript_llm)
                  ↓
                  Vector store (ingestion RAG per analisi voice-of-brand,
                  estrazione topic, sentiment per linguaggio)
```

Questo allineamento è praticamente isomorfo a quello che il brief Versione E descrive come operating model dell'AI Lab.

---

## 4. Google SERP & Local Intelligence

**Rilevanza per NIMA**: **alta** e duplice. (a) SERP intelligence per audit prospect e per il proprio GEO/SEO multilingua (versioni IT, EN, AR del sito); (b) Local Intelligence (Maps) per audit reputation di prospect retail/hospitality + lead gen su categorie selezionate.

### 4A. Google SERP Scrapers

#### Actor primario

**`apify/google-search-scraper`** — Google Search Results Scraper
- Actor ufficiale Apify, manutenuto attivamente.
- Copre organic + paid + People Also Ask + Related Queries + reviews/prices.
- Supporta 25+ lingue, 21+ paesi — **chiave per il setup multi-mercato del brief** (IT, EN, AR-SA, AR-AE).
- Pricing pay-per-event; free plan copre ~1.000+ risultati.
- Use case NIMA:
  - **Audit GEO/SEO multilingua**: tracciare ranking del sito NIMA su query target nelle tre versioni linguistiche.
  - **PAA mining per content brief**: il brief stesso menziona FAQ schema sulla pagina /our-approach. Un PAA scrape su query "luxury digital consultancy", "scaling luxury brand", "AI luxury fashion" dà input grezzi per FAQ aggiuntive.
  - **Competitor SERP positioning**: per ogni prospect, quali competitor occupano top-10 sui loro brand keyword.

#### Actor alternativo per volume

**`automation-lab/google-search-scraper`** — Google Search Results Scraper - SERP Data
- Pure HTTP (no browser), CheerioCrawler + GOOGLE_SERP proxy dedicato.
- Veloce e cheap, ottimo per scheduled runs settimanali di rank tracking.
- Free plan stimato a 720 SERP pages (~7.200 organic results) — sufficiente per il monitoring continuativo di un portfolio NIMA.

#### Actor low-cost ad alto volume

**`scraperlink/free-google-search-results-serp---only-0-25-per-1-000-results`** — $0.25 per 1.000 results
- Quando il volume è il driver principale (es. mining PAA su 500 keyword luxury).
- Trade-off: meno feature avanzate (no AI overview, no knowledge panel deep).

### 4B. Google Maps / Local Intelligence

#### Actor primario per place data

**`compass/crawler-google-places`** — il "battle-tested" della categoria
- Citato in ogni guide 2026 come default per high-volume Places crawling.
- Supporta search per query + location, category, coordinates, custom area (via geojson).
- Use case NIMA:
  - **Audit retail competitor**: per un prospect con boutique fisica, mappare tutti i competitor entro raggio definito + reputation comparativa.
  - **Lead gen verticale**: brand luxury con presenza fisica in città target (es. "concept stores Milan", "luxury boutiques Dubai DIFC").

#### Actor alternativo Apify-namespaced

**`compass/google-maps-scraper`** (📍 Google Maps Scraper)
- Versione più recente dello stesso publisher, con Live View map, zoomable map nei risultati, integrazione MCP server nativa.
- Supporta add-on per contact details, reviews, images come step separato (architettura più pulita).

#### Actor per reviews intelligence

**`compass/google-maps-reviews-scraper`** — $0.25 per 1.000 reviews
- Quando l'obiettivo è solo recensioni (sentiment, brand perception, opinion mining).
- Free plan: $5/month → ~20.000 reviews gratis. Starter $29/month → 58.000 reviews.

**`automation-lab/google-maps-reviews-scraper`** — Pure HTTP, AI sentiment integrato
- Più recente, ~60 secondi per 1.000 reviews.
- **Sentiment analysis AI inclusa** senza extra cost: classifica positive/negative/neutral/mixed + topic labels.
- Genera "executiveSummary" pronto per slide cliente (es. "100% positive tone, customers praise: atmosphere, service quality").
- Use case NIMA: audit pre-pitch di un prospect retail in 5 minuti — dump reviews + summary AI = primo slide del meeting.

### Architettura SERP+Maps consigliata

Per ogni nuovo prospect NIMA (specialmente pre-pitch):

```
1. apify/google-search-scraper → ranking del prospect su brand keyword + 
   competitor SERP positioning (per i loro 5 keyword principali)
2. compass/crawler-google-places → presenza physical retail competitor 
   nel raggio operativo del prospect
3. automation-lab/google-maps-reviews-scraper → reviews del prospect 
   (se ha retail) + competitor diretti, con sentiment summary AI
```

Output: dossier prospect-ready in <30 minuti per €1–3 di credit Apify.

---

## Sintesi tabellare — Stack consigliato

| Area | Actor primario | Actor secondario | Use case principale per NIMA |
|---|---|---|---|
| TikTok | `clockworks/tiktok-scraper` | `clockworks/tiktok-comments-scraper` | Competitor monitoring + GCC discovery |
| Snapchat | `automation-lab/snapchat-scraper` | `scrapapi/snapchat-scraper` | GCC market intelligence (KSA, UAE) |
| YouTube metadata | `streamers/youtube-scraper` | `runtime/youtube-channel-scraper` | Brand monitoring + competitor channel deep dive |
| YouTube transcript (AI Lab) | `codepoetry/youtube-transcript-ai-scraper` | `supreme_coder/youtube-transcript-scraper` | Pipeline RAG, voice-of-brand analysis multilingua |
| Google SERP | `apify/google-search-scraper` | `automation-lab/google-search-scraper` | GEO/SEO audit IT/EN/AR + PAA mining per content |
| Google Maps places | `compass/crawler-google-places` | `compass/google-maps-scraper` | Retail competitor mapping + lead gen |
| Google Maps reviews | `automation-lab/google-maps-reviews-scraper` | `compass/google-maps-reviews-scraper` | Pre-pitch reputation audit con sentiment AI |

---

## Considerazioni cross-cutting

### Compliance e GDPR
Tutti gli actor citati operano su dati pubblici. Il brief NIMA opera in EU + GCC: GDPR si applica per dati personali inavvertitamente raccolti (es. nomi recensori, username). Va costruita una policy di data minimisation a monte (filtrare campi PII non necessari prima di ingestion in qualsiasi sistema downstream).

### Pricing realistico
Per uno stack NIMA "always-on" che monitori 10–15 prospect/competitor a rotazione:
- Apify Starter ($39/month) o Scale ($199/month) sono i tier rilevanti.
- Spend incrementale per intelligence on-demand (audit pre-pitch): $5–20 per dossier.

### Architettura suggerita
Il brief enfatizza AI-augmented workflows. La sequenza naturale è:
- **Apify Actors** (estrazione strutturata) →
- **n8n / Make** (orchestrazione, gestione errori, deduplicazione) →
- **Vector store + LLM** (analisi semantica multilingua, generazione insight) →
- **Output cliente** (slide automatiche, dashboard, alert)

Questo è esattamente il "Stage 1 engagement" che il brief Versione C descrive come "AI-based tooling that lets a small team produce the output of a larger one". Lo stack APIfy è infrastruttura coerente con il messaging dichiarato.

### Cose da NON fare
- **Non chainare Actor diversi in un singolo run**: best practice 2026 è triggering parallelo via Apify API + normalizzazione downstream.
- **Non affidarsi al sticker price**: il prezzo per item può divergere 3–5x dal prezzo per useful row dopo filtering. Sempre run di test su 50–100 item prima di committare.
- **Non dare per scontato che un actor non aggiornato funzioni**: TikTok/Instagram cambiano il frontend ogni 4–8 settimane. Verificare changelog dell'actor prima di ogni campagna critica.

### Alternative non-Apify da tenere d'occhio
Per query SERP molto ad alto volume (>100k/mese), Scrapingdog e SerpAPI battono Apify su pricing puro ($0.00029–$0.003 per query vs ~$0.003+ Apify). Ma per la tipologia di lavoro NIMA (intelligence consulenziale, non rank-tracking di massa), il vantaggio Apify è la possibilità di chainare con altre 1.500+ Actor in un'unica infrastruttura.
