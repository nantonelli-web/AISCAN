# AISCAN

**La piattaforma di Competitive Intelligence pubblicitaria multi-canale per brand, agenzie e team marketing.**

> Scansiona, confronta, decidi. Dalla raccolta dati al delta % vs il trimestre precedente, in un unico tool.

---

## Il problema

Oggi il monitoring dei competitor nel paid advertising è frammentato in dieci tool diversi: una libreria per Meta, una per Google Ads, uno scraper per TikTok, un altro per i ranking SERP. Ogni team marketing perde **ore a settimana** a copiare-incollare screenshot, ricostruire timeline manualmente, esportare CSV che dopo due giorni sono già obsoleti.

Il risultato? **Decisioni di posizionamento e budget prese al buio**, basate su una visione parziale dei competitor. Quando finalmente arrivano i numeri, la campagna del competitor è già passata.

## La soluzione

AISCAN consolida la competitive intelligence pubblicitaria di **8 canali** in un'unica piattaforma, con scrape automatici, benchmark cross-brand, analisi AI e confronti period-vs-period. Niente più tab aperte ovunque, niente più CSV scollegati: ogni dato è interrogabile, esportabile e confrontabile in tempo reale.

---

## Cosa puoi fare con AISCAN

### Vedere TUTTI i creativi attivi di un competitor in un colpo solo

- **Meta Ads** (Facebook + Instagram), **Google Ads**, **TikTok Ads**, **Snapchat Ads** — ogni creativo con copy, immagine/video, CTA, landing url, paesi target, status (attivo/non attivo), durata, format
- **Instagram organico**, **TikTok organico**, **YouTube**, **Snapchat profile** — post, video, engagement, hashtag, collaborazioni
- **Google SERP** + **Google Maps** — ranking organico/paid per query, posizione del brand su mappa

### Filtrare e segmentare con criteri pubblicitari professionali

Per ogni brand puoi navigare:
- **Per canale** (paid / organico / monitoring)
- **Per paese** (multi-country selection)
- **Per periodo** (date range arbitrario + shortcut Ultimi 7/14/30/90 giorni)
- **Per stato** (attivi / non attivi)
- **Per tipologia di campagna Google** (Performance Max / Demand Gen / Search / YouTube — euristica inferita da `surfaceServingStats`)

### Confrontare brand fianco a fianco (Compare)

Selezioni 2-3 brand e ottieni:
- **Analisi tecnica** affiancata (totale ads, format mix, CTA top, paesi target, refresh rate)
- **AI Copy Analysis** (DeepSeek): tono di voce, copy style, trigger emotivi, pattern CTA, punti di forza/debolezza per ogni brand + comparazione narrativa
- **AI Creative Analysis** (Gemini multimodal): stile visivo, palette colori, fotografia, coerenza brand, consigli azionabili
- Esportazione PPTX pronta per la presentazione cliente

### Benchmark contro il peer set

`/benchmarks` aggrega tutti i tuoi competitor in un unico cruscotto: volume ads per brand, format mix, top CTA, audience EU (DSA), UTM-derived audience+objective inference, distribuzione paesi, durata media campagne. Filtra per progetto (cliente), paese, periodo, stato.

### Confronto period-vs-period con delta % colorato

Nuova fila di KPI con confronto al periodo precedente per ogni canale:

| Canale | KPI confrontabili |
|---|---|
| Instagram | Follower (snapshot), Post organici, Media likes, Media commenti, Views totali, Post in collab |
| TikTok | Follower, Post nel periodo, Media likes, Media commenti, Total plays, Post collab |
| YouTube | Subscriber, Video nel periodo, Media likes, Media commenti, Total views |
| Snapchat | Subscriber, Snapshot nel periodo |
| Meta / Google | Totale ads, attive, durata media |

Delta % automatico in verde (positivo) o rosso (negativo) accanto a ogni numero, con il valore di confronto fra parentesi. Per i follower usiamo uno **storico snapshot** che cresce a ogni scan: il trend di crescita / decrescita è visibile anche retroattivamente.

