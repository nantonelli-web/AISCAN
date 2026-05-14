# AISCAN — Brief tecnico integrazione nuovi Actor APIfy

## Contesto

AISCAN è già operativo con i canali META, Google Ads e Instagram organico. Questo brief copre **solo** l'estensione del catalogo actor con cinque nuove integrazioni: TikTok, Snapchat, YouTube, Google SERP, Google Maps (places + reviews).

Per ogni nuovo canale segui i pattern già stabiliti nel codebase per i canali esistenti (struttura modulo, gestione credenziali, normalizzazione output, error handling, rate limiting, scheduling, persistenza). Questo brief specifica **cosa** integrare, non **come** — perché il "come" è già nel codice.

---

## Actor da integrare

### 1. TikTok

- **Actor ID**: `clockworks/tiktok-scraper`
- **Pricing model**: pay-per-event
- **Input modes supportati**: profili (username), hashtag, video URL, search query
- **Output principale**: video metadata (URL, views, likes, comments, shares), profile metadata (followers, bio, verified), music metadata, hashtag aggregations
- **Use case AISCAN**: competitor monitoring, hashtag tracking GCC + EU
- **Note operative**:
  - TikTok blocca aggressivamente IP datacenter → abilitare residential proxy negli input dell'actor
  - Country selection necessario per risultati geo-coerenti (rilevante per IT, EN, AR-SA, AR-AE)
  - Frontend TikTok cambia frequentemente: registrare versione actor in uso, alert se changelog dell'actor mostra update >30 giorni vecchio

### 2. Snapchat

- **Actor ID primario**: `automation-lab/snapchat-scraper`
- **Actor ID fallback**: `scrapapi/snapchat-scraper`
- **Pricing model**: pay-per-event (entrambi)
- **Input**: username, @handle, o URL profilo (input flessibile)
- **Output principale**: subscriber count, bio, snapcode, related accounts, stories/highlights URLs
- **Use case AISCAN**: market intelligence GCC (KSA, UAE) — rilevanza limitata fuori da quel mercato
- **Note operative**:
  - Ecosistema Snapchat su Apify è meno maturo di TikTok/YouTube: prevedere un test comparativo iniziale dei due actor su un campione di 50 profili reali, selezionare il primario in base a success rate e completezza dei field stories
  - Lasciare l'actor secondario configurabile come fallback in caso di failure dal primario
  - Output limitato a profili pubblici per design della piattaforma — comunicare nei limiti del modulo

### 3. YouTube

Per YouTube usare un solo actor all-in-one in fase iniziale, con possibilità futura di migrare a pipeline a due actor quando i volumi aumentano.

- **Actor ID**: `runtime/youtube-channel-scraper`
- **Pricing model**: pay-per-event
- **Input**: channel URL, search query (almeno uno dei due richiesto)
- **Output principale**: video metadata, comments, transcripts (con `extract_transcript: true`)
- **Configurazione consigliata**:
  - `video_details: true` quando serve metadata completo (più lento: ~30-60s/video)
  - `extract_transcript: true` solo quando il caso d'uso lo richiede (impatta tempi di run)
  - `transcript_mode: "ui_strict"` per video con caption restrittive
- **Use case AISCAN**: brand monitoring multilingua, competitor channel deep dive, content analysis
- **Note operative**:
  - Apify Proxy incluso, no setup proxy aggiuntivo necessario
  - Senza video_details: 1-2s/video; con video_details: 30-60s/video → impostare timeout coerenti
  - Per pipeline RAG futura (AI Lab), tenere presente che `codepoetry/youtube-transcript-ai-scraper` con field `transcript_llm` pre-pulito è il candidato per migrazione (ha Whisper fallback per video senza caption, supporta 99 lingue inclusi arabo e italiano)

### 4. Google SERP

- **Actor ID**: `apify/google-search-scraper`
- **Pricing model**: pay-per-event
- **Input**: array di query, country, language, maxPagesPerQuery
- **Output principale**: organic results, paid ads, People Also Ask, related queries, featured snippets, knowledge panels, AI overviews
- **Use case AISCAN**: rank tracking multilingua (IT/EN/AR), PAA mining per content brief, competitor SERP positioning
- **Note operative**:
  - Google ha limitato a 10 organic results/pagina: il parametro `resultsPerPage` è ignorato, usare `maxPagesPerQuery` per scalare
  - Combinazione `country` + `language` necessaria per geo-targeting accurato (US/en, IT/it, AE/ar, SA/ar)
  - PAA è un output stream separato dal organic — esporre come categoria filtrabile nel modulo
  - Supporta operatori Google nativi (`site:`, `intitle:`, `"exact match"`, `-minus`)

### 5. Google Maps — Places

