# AISCAN — Analisi funzionalità Apify integrabili

**Scope:** identificare fonti dati e use case Apify **oltre** Meta Ad Library, Google Ads Campaigns e Instagram organico, per espandere le capacità analitiche del tool AISCAN.

**Approccio:** ragionare per **job-to-be-done** del marketer (non per "liste di tool"), mappando ogni categoria a casi d'uso concreti per il target MENA/luxury di NIMA.

---

## 1. Framework di valutazione

Per ogni fonte dati valuto 5 dimensioni:

- **Valore marketing:** quanto è azionabile il dato per decisioni di marketing
- **Stabilità tecnica:** quanto l'actor regge nel tempo (piattaforme con frontend mutevoli come TikTok o X sono più instabili)
- **Costo operativo:** pricing indicativo per 1K risultati + compute
- **Fit con AISCAN:** coerenza con il positioning del tool
- **Effort integrazione:** complessità sviluppo

---

## 2. Categorie candidate per AISCAN

### 🎯 TIER 1 — High priority (da integrare subito)

#### 2.1 TikTok Intelligence

**Cosa si scrapa:** profili, video, engagement metrics (likes/shares/comments/play count), hashtag, commenti con thread completi, sounds/audio trending, ads (dal TikTok Ads Library).

**Actor di riferimento:** suite **clockworks** (leader di categoria), TikTok Ads Scraper.

**Use case AISCAN:**
- **Competitor content analysis:** tracciare cosa pubblicano i competitor luxury sul MENA, che performance hanno, che trend seguono
- **Trend detection:** monitorare hashtag e sounds in crescita per il vertical target
- **Influencer discovery & vetting:** trovare creator con engagement rate reale (non gonfiato), fondamentale per MENA dove l'influencer marketing pesa molto
- **Sentiment analysis sui commenti:** capire reazioni reali a campagne di settore
- **Ad creative intelligence:** ispirazione da ads che performano (via TikTok Ads Scraper)

**Valore marketing:** ★★★★★ — TikTok è il canale a più alta crescita nel MENA, specie per luxury/beauty/fashion.
**Stabilità tecnica:** ★★★☆☆ — frontend cambia spesso, servono residential/mobile proxies.
**Costo:** ~$60 per 50K profili estratti (benchmark).
**Effort:** Medio.

---

#### 2.2 LinkedIn B2B Intelligence

**Cosa si scrapa:** profili aziendali, job postings, post aziendali, LinkedIn Ads Scraper (inserzioni B2B visibili nella LinkedIn Ad Library).

**Use case AISCAN:**
- **Competitor hiring signals:** se un competitor sta assumendo VP Marketing o un Head of MENA, è un segnale strategico forte
- **B2B ad intelligence:** vedere cosa stanno promuovendo le competitor in ADV B2B su LinkedIn (enorme gap rispetto a Meta Ad Library, che molti usano già)
- **Content performance aziendale:** che tipo di post generano engagement per i competitor B2B
- **Lead generation qualificata:** identificare decision maker in aziende target (per PropMatch AI è prezioso)
- **Company intelligence:** dimensione, crescita dipendenti, uffici nel MENA

**Valore marketing:** ★★★★★ per B2B / ★★★☆☆ per B2C luxury.
**Stabilità tecnica:** ★★★☆☆ — LinkedIn è aggressivo con anti-bot, serve gestione rate limit.
**Costo:** medio-alto.
**Effort:** Medio-alto per rispettare compliance.

**Nota compliance:** LinkedIn è quello più sensibile a livello ToS. Usare solo dati pubblici, evitare scraping massivo di profili individuali, documentare bene il legittimo interesse.

---

#### 2.3 YouTube Intelligence

**Cosa si scrapa:** video, canali, commenti, shorts, search results, metriche di performance (views, likes, commenti), trending per country.

**Use case AISCAN:**
- **Competitor content strategy analysis:** quali video funzionano, quale frequenza pubblicano, topic cluster
- **SEO/discovery intelligence:** cosa cerca il pubblico target (YouTube è il 2° search engine mondiale)
- **Ad creative benchmarking:** analizzare video ads dei competitor (skippable/non-skippable)
- **Comment mining:** estrarre insight qualitativi dal pubblico per capire obiezioni, desideri, linguaggio
- **Shorts performance:** vertical content opportunity nel MENA