### AI Performance Analysis

Carica un report Meta Ads / Google Ads via CSV: l'AI legge i numeri, identifica anomalie, suggerisce ottimizzazioni concrete con riferimenti a metriche specifiche (CPM, CPC, ROAS, frequenza, reach).

### Sub-brand attribution intelligente

Brand parent + URL pattern regex: gli ads sotto un dominio padre vengono **automaticamente attribuiti** al sub-brand giusto (es. Persona è figlio di Marina Rinaldi ma vive sotto marinarinaldi.com → i suoi ads vengono spostati nel sub-brand dopo lo scan, con regex `/persona([/?-]|$)`).

### MCP Server per Claude Desktop / Cursor

Server MCP read-only con OAuth 2.1 + PKCE: collega Claude Desktop al tuo workspace e fai domande in linguaggio naturale ai tuoi dati. 8 tool read-only su brand, ads, benchmarks, performance.

---

## Canali coperti

| Canale | Cosa | Frequenza scan |
|---|---|---|
| **Meta Ads** | Library DSA EU + non-EU via Apify silva95gustavo + memo23 | Manuale / Daily / Weekly |
| **Google Ads** | Transparency Centre (PMax, Demand Gen, Search, YouTube, Display) via memo23 + silva | Manuale / Daily / Weekly |
| **Instagram** organico | Post, engagement, hashtag, collaborazioni, follower trend | Manuale / Daily / Weekly |
| **TikTok** | Post organici + ads (DSA library + Creative Center via silva95gustavo + beyondops) | Manuale / Daily / Weekly |
| **Snapchat** | Profile snapshot + paid ads (Snap official DSA REST API, gratuito) | Manuale / Daily / Weekly |
| **YouTube** | Canale + video, subscriber trend | Manuale / Daily / Weekly |
| **Google SERP** | Ranking organico + paid per query, AI overview detection | Per query |
| **Google Maps** | POI scrape via Nominatim geocoding (anti bot-detection) | Per query |

---

## Use case

### Brand strategy team
- **Quanto investono i competitor su Google Search rispetto a PMax?** → Distribuzione "Tipologia campagna" su /benchmarks?channel=google
- **Marina Rinaldi sta perdendo follower in Germania?** → Brand detail → Instagram tab → Confronto con periodo precedente → delta % automatico
- **Quali sono i CTA che funzionano in questo verticale?** → Top CTA per brand su Benchmarks

### Agenzia / Account manager
- **Compare cliente vs 2 competitor** in un PPTX brandizzato pronto per la riunione del lunedì → /brands/compare → Export PPTX
- **Refresh rate**: il cliente è "freddo" rispetto al peer set? → Compare technical analysis → Refresh rate column
- **Quante creatività ha pubblicato il competitor X nelle ultime 4 settimane vs le 4 prima?** → Brand detail → Date range + Confronta con altro periodo

### Performance team
- **Carica il CSV Meta Ads** → AI Performance Analysis suggerisce dove i $$ stanno volando e dove ottimizzare
- **Monitoraggio settimanale automatico**: schedule scan daily/weekly per ogni brand → ricevi sempre i dati freschi

### Research / Insight team
- **Sub-brand reali vs fittizi**: Persona, Marella, Persona by Marina Rinaldi — la piattaforma riconosce automaticamente le relazioni padre/figlio
- **Cosa fa Google nascondere**: per gli ads sotto soglia impressioni Google non pubblica i `surfaceServingStats` → la piattaforma li flagga separatamente con confidence label

---

## Novità recenti

### Confronto period-vs-period con delta KPI

Su tutti i canali organici (Instagram, TikTok, YouTube, Snapchat) ora puoi confrontare due intervalli temporali arbitrari. Ogni KPI mostra il delta % colorato + il valore del periodo di confronto. Per i follower usiamo uno **storico snapshot** che si arricchisce a ogni scan: anche il trend del seguito è confrontabile retroattivamente.