- **Actor ID**: `compass/crawler-google-places`
- **Pricing model**: pay-per-event
- **Input**: search query + location, oppure coordinates + radius, oppure custom area (geojson)
- **Output principale**: business name, address, phone, website, category, ratings count, opening hours, place ID, GPS coordinates
- **Use case AISCAN**: retail competitor mapping, lead gen geo-targeted
- **Note operative**:
  - Google Maps limita ~120 risultati per query: per coperture estese, splittare in query multiple per area/categoria
  - Le reviews **non** sono incluse in modo affidabile in questo actor — usare l'actor reviews dedicato (sotto) come step separato
  - Place ID è la chiave di join verso il reviews scraper

### 6. Google Maps — Reviews

- **Actor ID**: `automation-lab/google-maps-reviews-scraper`
- **Pricing model**: pay-per-event
- **Input**: place URLs o place IDs (output naturale dell'actor places)
- **Output principale**: review text, star rating, author info, timestamp, owner replies, immagini review
- **Feature distintiva**: sentiment analysis AI inclusa (positive/negative/neutral/mixed + topic labels), executive summary auto-generato — esporre questi campi nel modulo, sono il valore principale
- **Use case AISCAN**: pre-pitch reputation audit, brand perception analysis, competitor sentiment benchmark
- **Note operative**:
  - HTTP-only (no browser) → veloce, ~1.000 reviews in <60s
  - Parametro `Reviews origin: Google` per evitare contaminazione da TripAdvisor/sorgenti terze
  - Sentiment AI è on-by-default e gratuita (no extra cost) — tenerla abilitata salvo motivi specifici

---

## Schema dati cross-canale

I sei nuovi actor producono schema diversi. Per coerenza con il pattern AISCAN già in uso, normalizzare in ingestion verso lo schema interno esistente. Campi minimi cross-canale da preservare:

- `platform` (tiktok | snapchat | youtube | google_serp | google_maps_places | google_maps_reviews)
- `entity_id` (video ID, profile username, place ID, query hash, review ID a seconda del canale)
- `entity_type` (post | profile | place | review | serp_result)
- `captured_at` (timestamp run)
- `actor_id` e `actor_run_id` (per audit trail e debug)
- `raw_payload` (JSON originale dell'actor, per future re-elaborazioni senza re-scraping)
- Metriche normalizzate quando applicabili (engagement, rating, position)

Lo schema specifico già implementato per META/Google Ads/Instagram è il riferimento — estendere, non sostituire.

---

## Configurazione e credenziali

Tutti gli actor sono accessibili tramite il singolo Apify API token già configurato per AISCAN. Nessuna nuova credenziale per piattaforma è richiesta — non serve YouTube Data API key, Google Cloud project, account Snapchat sviluppatore, o TikTok business verification. L'autenticazione è solo verso Apify.

Variabili d'ambiente da aggiungere se non già presenti:

- `APIFY_API_TOKEN` (probabilmente già esiste)
- `APIFY_DEFAULT_PROXY_GROUPS` (residential per TikTok, GOOGLE_SERP per SERP, default per gli altri)

---

## Ordine di implementazione consigliato

1. **Google SERP** — più semplice, output strutturato regolare, valore immediato per il GEO/SEO multilingua
2. **Google Maps Places + Reviews** — pipeline a due step, pattern simile a integrazioni esistenti, alto valore per pre-pitch audit
3. **TikTok** — actor maturo, pattern simile a Instagram organico già implementato
4. **YouTube** — più articolato per via dei transcript, vale la pena consolidarlo dopo che gli altri tre sono stabili
5. **Snapchat** — per ultimo, richiede fase di test comparativa tra due actor prima di committarsi

---

## Cosa NON fare

- **Non chainare actor diversi in un singolo run**: triggering parallelo via Apify API + normalizzazione downstream è il pattern corretto. Chainare lega failure non correlate.
- **Non hardcodare actor ID nel modulo del canale**: tenerli in config (i publisher rilasciano nuove versioni; deve essere bumpabile senza tocchi al codice).
- **Non assumere schema stabile**: ogni actor ha campi che possono variare tra release. La normalizzazione downstream deve essere defensiva (campi opzionali, default sensibili).
- **Non skippare il raw_payload**: salvare sempre il JSON originale completo. Re-scraping è costoso, re-parsing è gratuito.

---

## Riferimenti tecnici

- Apify API reference: https://docs.apify.com/api/v2
- apify-client (Python): https://docs.apify.com/api/client/python/
- apify-client (Node.js): https://docs.apify.com/api/client/js/
- MCP server pattern (per integrazioni AI future): https://docs.apify.com/platform/integrations/mcp

Per ogni actor, la pagina ufficiale su `https://apify.com/{actor_id}` espone schema input completo, esempi output, e changelog — riferimento canonico in caso di discrepanze tra questo brief e il comportamento reale.