**Valore marketing:** ★★★★☆ — potente per content strategy e SEO.
**Stabilità tecnica:** ★★★★☆ — YouTube ha API ufficiale, gli actor Apify fanno spesso hybrid.
**Costo:** basso-medio.
**Effort:** Basso.

---

### 🎯 TIER 2 — High ROI in vertical specifici

#### 2.4 Google SERP & Local Intelligence

**Cosa si scrapa:** risultati Google (organic + paid snippets), Google Maps listings, recensioni Google, People Also Ask, related searches.

**Use case AISCAN:**
- **SERP monitoring:** tracciare posizione organica dei competitor per keyword target
- **Local SEO (Google Maps):** fondamentale per brand con store fisici (luxury retail Dubai, showroom)
- **Review mining:** estrarre recensioni Google dei competitor per sentiment e pain points ricorrenti
- **SGE/AI Overview tracking:** intercettare quando i competitor appaiono nelle AI Overview di Google (nuovo battleground SEO)
- **People Also Ask mining:** miniera d'oro per content strategy e FAQ

**Valore marketing:** ★★★★★ trasversale.
**Stabilità tecnica:** ★★★★☆.
**Costo:** basso.
**Effort:** Basso-medio.

**Google Maps Scraper** da solo ha 300K+ utenti ed è l'actor più usato in assoluto. Per PropMatch AI sarebbe un complemento naturale (scraping agenzie real estate concorrenti a Dubai).

---

#### 2.5 Amazon & E-commerce Intelligence

**Cosa si scrapa:** prodotti, prezzi, recensioni (con summary AI già aggregati), bestseller rankings, seller profiles, ASIN tracking, Q&A.

**Actor di riferimento:** Amazon Product Scraper, Amazon Reviews Scraper (fino a 577 fields per pagina secondo i benchmark indipendenti).

**Use case AISCAN:**
- **Pricing intelligence:** tracking prezzi competitor in real-time across marketplace
- **Review mining per sentiment:** estrarre dolori/desideri dei consumatori di settore, alimentare insight per content e product
- **Trend detection via bestseller:** ranking aggiornato orariamente su Amazon è un segnale di demand reale
- **Category analysis:** capire pricing distribution e review velocity per validare opportunità

**Valore marketing:** ★★★★☆ se il cliente vende su Amazon / ★★☆☆☆ se luxury puro (Amazon è canale secondario).
**Stabilità tecnica:** ★★★★☆.
**Costo:** basso ($0.5 per 1000 reviews).
**Effort:** Basso.

**Da estendere:** oltre Amazon, Apify ha actor per Shopify stores, Noon (MENA e-commerce leader), Namshi — questi ultimi due sono **strategici per il mercato MENA** e rari da trovare altrove.

---

#### 2.6 Review & Reputation Intelligence (cross-platform)

**Cosa si scrapa:** Trustpilot, G2, Capterra, Yelp, Tripadvisor, App Store, Google Play reviews.

**Use case AISCAN:**
- **Brand reputation monitoring:** aggregatore di recensioni su tutte le piattaforme
- **Competitor weakness mining:** estrarre 1 e 2 stelle dei competitor → mappare pain points → briefare content/ads che intercettano
- **App store review analysis:** per clienti con app (luxury retail ha sempre app), capire bug/feature request
- **Hospitality/luxury focus:** Tripadvisor per hotel/ristoranti di categoria (Dubai è mercato saturo di recensioni)

**Valore marketing:** ★★★★☆.
**Stabilità tecnica:** ★★★★☆.
**Costo:** basso.
**Effort:** Basso.

---

### 🎯 TIER 3 — Niche ma strategici

#### 2.7 X/Twitter Intelligence

**Cosa si scrapa:** tweet per keyword/hashtag/user, thread, metriche engagement, trending topic per country.

**Use case AISCAN:**
- **Real-time crisis monitoring:** X è ancora dominante per early warning di crisi brand
- **B2B thought leadership tracking:** ambiente dove i decision maker tech/finance vivono
- **Trending topic intelligence:** specie in eventi live (Dubai World Cup, fashion weeks, etc.)

**Valore marketing:** ★★★☆☆ nel MENA (X ha meno penetrazione che in US/UK), ★★★★☆ per B2B tech.
**Stabilità tecnica:** ★★☆☆☆ — la piattaforma più instabile per scraping, cambia API e UI continuamente.
**Costo:** medio (per via dei retry).
**Effort:** Alto per mantenimento.