### Loghi brand ufficiali

I loghi dei canali (Meta, Instagram, TikTok, Snapchat, YouTube, Google Ads, Google Maps) sono renderizzati con i path brand-mark autorevoli da **simple-icons** — multicolor, sempre aggiornati quando i brand restilizzano.

### Sub-brand attribution con UI dedicata

Configura un `parent_brand_id` e una lista di regex su `landing_url`: dopo lo scan, gli ads del parent che matchano i pattern vengono ri-assegnati al sub-brand. La UI mostra i sub-brand correttamente separati nei filtri, nei conteggi e nelle analisi.

### Google PMax / Demand Gen classification (BETA)

Heuristica che inferisce il tipo di campagna Google da `regionStats[].surfaceServingStats[]` + format fallback. Validata su sample 500 ads workspace utente: 35% high confidence, 65% low confidence (con etichetta "probabile"). Disponibile in Benchmarks Google + ad-card badge.

### Guida flusso brand-detail

Nuovo onboarding visivo in 3 step affiancati (Scan → Interrogazione → Risultati) per orientare immediatamente l'utente che entra nella pagina brand. Niente più "dove devo cliccare?".

### MCP Server v1

8 tool read-only via OAuth 2.1 + PKCE: `list_brands`, `get_brand_detail`, `search_brand`, `list_ads`, `get_benchmarks`, `list_perf_imports`, `get_perf_dashboard`, `get_perf_analysis`. Compatibile con Claude Desktop e Cursor. Setup da `/settings/mcp`.

---

## Architettura tecnologica

- **Frontend**: Next.js 15 (App Router, RSC, Suspense streaming), React 19, Tailwind v4
- **Backend**: Supabase (Postgres + RLS multi-tenant + Auth + Storage)
- **Scraping**: Apify (silva95gustavo, memo23, brilliant_gum, beyondops, clockworks, streamers — selezionati per autorevolezza + freschezza dati)
- **AI**: OpenRouter (DeepSeek per Copy, Gemini 2.0 Flash per Creative multimodal, AI tiering selezionabile dall'utente: 1/3/8 crediti)
- **API ufficiali**: Snapchat DSA REST API (gratuita), Nominatim per geocoding
- **Standard di sicurezza**: OAuth 2.1 con PKCE obbligatorio S256, RLS workspace-scoped, audit security periodico

Multi-tenant by design: ogni workspace ha i suoi brand, le sue scan history, le sue analisi AI. Nessun data leak cross-tenant.

---

## Modello

**Subscription-based con tier di crediti per le funzionalità AI / scrape pesanti**:

- Scan canali (Apify + API): consumo crediti per ogni scan, varia per canale e maxItems
- AI Copy / Creative analysis: tier cheap (1cr) / pragmatic (3cr) / premium (8cr), selezionabile dall'utente
- AI Performance analysis: stesso modello

Workspace **BYO key**: organizzazioni enterprise possono usare la propria chiave Apify + OpenRouter per pagare direttamente i provider sotto.

---

## Per chi è AISCAN

- **Agenzie creative e di performance** che gestiscono 5-50 brand e devono produrre report di competitive intelligence a cadenza ricorrente
- **Team in-house marketing** di brand fashion / luxury / lifestyle / DTC che vogliono monitorare il peer set senza affidarsi a tool generalisti come SimilarWeb o SEMrush
- **Research / Insight team** che vogliono dati granulari (per paese, per format, per CTA) esportabili in PPTX/CSV per ricerche qualitative

---

## Call to action

Per una demo, contattaci. Per provare AISCAN: registrati su `aiscan.biz`, configura il tuo primo brand, lancia uno scan, esplora i risultati. La prima settimana sui dati di un competitor che già conosci è il modo migliore per capire la profondità del tool.

---

*AISCAN — NIMA Digital, 2026.*