**Raccomandazione:** integrare come opzionale, non come feature core.

---

#### 2.8 Reddit Intelligence

**Cosa si scrapa:** post, commenti, subreddit, user history, engagement metrics.

**Use case AISCAN:**
- **Unfiltered voice of customer:** Reddit è la fonte più onesta (e brutale) per capire cosa pensano davvero i consumatori dei brand
- **Niche community discovery:** subreddit per luxury, watches, fashion, real estate Dubai
- **Content gap analysis:** trovare domande ricorrenti a cui i competitor non rispondono

**Valore marketing:** ★★★★☆ per insight qualitativi, ★★☆☆☆ per volume audience diretto.
**Stabilità tecnica:** ★★★★☆.
**Costo:** basso.
**Effort:** Basso.

---

#### 2.9 Pinterest Intelligence

**Cosa si scrapa:** pin, board, user, ricerche trending visive.

**Use case AISCAN:**
- **Visual trend forecasting:** Pinterest anticipa trend di consumo di 6-12 mesi (il loro "Pinterest Predicts" report è una miniera)
- **Luxury & lifestyle relevance:** audience high-intent per wedding planning, interior, fashion — rilevante per clienti NIMA
- **Visual search intelligence:** capire quali estetiche stanno emergendo

**Valore marketing:** ★★★★☆ per luxury/lifestyle.
**Stabilità tecnica:** ★★★★☆.
**Costo:** basso.
**Effort:** Basso.

---

#### 2.10 Website Content Crawler (competitor website intelligence)

**Cosa si scrapa:** siti web dei competitor end-to-end, blog post, prodotti, pricing, copy, struttura.

**Use case AISCAN:**
- **Competitor website change detection:** rilevare quando un competitor cambia pricing, aggiunge un servizio, lancia una campagna landing page
- **Content strategy analysis:** quale topic cluster coprono, frequenza di pubblicazione
- **Tech stack detection:** abbinato a BuiltWith-style actor per vedere stack tecnologico competitor
- **Alimentazione RAG:** ingest del sito competitor in un knowledge base per Q&A AI

**Valore marketing:** ★★★★★ come fondamentale di competitive intelligence.
**Stabilità tecnica:** ★★★★★.
**Costo:** molto basso.
**Effort:** Basso.

**Questo è probabilmente il "quick win" più sottovalutato** — Website Content Crawler è tra i più robusti actor di Apify.

---

### 🎯 TIER 4 — Specialistici per use case specifici

| Fonte | Use case | Rilevanza NIMA/MENA |
|---|---|---|
| **Snapchat** | Spectacles/Spotlight trends | Media nel MENA, Snap ha buona penetration in KSA |
| **Threads** | Meta's text-based platform | Bassa, ancora nascente |
| **BeReal** | Trending gen Z | Molto bassa |
| **Booking.com / Airbnb** | Hospitality pricing intelligence | Alta per clienti travel/real estate Dubai |
| **Glassdoor / Indeed** | Employer branding competitor | Media |
| **Product Hunt** | Tech product launches | Alta se hai clienti SaaS |
| **Crunchbase / PitchBook** | Funding intelligence | Alta per scouting lead/partner |
| **App Store / Play Store** | App competitor intelligence | Alta per clienti con app |

---

## 3. Roadmap suggerita per AISCAN

### Fase 1 — MVP expansion (Q1-Q2)
**Obiettivo:** coprire le fonti a più alto ROI e compatibili con il posizionamento attuale del tool.

1. **Website Content Crawler** — quick win, base per tutto il resto
2. **Google SERP + Google Maps** — universale, bassa complessità
3. **LinkedIn Ads Scraper + Company data** — completa il discorso "ads intelligence" già iniziato con Meta Ad Library e Google Ads
4. **TikTok Intelligence (profili + ads)** — canale in crescita MENA

### Fase 2 — Deep dive (Q3)
5. **YouTube Intelligence** — content + ads
6. **Review aggregation** (Trustpilot/Google/Tripadvisor)
7. **Amazon + Noon** (se hai clienti e-commerce)

### Fase 3 — Specialistici (Q4)
8. **Reddit & Pinterest** per insight qualitativi
9. **X/Twitter** come opzionale
10. **App Store reviews** per clienti con app

---

## 4. Architettura tecnica consigliata

**Pattern:** non integrare gli actor Apify direttamente nelle feature di AISCAN, ma creare un **data ingestion layer** centralizzato:

```
[Apify Actors] → [Ingestion Worker] → [Normalized Schema] → [AISCAN Analysis Engine]
```

**Vantaggi:**
- Disaccoppiamento: se un actor cambia schema o diventa obsoleto, cambi solo il mapper
- Riuso: lo stesso dato TikTok profile può alimentare "competitor analysis" e "influencer discovery" senza rifare lo scraping
- Cost control: caching e dedup centralizzato evitano chiamate duplicate

**Tecnicamente:**
- **Apify API + webhooks** per trigger run e ricevere risultati
- **Queue system** (BullMQ, Temporal) per gestire run lunghi
- **Storage:** Apify dataset → Supabase/Postgres per query veloci
- **Rate limit awareness:** wrapper che tiene traccia di compute units consumate per cliente (per billing interno se AISCAN ha pricing usage-based)

---

## 5. Modello di pricing da considerare

Apify usa **compute units** ($0.25/unit su piano Scale). Per AISCAN, due opzioni:

**Opzione A — Costi inclusi in piano flat**
- Pro: prevedibilità per cliente, pricing semplice
- Contro: abuse risk, margine compresso su utenti heavy

**Opzione B — Credit system (consigliato)**
- Ogni cliente ha N "credit" mensili, ogni analisi costa X credit
- Trasparenza: il cliente vede cosa consuma
- Upsell naturale: top-up a consumo
- Mirror del modello Apify stesso

**Per posizionamento luxury/premium MENA:** piano flat con "analisi illimitate" ma con **limiti di volume ragionevoli** (es. max 50 competitor tracked, max 10K results/mese) protegge il margine e semplifica la vendita.

---

## 6. Differentiation AISCAN vs competitor tools

I tool di market intelligence esistenti (SEMrush, Similarweb, Brandwatch, Sprinklr) hanno tutti una copertura multi-fonte. La differentiation di AISCAN non può essere "raccogliere più dati" ma **come si elabora il dato**:

- **AI-native analysis:** non solo dashboard statici, ma insight generati via LLM su ogni fonte
- **MENA-first:** integrazione di fonti locali (Noon, Namshi, Careem, Talabat) che i tool US/EU ignorano
- **Cross-source correlation:** correlare TikTok trend + Google search volume + Amazon reviews per un brand in un unico narrative
- **Action-oriented:** ogni insight genera un "next action" concreto (brief di content, lista di hashtag, spunto di ads)

Questa è la vera scusa per cui un cliente sceglie AISCAN invece di SEMrush: il valore non è il dato, è il **contesto MENA + l'elaborazione AI**.

---

## 7. Rischi e considerazioni

- **Compliance scraping:** ogni piattaforma ha ToS diversi. LinkedIn e Meta sono i più aggressivi. Strutturare AISCAN come "aggregator di dati pubblici" + disclaimer legale robusto.
- **GDPR & UAE PDPL:** attenzione a non processare dati personali identificabili senza base giuridica, specie con profili individuali LinkedIn.
- **Stabilità actor:** sempre preferire actor con update recenti (<30 giorni) e success rate >90%. Monitorare i ratings post-integrazione.
- **Cost runaway:** senza rate limit interno, un cliente può bruciare migliaia di dollari in compute. Implementare budget cap lato AISCAN.
- **Vendor lock-in Apify:** per feature core, considerare fallback con provider alternativi (Bright Data, PhantomBuster, custom Crawlee deployment su VPS).

---

## 8. Next steps concreti

1. **Shortlist actor** (max 10) da testare nelle prossime 2 settimane con budget $50-100 per validation
2. **Schema normalization document:** definire il formato unificato con cui tutte le fonti entrano in AISCAN
3. **Proof of concept** su 3 fonti Tier 1 (TikTok + LinkedIn + Website Crawler) per una demo interna
4. **Pricing model validation:** testare su 2-3 clienti pilot quale modello (flat vs credit) preferiscono
5. **Compliance review** con legale UAE per definire i limiti di scraping accettabili in ToS di AISCAN

---

**Nota finale:** la vera leva competitiva non sarà quante fonti AISCAN integra, ma quanto velocemente può trasformare dati grezzi in **narrative azionabili**. Ogni fonte aggiunta dovrebbe rispondere alla domanda: *"Quale decisione di marketing permette di prendere che prima era impossibile?"*. Se la risposta non è immediata, probabilmente quella fonte non serve.
